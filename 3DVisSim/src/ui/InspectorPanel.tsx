import { useState } from 'react';
import { proportionalSizesFromMaxSide } from '../lib/uniformItemSize';
import { useStore, DEFAULT_BLANKET_COLOR } from '../store';
import { ROOM } from '../units';

const MAX_ITEM_FOOTPRINT = Math.max(ROOM.width, ROOM.depth, 200);

export function InspectorPanel() {
  const selectedId = useStore((s) => s.selectedId);
  const item = useStore((s) => (selectedId ? s.items[selectedId] : null));
  const updateRotation = useStore((s) => s.updateRotation);
  const setItemSize = useStore((s) => s.setItemSize);
  const setItemElevation = useStore((s) => s.setItemElevation);
  const setWallMounted = useStore((s) => s.setWallMounted);
  const setBedHeight = useStore((s) => s.setBedHeight);
  const setBeddingEnabled = useStore((s) => s.setBeddingEnabled);
  const setBlanketColor = useStore((s) => s.setBlanketColor);
  const setBlanketTexture = useStore((s) => s.setBlanketTexture);
  const removeItem = useStore((s) => s.removeItem);

  const [beddingBusy, setBeddingBusy] = useState(false);
  const [beddingError, setBeddingError] = useState<string | null>(null);

  if (!item) {
    return (
      <aside className="inspector">
        <h2>Inspector</h2>
        <p className="empty-hint">
          Click an item to select it.<br />
          Drag to move · R rotates · Delete removes.
        </p>
      </aside>
    );
  }

  const rotDeg = Math.round(((item.rotationY * 180) / Math.PI) % 360);
  const canEditSize = item.kind !== 'imported' || !!item.importedNaturalSize;
  const maxElevation = Math.max(0, ROOM.height - item.size[1]);
  const currentY = Math.round(item.position[1]);
  const sizeLabels = ['Width', 'Height', 'Depth'] as const;

  return (
    <aside className="inspector">
      <h2>{item.label}</h2>

      {/* ── Size ── */}
      {canEditSize ? (
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <label>Size (in)</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sizeLabels.map((label, i) => (
              <div key={label} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ color: '#888', width: 48 }}>{label}</span>
                <input
                  type="number"
                  min={1}
                  step={0.5}
                  value={item.size[i]}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!Number.isFinite(v)) return;
                    const next: [number, number, number] = [...item.size] as [number, number, number];
                    next[i] = v;
                    setItemSize(item.id, next);
                  }}
                  style={{ width: 76, padding: '4px 6px', borderRadius: 4, border: '1px solid #444', background: '#2b2b2b', color: '#eee' }}
                />
              </div>
            ))}
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #3a3a3a' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                <span style={{ color: '#888', width: 48 }}>Uniform</span>
                <input
                  type="range"
                  min={4}
                  max={MAX_ITEM_FOOTPRINT}
                  step={0.5}
                  value={Math.max(item.size[0], item.size[1], item.size[2])}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!Number.isFinite(v)) return;
                    setItemSize(item.id, proportionalSizesFromMaxSide(item.size, v));
                  }}
                  style={{ flex: 1, minWidth: 80 }}
                />
                <span style={{ color: '#888', minWidth: 44, textAlign: 'right' }}>
                  {Math.round(Math.max(item.size[0], item.size[1], item.size[2]) * 10) / 10}"
                </span>
              </div>
              <span style={{ color: '#666', fontSize: 11 }}>
                Largest side (in); scales all dimensions together. Clamps may tweak ratios at extremes.
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="row">
          <label>Size</label>
          <span style={{ color: '#888' }}>Measuring model…</span>
        </div>
      )}

      {/* ── Rotation ── */}
      <div className="row">
        <label>Rotation</label>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ color: '#888', minWidth: 40, textAlign: 'right' }}>{rotDeg}°</span>
          <button className="btn" onClick={() => updateRotation(item.id, item.rotationY - Math.PI / 2)}>⟲</button>
          <button className="btn" onClick={() => updateRotation(item.id, item.rotationY + Math.PI / 2)}>⟳</button>
        </div>
      </div>

      {/* ── Bed leg height ── */}
      {item.kind === 'bed' && (
        <div className="row">
          <label>Leg height</label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="range"
              min={4}
              max={36}
              step={1}
              value={item.bedLegHeight ?? 8}
              onChange={(e) => setBedHeight(item.id, parseInt(e.target.value, 10))}
            />
            <span style={{ color: '#888', minWidth: 28 }}>{item.bedLegHeight ?? 8}"</span>
          </div>
        </div>
      )}

      {/* ── Bed bedding (blanket + pillows) ── */}
      {item.kind === 'bed' && (
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <label htmlFor="bedding-cb">Bedsheets</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                id="bedding-cb"
                type="checkbox"
                checked={!!item.beddingEnabled}
                disabled={beddingBusy}
                onChange={(e) => {
                  setBeddingError(null);
                  setBeddingEnabled(item.id, e.target.checked);
                }}
                style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#4f8cff' }}
              />
              <span style={{ color: '#888', fontSize: 12 }}>Blanket, pillow cases, and sheet styling</span>
            </div>
            {item.beddingEnabled && (
              <>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ color: '#888', fontSize: 12 }}>Blanket color</span>
                  <input
                    type="color"
                    value={item.blanketColor ?? DEFAULT_BLANKET_COLOR}
                    onChange={(e) => setBlanketColor(item.id, e.target.value)}
                    disabled={beddingBusy}
                    style={{ width: 36, height: 28, padding: 0, border: '1px solid #444', borderRadius: 4, cursor: 'pointer' }}
                  />
                  <span style={{ color: '#aaa', fontSize: 12, fontFamily: 'monospace' }}>
                    {item.blanketColor ?? DEFAULT_BLANKET_COLOR}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ color: '#888', fontSize: 12 }}>Pattern</span>
                  <label className="btn" style={{ cursor: beddingBusy ? 'not-allowed' : 'pointer', margin: 0 }}>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={beddingBusy}
                      style={{ display: 'none' }}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        setBeddingError(null);
                        setBeddingBusy(true);
                        try {
                          const { uploadBlanketTexture, removeBlanketTexture } = await import(
                            '../lib/beddingStorage'
                          );
                          const prevPath = item.blanketTexturePath;
                          const { path, signedUrl } = await uploadBlanketTexture(file);
                          setBlanketTexture(item.id, { path, url: signedUrl });
                          if (prevPath && prevPath !== path) {
                            await removeBlanketTexture(prevPath).catch(() => {});
                          }
                        } catch (err) {
                          setBeddingError(err instanceof Error ? err.message : 'Upload failed');
                        } finally {
                          setBeddingBusy(false);
                        }
                      }}
                    />
                    {beddingBusy ? 'Uploading…' : 'Choose image'}
                  </label>
                  <button
                    type="button"
                    className="btn"
                    disabled={beddingBusy || !item.blanketTexturePath}
                    onClick={async () => {
                      setBeddingError(null);
                      setBeddingBusy(true);
                      try {
                        const { removeBlanketTexture } = await import('../lib/beddingStorage');
                        if (item.blanketTexturePath) {
                          await removeBlanketTexture(item.blanketTexturePath);
                        }
                        setBlanketTexture(item.id, null);
                      } catch (err) {
                        setBeddingError(err instanceof Error ? err.message : 'Could not remove pattern');
                      } finally {
                        setBeddingBusy(false);
                      }
                    }}
                  >
                    Clear pattern
                  </button>
                </div>
                {beddingError && (
                  <span style={{ color: '#f66', fontSize: 11 }}>{beddingError}</span>
                )}
                <span style={{ color: '#666', fontSize: 11 }}>
                  Optional fabric image — stored with your room like catalog assets.
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Height (elevation) — all non-bed items ── */}
      {item.kind !== 'bed' && (
        <div className="row">
          <label>Height</label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="range"
              min={0}
              max={maxElevation}
              step={1}
              value={currentY}
              onChange={(e) => setItemElevation(item.id, parseInt(e.target.value, 10))}
              style={{ width: 100 }}
            />
            <input
              type="number"
              min={0}
              max={maxElevation}
              step={1}
              value={currentY}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!Number.isFinite(v)) return;
                setItemElevation(item.id, v);
              }}
              style={{ width: 52, padding: '4px 6px', borderRadius: 4, border: '1px solid #444', background: '#2b2b2b', color: '#eee' }}
            />
            <span style={{ color: '#888' }}>"</span>
          </div>
        </div>
      )}

      {/* ── Wall mount toggle ── */}
      <div className="row">
        <label htmlFor="wall-mount-cb">Wall mount</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            id="wall-mount-cb"
            type="checkbox"
            checked={!!item.wallMounted}
            onChange={(e) => setWallMounted(item.id, e.target.checked)}
            style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#4f8cff' }}
          />
          <span style={{ color: '#888', fontSize: 11 }}>
            {item.wallMounted ? 'Pins height when dragged near a wall' : 'Falls after drag if not pinned near a wall'}
          </span>
        </div>
      </div>

      {/* ── XZ Position readout ── */}
      <div className="row">
        <label>Position</label>
        <span style={{ color: '#888' }}>
          ({Math.round(item.position[0])}", {Math.round(item.position[2])}")
        </span>
      </div>

      <div style={{ marginTop: 20 }}>
        <button className="btn danger" onClick={() => removeItem(item.id)}>
          Delete
        </button>
      </div>
    </aside>
  );
}
