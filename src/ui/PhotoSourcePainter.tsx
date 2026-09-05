import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  applyRgbBrushStroke,
  hexToRgb,
  RgbaUndoStack,
  type BrushMode,
} from '../lib/maskBrush';
import { debounce, drawRgba, ensureCanvasSize, rafThrottle } from '../lib/photoBrushCanvas';
import { loadRgbaFromBlob, rgbaToCutoutBlob } from '../lib/preparePhotoForTrellis';
import { DEFAULT_PAINT_COLOR, PhotoBrushTools } from './PhotoBrushTools';

export interface PhotoSourcePainterProps {
  /** Snapshot when the paint session opened — kept stable until the session ends. */
  source: Blob;
  disabled?: boolean;
  onSourceChange: (blob: Blob) => void;
}

export interface PhotoSourcePainterHandle {
  exportNow: () => Promise<void>;
}

function pointerToImage(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
): { x: number; y: number } | null {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const x = ((clientX - rect.left) / rect.width) * canvas.width;
  const y = ((clientY - rect.top) / rect.height) * canvas.height;
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null;
  return { x, y };
}

/**
 * Pre-isolation brush editor. Erase paints white; Paint uses a chosen color;
 * Restore brings back the original pixels.
 */
export const PhotoSourcePainter = forwardRef<PhotoSourcePainterHandle, PhotoSourcePainterProps>(
  function PhotoSourcePainter({ source, disabled = false, onSourceChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rgbaRef = useRef<Uint8ClampedArray | null>(null);
    const initialRgbaRef = useRef<Uint8ClampedArray | null>(null);
    const undoRef = useRef(new RgbaUndoStack());
    const paintingRef = useRef(false);
    const lastPointRef = useRef<{ x: number; y: number } | null>(null);
    const dimensionsRef = useRef<{ width: number; height: number } | null>(null);
    const onSourceChangeRef = useRef(onSourceChange);
    onSourceChangeRef.current = onSourceChange;

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [mode, setMode] = useState<BrushMode>('erase');
    const [brushSize, setBrushSize] = useState(24);
    const [paintColor, setPaintColor] = useState<string>(DEFAULT_PAINT_COLOR);
    const [canUndo, setCanUndo] = useState(false);

    const syncUndo = () => setCanUndo(undoRef.current.canUndo);

    const paintCanvas = useCallback(() => {
      const canvas = canvasRef.current;
      const rgba = rgbaRef.current;
      const dimensions = dimensionsRef.current;
      if (!canvas || !rgba || !dimensions) return;

      ensureCanvasSize(canvas, dimensions.width, dimensions.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      drawRgba(ctx, rgba, dimensions.width, dimensions.height);
    }, []);

    const exportSource = useCallback(async () => {
      const rgba = rgbaRef.current;
      const dimensions = dimensionsRef.current;
      if (!rgba || !dimensions) return;
      const blob = await rgbaToCutoutBlob(rgba, dimensions.width, dimensions.height);
      onSourceChangeRef.current(blob);
    }, []);

    const debouncedExport = useRef(debounce(() => void exportSource(), 400));

    useImperativeHandle(ref, () => ({ exportNow: exportSource }), [exportSource]);

    const scheduleRepaint = useRef(rafThrottle(() => paintCanvas()));

    useEffect(() => {
      let cancelled = false;
      setLoading(true);
      setError(null);
      undoRef.current.clear();
      syncUndo();

      void loadRgbaFromBlob(source)
        .then(({ data, width, height }) => {
          if (cancelled) return;
          const rgba = new Uint8ClampedArray(data);
          rgbaRef.current = rgba;
          initialRgbaRef.current = new Uint8ClampedArray(data);
          dimensionsRef.current = { width, height };
          setLoading(false);
        })
        .catch((err) => {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : 'Could not load the photo.');
          setLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }, [source]);

    useEffect(() => {
      if (loading || !dimensionsRef.current) return;
      paintCanvas();
    }, [loading, paintCanvas]);

    const strokeBetween = (from: { x: number; y: number }, to: { x: number; y: number }) => {
      const rgba = rgbaRef.current;
      const initialRgba = initialRgbaRef.current;
      const dimensions = dimensionsRef.current;
      if (!rgba || !initialRgba || !dimensions) return;

      const color = hexToRgb(paintColor);
      const dist = Math.hypot(to.x - from.x, to.y - from.y);
      const steps = Math.max(1, Math.ceil(dist / Math.max(2, brushSize * 0.35)));
      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        applyRgbBrushStroke(
          rgba,
          initialRgba,
          dimensions.width,
          dimensions.height,
          from.x + (to.x - from.x) * t,
          from.y + (to.y - from.y) * t,
          brushSize / 2,
          mode,
          color,
        );
      }
    };

    const beginStroke = (point: { x: number; y: number }) => {
      const rgba = rgbaRef.current;
      if (!rgba) return;
      undoRef.current.push(new Uint8ClampedArray(rgba));
      syncUndo();
      paintingRef.current = true;
      lastPointRef.current = point;
      strokeBetween(point, point);
      paintCanvas();
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
      paintCanvas();
      debouncedExport.current();
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (disabled || loading) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      const point = pointerToImage(event.clientX, event.clientY, canvas);
      if (!point) return;
      beginStroke(point);
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!paintingRef.current || disabled || loading) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const point = pointerToImage(event.clientX, event.clientY, canvas);
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
      const restored = undoRef.current.pop();
      const rgba = rgbaRef.current;
      if (!restored || !rgba) return;
      rgba.set(restored);
      syncUndo();
      paintCanvas();
      debouncedExport.current();
    };

    const handleReset = () => {
      const initialRgba = initialRgbaRef.current;
      const rgba = rgbaRef.current;
      if (!initialRgba || !rgba) return;
      undoRef.current.push(new Uint8ClampedArray(rgba));
      syncUndo();
      rgba.set(initialRgba);
      paintCanvas();
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
          resetLabel="Reset paint"
          onModeChange={setMode}
          onBrushSizeChange={setBrushSize}
          onPaintColorChange={setPaintColor}
          onUndo={handleUndo}
          onReset={handleReset}
        />

        <div className="photo-prep__frame photo-prep__frame--mask">
          <canvas
            ref={canvasRef}
            className={`photo-prep__mask-canvas${loading ? ' photo-prep__mask-canvas--loading' : ''}`}
            aria-label="Paint to cover or mark parts of the photo before isolation"
            aria-busy={loading}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
          {loading ? (
            <span className="photo-prep__frame-loading">Loading the photo…</span>
          ) : null}
        </div>

        {error ? <p className="photo-prep__error">{error}</p> : null}
      </div>
    );
  },
);
