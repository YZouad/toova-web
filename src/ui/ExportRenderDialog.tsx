import { useState } from 'react';
import type { SceneHandle, CaptureOptions } from '../scene/Scene';
import type { CameraPresetId } from '../store';

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
    <div className="designer-palette-backdrop" role="presentation" onClick={onClose}>
      <div
        className="designer-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Export render"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 420, height: 'auto', maxHeight: '80vh' }}
      >
        <div className="palette-head">
          <div className="palette-head-row">
            <div className="palette-title">Export render</div>
            <button type="button" className="palette-close" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="palette-body" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
            Preset
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value as ExportPreset)}
              style={{ fontSize: 13, padding: 8, borderRadius: 8, border: '1px solid var(--border)' }}
            >
              {(Object.keys(PRESETS) as ExportPreset[]).map((k) => (
                <option key={k} value={k}>{PRESETS[k].label}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
            Format
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as 'image/png' | 'image/jpeg')}
              style={{ fontSize: 13, padding: 8, borderRadius: 8, border: '1px solid var(--border)' }}
            >
              <option value="image/png">PNG</option>
              <option value="image/jpeg">JPEG</option>
            </select>
          </label>
          {error ? (
            <p style={{ color: 'var(--danger, #b33)', fontSize: 12, margin: 0 }}>{error}</p>
          ) : null}
          <button
            type="button"
            className="tv-btn-primary"
            disabled={busy}
            onClick={() => void handleExport()}
            style={{ marginTop: 8 }}
          >
            {busy ? 'Rendering…' : 'Download'}
          </button>
        </div>
      </div>
    </div>
  );
}
