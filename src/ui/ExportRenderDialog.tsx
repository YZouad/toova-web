import { useMemo, useState } from 'react';
import type { SceneHandle, CaptureOptions } from '../scene/Scene';
import type { CameraPresetId } from '../store';
import { useEntitlements } from '../hooks/useEntitlements';
import { applyExportWatermark, clampExportDimensions } from '../lib/exportWatermark';
import { navigate, pricingPath } from '../hooks/useRoute';
import { Button } from './kit/Button';
import { Field } from './kit/Field';
import { Modal } from './kit/Modal';
import { Select } from './kit/Select';
import { Spinner } from './kit/Spinner';

type ExportPreset = 'catalog' | 'square' | 'topDown' | 'catalog4k';

const BASE_PRESETS: Record<
  Exclude<ExportPreset, 'catalog4k'>,
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

export function ExportRenderDialog({ sceneRef, onClose }: ExportRenderDialogProps) {
  const { entitlements } = useEntitlements();
  const [preset, setPreset] = useState<ExportPreset>('catalog');
  const [format, setFormat] = useState<'image/png' | 'image/jpeg'>('image/png');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maxPx = entitlements?.export_max_px ?? 1920;
  const watermark = entitlements?.watermark ?? true;
  const can4k = maxPx >= 3840;

  const presetOptions = useMemo((): { value: ExportPreset; label: string }[] => {
    const opts: { value: ExportPreset; label: string }[] = (
      Object.keys(BASE_PRESETS) as Exclude<ExportPreset, 'catalog4k'>[]
    ).map((k) => ({
      value: k,
      label: BASE_PRESETS[k].label,
    }));
    if (can4k) {
      opts.unshift({
        value: 'catalog4k',
        label: 'Pro catalog 3840×2160',
      });
    }
    return opts;
  }, [can4k]);

  async function handleExport() {
    const scene = sceneRef.current;
    if (!scene) {
      setError('Scene not ready');
      return;
    }
    if (preset === 'catalog4k' && !can4k) {
      setError('4K export requires Pro.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const base =
        preset === 'catalog4k'
          ? { label: '4K', width: 3840, height: 2160, cameraPreset: 'catalog' as CameraPresetId }
          : BASE_PRESETS[preset as Exclude<ExportPreset, 'catalog4k'>];
      const clamped = clampExportDimensions(base.width, base.height, maxPx);

      const opts: CaptureOptions = {
        width: clamped.width,
        height: clamped.height,
        format,
        quality: 0.92,
        cameraPreset: base.cameraPreset,
        presentation: true,
      };
      let blob = await scene.captureFrame(opts);
      if (watermark) {
        blob = await applyExportWatermark(blob);
      }
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {watermark ? (
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45 }}>
            Free exports include a small Toova watermark.{' '}
            <button type="button" className="tv-link-button" onClick={() => navigate(pricingPath())}>
              Upgrade for clean exports
            </button>
          </p>
        ) : null}
        <Field label="Preset">
          <Select
            value={preset}
            onChange={(v) => setPreset(v as ExportPreset)}
            options={presetOptions.map((o) => ({ value: o.value, label: o.label }))}
          />
        </Field>
        <Field label="Format">
          <Select
            value={format}
            onChange={(v) => setFormat(v as 'image/png' | 'image/jpeg')}
            options={[
              { value: 'image/png', label: 'PNG' },
              { value: 'image/jpeg', label: 'JPEG' },
            ]}
          />
        </Field>
        {busy ? <Spinner label="Rendering frame…" /> : null}
        {error ? <div className="tv-banner-error" role="alert">{error}</div> : null}
      </div>
    </Modal>
  );
}
