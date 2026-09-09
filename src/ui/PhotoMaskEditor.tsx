import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  AlphaUndoStack,
  applyRgbaBrushStroke,
  copyAlphaChannel,
  hexToRgb,
  RgbaUndoStack,
  type AlphaMask,
  type BrushMode,
} from '../lib/maskBrush';
import { pointerToNaturalPixels } from '../lib/cropPixels';
import { debounce, drawOutlineOverlay, drawRgbaOnWhite, ensureCanvasSize, rafThrottle } from '../lib/photoBrushCanvas';
import { loadRgbaFromBlob, rgbaToCutoutBlob } from '../lib/preparePhotoForTrellis';
import { DEFAULT_PAINT_COLOR, PhotoBrushTools } from './PhotoBrushTools';

export interface PhotoMaskEditorProps {
  /** Initial cutout — kept stable for the session; do not pass edited blobs back in. */
  cutout: Blob;
  disabled?: boolean;
  onCutoutChange: (blob: Blob) => void;
}

export interface PhotoMaskEditorHandle {
  exportNow: () => Promise<void>;
}

/**
 * Brush editor for the auto-isolated cutout. Erase drops leftover background;
 * Paint fills with a chosen color; Restore brings back parts the model removed.
 */
export const PhotoMaskEditor = forwardRef<PhotoMaskEditorHandle, PhotoMaskEditorProps>(
  function PhotoMaskEditor({ cutout, disabled = false, onCutoutChange }, ref) {
    const baseRef = useRef<HTMLCanvasElement>(null);
    const outlineRef = useRef<HTMLCanvasElement>(null);
    const rgbaRef = useRef<Uint8ClampedArray | null>(null);
    const initialRgbaRef = useRef<Uint8ClampedArray | null>(null);
    const alphaRef = useRef<AlphaMask | null>(null);
    const initialAlphaRef = useRef<AlphaMask | null>(null);
    const alphaUndoRef = useRef(new AlphaUndoStack());
    const rgbaUndoRef = useRef(new RgbaUndoStack());
    const paintingRef = useRef(false);
    const lastPointRef = useRef<{ x: number; y: number } | null>(null);
    const dimensionsRef = useRef<{ width: number; height: number } | null>(null);
    const onCutoutChangeRef = useRef(onCutoutChange);
    onCutoutChangeRef.current = onCutoutChange;

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [mode, setMode] = useState<BrushMode>('erase');
    const [brushSize, setBrushSize] = useState(24);
    const [paintColor, setPaintColor] = useState<string>(DEFAULT_PAINT_COLOR);
    const [canUndo, setCanUndo] = useState(false);

    const syncUndo = useCallback(() => {
      setCanUndo(alphaUndoRef.current.canUndo || rgbaUndoRef.current.canUndo);
    }, []);

    const paintBase = useCallback(() => {
      const canvas = baseRef.current;
      const rgba = rgbaRef.current;
      const dimensions = dimensionsRef.current;
      if (!canvas || !rgba || !dimensions) return;

      ensureCanvasSize(canvas, dimensions.width, dimensions.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      drawRgbaOnWhite(ctx, rgba, dimensions.width, dimensions.height);
    }, []);

    const paintOutline = useCallback(() => {
      const canvas = outlineRef.current;
      const rgba = rgbaRef.current;
      const dimensions = dimensionsRef.current;
      if (!canvas || !rgba || !dimensions) return;

      ensureCanvasSize(canvas, dimensions.width, dimensions.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      drawOutlineOverlay(ctx, rgba, dimensions.width, dimensions.height);
    }, []);

    const setOutlineVisible = useCallback((visible: boolean) => {
      const canvas = outlineRef.current;
      if (!canvas) return;
      canvas.style.opacity = visible ? '1' : '0';
    }, []);

    const exportCutout = useCallback(async () => {
      const rgba = rgbaRef.current;
      const dimensions = dimensionsRef.current;
      if (!rgba || !dimensions) return;
      const blob = await rgbaToCutoutBlob(rgba, dimensions.width, dimensions.height);
      onCutoutChangeRef.current(blob);
    }, []);

    const debouncedExport = useRef(debounce(() => void exportCutout(), 400));

    useImperativeHandle(ref, () => ({ exportNow: exportCutout }), [exportCutout]);

    const scheduleRepaint = useRef(rafThrottle(() => {
      paintBase();
    }));

    useEffect(() => {
      let cancelled = false;
      setLoading(true);
      setError(null);
      alphaUndoRef.current.clear();
      rgbaUndoRef.current.clear();
      syncUndo();

      void loadRgbaFromBlob(cutout)
        .then(({ data, width, height }) => {
          if (cancelled) return;
          const initialAlpha = copyAlphaChannel(data);
          const alpha = copyAlphaChannel(data);
          const rgba = new Uint8ClampedArray(data);

          rgbaRef.current = rgba;
          initialRgbaRef.current = new Uint8ClampedArray(data);
          alphaRef.current = alpha;
          initialAlphaRef.current = initialAlpha;
          dimensionsRef.current = { width, height };
          setLoading(false);
        })
        .catch((err) => {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : 'Could not load the cutout.');
          setLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }, [cutout, syncUndo]);

    useEffect(() => {
      if (loading || !dimensionsRef.current) return;
      paintBase();
      paintOutline();
      setOutlineVisible(true);
      void exportCutout();
    }, [loading, paintBase, paintOutline, setOutlineVisible, exportCutout]);

    const strokeBetween = (from: { x: number; y: number }, to: { x: number; y: number }) => {
      const rgba = rgbaRef.current;
      const initialRgba = initialRgbaRef.current;
      const initialAlpha = initialAlphaRef.current;
      const dimensions = dimensionsRef.current;
      if (!rgba || !initialRgba || !initialAlpha || !dimensions) return;

      const color = hexToRgb(paintColor);
      const dist = Math.hypot(to.x - from.x, to.y - from.y);
      const steps = Math.max(1, Math.ceil(dist / Math.max(2, brushSize * 0.35)));
      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        applyRgbaBrushStroke(
          rgba,
          initialRgba,
          initialAlpha,
          dimensions.width,
          dimensions.height,
          from.x + (to.x - from.x) * t,
          from.y + (to.y - from.y) * t,
          brushSize / 2,
          mode,
          color,
        );
      }
      if (alphaRef.current) {
        alphaRef.current = copyAlphaChannel(rgba);
      }
    };

    const beginStroke = (point: { x: number; y: number }) => {
      const rgba = rgbaRef.current;
      const alpha = alphaRef.current;
      if (!rgba || !alpha) return;
      if (mode === 'paint') {
        rgbaUndoRef.current.push(new Uint8ClampedArray(rgba));
      } else {
        alphaUndoRef.current.push(new Uint8ClampedArray(alpha));
      }
      syncUndo();
      paintingRef.current = true;
      lastPointRef.current = point;
      setOutlineVisible(false);
      strokeBetween(point, point);
      paintBase();
    };

    const continueStroke = (point: { x: number; y: number }) => {
      const last = lastPointRef.current;
      if (!paintingRef.current || !last) return;
      strokeBetween(last, point);
      lastPointRef.current = point;
      scheduleRepaint.current();
    };

    const endStroke = () => {
      if (!paintingRef.current) return;
      paintingRef.current = false;
      lastPointRef.current = null;
      paintBase();
      paintOutline();
      setOutlineVisible(true);
      debouncedExport.current();
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (disabled || loading) return;
      const canvas = baseRef.current;
      if (!canvas) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      const point = pointerToNaturalPixels(event.clientX, event.clientY, canvas);
      if (!point) return;
      beginStroke(point);
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!paintingRef.current || disabled || loading) return;
      const canvas = baseRef.current;
      if (!canvas) return;
      const point = pointerToNaturalPixels(event.clientX, event.clientY, canvas);
      if (!point) return;
      continueStroke(point);
    };

    const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      endStroke();
    };

    const handleUndo = () => {
      const rgba = rgbaRef.current;
      if (!rgba) return;

      const rgbaRestored = rgbaUndoRef.current.pop();
      if (rgbaRestored) {
        rgba.set(rgbaRestored);
        alphaRef.current = copyAlphaChannel(rgba);
        syncUndo();
        paintBase();
        paintOutline();
        debouncedExport.current();
        return;
      }

      const alphaRestored = alphaUndoRef.current.pop();
      if (!alphaRestored) return;
      alphaRef.current = alphaRestored;
      for (let px = 0; px < alphaRestored.length; px += 1) {
        rgba[px * 4 + 3] = alphaRestored[px];
      }
      syncUndo();
      paintBase();
      paintOutline();
      debouncedExport.current();
    };

    const handleReset = () => {
      const initialRgba = initialRgbaRef.current;
      const initialAlpha = initialAlphaRef.current;
      const rgba = rgbaRef.current;
      if (!initialRgba || !initialAlpha || !rgba) return;
      rgbaUndoRef.current.push(new Uint8ClampedArray(rgba));
      alphaUndoRef.current.push(copyAlphaChannel(rgba));
      syncUndo();
      rgba.set(initialRgba);
      alphaRef.current = copyAlphaChannel(initialAlpha);
      paintBase();
      paintOutline();
      debouncedExport.current();
    };

    return (
      <div className="photo-prep__mask-editor">
        <PhotoBrushTools
          mode={mode}
          brushSize={brushSize}
          paintColor={paintColor}
          canUndo={canUndo}
          disabled={disabled || loading}
          resetLabel="Reset mask"
          onModeChange={setMode}
          onBrushSizeChange={setBrushSize}
          onPaintColorChange={setPaintColor}
          onUndo={handleUndo}
          onReset={handleReset}
        />

        <div className="photo-prep__frame photo-prep__frame--mask">
          <div className={`photo-prep__brush-stage${loading ? ' photo-prep__brush-stage--loading' : ''}`}>
            <canvas
              ref={baseRef}
              className="photo-prep__mask-canvas photo-prep__mask-canvas--base"
              aria-label="Paint to erase or restore parts of the detected subject"
              aria-busy={loading}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              onPointerCancel={handlePointerUp}
            />
            <canvas
              ref={outlineRef}
              className="photo-prep__mask-canvas photo-prep__mask-canvas--outline"
              aria-hidden
            />
          </div>
          {loading ? (
            <span className="photo-prep__frame-loading">Loading the cutout…</span>
          ) : null}
        </div>

        {error ? <p className="photo-prep__error">{error}</p> : null}
      </div>
    );
  },
);
