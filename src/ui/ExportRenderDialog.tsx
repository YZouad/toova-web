import { useState } from 'react';
import type { SceneHandle, CaptureOptions } from '../scene/Scene';
import type { CameraPresetId } from '../store';
import { Button } from './kit/Button';
import { Field } from './kit/Field';
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

export function ExportRenderDialog({ sceneRef, onClose }: ExportRenderDialogProps) {
  const [preset, setPreset] = useState<ExportPreset>('catalog');
  const [format, setFormat] = useState<'image/png' | 'image/jpeg'>('image/png');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    const scene = sceneRef.current;
    if (!scene) {
      setError('Scene not ready');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const p = PRESETS[preset];
      const opts: CaptureOptions = {
        width: p.width,
        height: p.height,
        format,
        quality: 0.92,
        cameraPreset: p.cameraPreset,
        presentation: true,
      };
      const blob = await scene.captureFrame(opts);
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
        <Field label="Preset">
          <Select
            value={preset}
            onChange={(v) => setPreset(v as ExportPreset)}
            options={(Object.keys(PRESETS) as ExportPreset[]).map((k) => ({
              value: k,
              label: PRESETS[k].label,
            }))}
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
