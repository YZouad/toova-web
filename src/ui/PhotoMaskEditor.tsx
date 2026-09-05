import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlphaUndoStack,
  applyBrushStroke,
  copyAlphaChannel,
  mergeAlphaIntoRgba,
  type AlphaMask,
  type BrushMode,
} from '../lib/maskBrush';
import {
  loadRgbaFromBlob,
  renderOutlinedPreview,
  rgbaToCutoutBlob,
} from '../lib/preparePhotoForTrellis';

export interface PhotoMaskEditorProps {
  cutout: Blob;
  disabled?: boolean;
  onCutoutChange: (blob: Blob) => void;
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

function drawSubjectPreview(
  ctx: CanvasRenderingContext2D,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  const layer = ctx.createImageData(width, height);
  layer.data.set(rgba);
  ctx.putImageData(layer, 0, 0);
}

/**
 * Brush editor for the auto-isolated cutout. Edits alpha only — erase drops leftover
 * background; restore brings back parts the model removed.
 */
export function PhotoMaskEditor({
  cutout,
  disabled = false,
  onCutoutChange,
}: PhotoMaskEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rgbaRef = useRef<Uint8ClampedArray | null>(null);
  const alphaRef = useRef<AlphaMask | null>(null);
  const initialAlphaRef = useRef<AlphaMask | null>(null);
  const undoRef = useRef(new AlphaUndoStack());
  const paintingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<BrushMode>('erase');
  const [brushSize, setBrushSize] = useState(24);
  const [canUndo, setCanUndo] = useState(false);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

  const syncUndo = () => setCanUndo(undoRef.current.canUndo);

  const paintCanvas = useCallback(async (withOutline: boolean) => {
    const canvas = canvasRef.current;
    const rgba = rgbaRef.current;
    if (!canvas || !rgba || !dimensions) return;

    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (withOutline) {
      const preview = await renderOutlinedPreview(rgba, dimensions.width, dimensions.height);
      const bitmap = await createImageBitmap(preview);
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      return;
    }

    drawSubjectPreview(ctx, rgba, dimensions.width, dimensions.height);
  }, [dimensions]);

  const exportCutout = useCallback(async () => {
    const rgba = rgbaRef.current;
    if (!rgba || !dimensions) return;
    const blob = await rgbaToCutoutBlob(rgba, dimensions.width, dimensions.height);
    onCutoutChange(blob);
  }, [dimensions, onCutoutChange]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    undoRef.current.clear();
    syncUndo();

    void loadRgbaFromBlob(cutout)
      .then(({ data, width, height }) => {
        if (cancelled) return;
        const initialAlpha = copyAlphaChannel(data);
        const alpha = copyAlphaChannel(data);
        const rgba = new Uint8ClampedArray(data);

        rgbaRef.current = rgba;
        alphaRef.current = alpha;
        initialAlphaRef.current = initialAlpha;
        setDimensions({ width, height });
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
  }, [cutout]);

  useEffect(() => {
    if (loading || !dimensions) return;
    void paintCanvas(true).then(() => void exportCutout());
  }, [loading, dimensions, paintCanvas, exportCutout]);

  const strokeBetween = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const alpha = alphaRef.current;
    const initialAlpha = initialAlphaRef.current;
    const rgba = rgbaRef.current;
    if (!alpha || !initialAlpha || !rgba || !dimensions) return;

    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(dist / Math.max(2, brushSize * 0.35)));
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      applyBrushStroke(
        alpha,
        initialAlpha,
        dimensions.width,
        dimensions.height,
        from.x + (to.x - from.x) * t,
        from.y + (to.y - from.y) * t,
        brushSize / 2,
        mode,
      );
    }
    mergeAlphaIntoRgba(rgba, alpha);
  };

  const beginStroke = (point: { x: number; y: number }) => {
    const alpha = alphaRef.current;
    if (!alpha) return;
    undoRef.current.push(alpha);
    syncUndo();
    paintingRef.current = true;
    lastPointRef.current = point;
    strokeBetween(point, point);
    void paintCanvas(false);
  };

  const continueStroke = (point: { x: number; y: number }) => {
    const last = lastPointRef.current;
    if (!paintingRef.current || !last) return;
    strokeBetween(last, point);
    lastPointRef.current = point;
    void paintCanvas(false);
  };

  const endStroke = () => {
    if (!paintingRef.current) return;
    paintingRef.current = false;
    lastPointRef.current = null;
    void paintCanvas(true).then(() => void exportCutout());
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
    alphaRef.current = restored;
    mergeAlphaIntoRgba(rgba, restored);
    syncUndo();
    void paintCanvas(true).then(() => void exportCutout());
  };

  const handleReset = () => {
    const initialAlpha = initialAlphaRef.current;
    const rgba = rgbaRef.current;
    if (!initialAlpha || !rgba) return;
    undoRef.current.push(copyAlphaChannel(rgba));
    syncUndo();
    alphaRef.current = copyAlphaChannel(initialAlpha);
    mergeAlphaIntoRgba(rgba, alphaRef.current);
    void paintCanvas(true).then(() => void exportCutout());
  };

  return (
    <div className="photo-prep__mask-editor">
      <div className="photo-prep__mask-tools">
        <div className="photo-prep__mask-modes">
          <button
            type="button"
            className={`photo-prep__btn${mode === 'erase' ? ' is-active' : ''}`}
            disabled={disabled || loading}
            onClick={() => setMode('erase')}
          >
            Erase
          </button>
          <button
            type="button"
            className={`photo-prep__btn${mode === 'restore' ? ' is-active' : ''}`}
            disabled={disabled || loading}
            onClick={() => setMode('restore')}
          >
            Restore
          </button>
        </div>

        <label className="photo-prep__mask-brush">
          <span>Brush</span>
          <input
            type="range"
            min={8}
            max={64}
            step={1}
            value={brushSize}
            disabled={disabled || loading}
            onChange={(e) => setBrushSize(Number(e.target.value))}
          />
          <span className="photo-prep__mask-brush-value">{brushSize}px</span>
        </label>

        <div className="photo-prep__mask-actions">
          <button
            type="button"
            className="photo-prep__btn photo-prep__btn--quiet"
            disabled={disabled || loading || !canUndo}
            onClick={handleUndo}
          >
            Undo
          </button>
          <button
            type="button"
            className="photo-prep__btn photo-prep__btn--quiet"
            disabled={disabled || loading}
            onClick={handleReset}
          >
            Reset mask
          </button>
        </div>
      </div>

      <div className="photo-prep__frame photo-prep__frame--mask">
        {loading ? (
          <span className="photo-prep__frame--empty">Loading the cutout…</span>
        ) : (
          <canvas
            ref={canvasRef}
            className="photo-prep__mask-canvas"
            aria-label="Paint to erase or restore parts of the detected subject"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
        )}
      </div>

      {error ? <p className="photo-prep__error">{error}</p> : null}
    </div>
  );
}
