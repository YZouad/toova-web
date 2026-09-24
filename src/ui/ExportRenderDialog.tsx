import { useMemo, useState } from 'react';
import type { SceneHandle, CaptureOptions } from '../scene/Scene';
import type { CameraPresetId } from '../store';
import { featureFlag, featureLimit, useEntitlements } from '../hooks/useEntitlements';
import { trackLimitReached } from '../lib/analytics';
import { navigate, pricingPath } from '../hooks/useRoute';
import { Button } from './kit/Button';
import { Field } from './kit/Field';
import { Gate } from './kit/Gate';
import { Modal } from './kit/Modal';
import { Select } from './kit/Select';
import { Spinner } from './kit/Spinner';

type ExportPreset = 'catalog' | 'square' | 'topDown';

const PRESETS: Record<
  ExportPreset,
  { label: string; width: number; height: number; cameraPreset: CameraPresetId }
> = {
  catalog: { label: 'Catalog 1920×1080', width: 1920, height: 1080, cameraPreset: 'catalog' },
  square: { label: 'Share square 1080×1080', width: 1080, height: 1080, cameraPreset: 'corner' },
  topDown: { label: 'Top-down plan 1600×1600', width: 1600, height: 1600, cameraPreset: 'topDown' },
};

interface ExportRenderDialogProps {
  sceneRef: React.RefObject<SceneHandle | null>;
  onClose: () => void;
}

async function applyExportLimits(
  blob: Blob,
  opts: { maxPx: number | null; watermark: boolean },
): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  let { width, height } = bitmap;
  const longest = Math.max(width, height);
  if (opts.maxPx != null && longest > opts.maxPx) {
    const scale = opts.maxPx / longest;
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return blob;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  if (opts.watermark) {
    ctx.save();
    ctx.font = `600 ${Math.max(14, Math.round(width * 0.035))}px system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    const text = 'toova.net';
    const metrics = ctx.measureText(text);
    const x = width - metrics.width - 16;
    const y = height - 16;
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (out) => (out ? resolve(out) : reject(new Error('Could not encode export'))),
      blob.type || 'image/png',
      0.92,
    );
  });
}

export function ExportRenderDialog({ sceneRef, onClose }: ExportRenderDialogProps) {
  const { entitlements } = useEntitlements();
  const maxPx = featureLimit(entitlements, 'export_max_px');
  const watermark = featureFlag(entitlements, 'export_watermark');
  const [preset, setPreset] = useState<ExportPreset>('catalog');
  const [format, setFormat] = useState<'image/png' | 'image/jpeg'>('image/png');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const presetBlocked = useMemo(() => {
    if (maxPx == null) return false;
    const p = PRESETS[preset];
    return Math.max(p.width, p.height) > maxPx * 1.5;
  }, [maxPx, preset]);

  async function handleExport() {
    const scene = sceneRef.current;
    if (!scene) {
      setError('Scene not ready');
      return;
    }
    if (presetBlocked) {
      trackLimitReached({ limit_type: 'render_quality' });
      setError('This export size needs a higher plan. Upgrade or pick a smaller preset.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const p = PRESETS[preset];
      let width = p.width;
      let height = p.height;
      if (maxPx != null) {
        const longest = Math.max(width, height);
        if (longest > maxPx) {
          const scale = maxPx / longest;
          width = Math.max(1, Math.round(width * scale));
          height = Math.max(1, Math.round(height * scale));
        }
      }
      const opts: CaptureOptions = {
        width,
        height,
        format,
        quality: 0.92,
        cameraPreset: p.cameraPreset,
        presentation: true,
      };
      let blob = await scene.captureFrame(opts);
      blob = await applyExportLimits(blob, { maxPx, watermark });
      const ext = format === 'image/png' ? 'png' : 'jpg';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `toova-room-${preset}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      meta="Export render"
      title="Save a frame."
      onClose={onClose}
      width={420}
      footer={
        <>
          <Button size="sm" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button size="sm" onClick={() => void handleExport()} disabled={busy}>
            {busy ? 'Exporting…' : 'Download'}
          </Button>
        </>
      }
    >
      {watermark ? (
        <Gate
          allowed={false}
          limitType="render_quality"
          title="Watermarked on Free"
          message="Lite and Studio remove the watermark."
          fallback={
            <p className="muted" style={{ marginBottom: 12 }}>
              Free exports include a small toova.net watermark.{' '}
              <button type="button" className="text-btn" onClick={() => navigate(pricingPath())}>
                Upgrade
              </button>
            </p>
          }
        >
          {null}
        </Gate>
      ) : null}
      <Field label="Preset">
        <Select
          value={preset}
          onChange={(value) => setPreset(value as ExportPreset)}
          options={Object.entries(PRESETS).map(([id, p]) => ({
            value: id,
            label: p.label,
          }))}
        />
      </Field>
      <Field label="Format">
        <Select
          value={format}
          onChange={(value) => setFormat(value as 'image/png' | 'image/jpeg')}
          options={[
            { value: 'image/png', label: 'PNG' },
            { value: 'image/jpeg', label: 'JPEG' },
          ]}
        />
      </Field>
      {error ? <p className="form-error" style={{ marginTop: 12 }}>{error}</p> : null}
      {busy ? <Spinner /> : null}
    </Modal>
  );
}
