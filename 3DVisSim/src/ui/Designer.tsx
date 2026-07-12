import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { useRoomWorkspace } from '../context/RoomWorkspaceContext';
import { useAdminStats } from '../hooks/useAdminStats';
import { useAuth } from '../hooks/useAuth';
import { useRoomSave } from '../hooks/useRoomLayout';
import { useUserCatalog, type UserCatalogEntry } from '../hooks/useUserCatalog';
import { proportionalSizesFromMaxSide } from '../lib/uniformItemSize';
import { supabase } from '../lib/supabase';
import { FURNITURE, type FurnitureKind } from '../furniture/registry';
import { Scene, type SceneHandle } from '../scene/Scene';
import { formatTimeOfDay, isDaytime } from '../lib/environment';
import { useStore, DEFAULT_BLANKET_COLOR, DEFAULT_EMITTER, type Item } from '../store';
import type { WallId } from '../lib/roomGeometry';
import { FurniturePreview } from './FurniturePreview';
import { ImportModelModal } from './ImportModelModal';

const RECENT_KEY = 'toova-recent-kinds';
const MAX_RECENT = 6;
const CALENDLY_DEMO_URL = 'https://calendly.com/aeliyag-uchicago/30min';

const WALL_OPTIONS: WallId[] = ['north', 'south', 'east', 'west'];

const BUILTIN_CATS: Record<Exclude<FurnitureKind, 'imported'>, string> = {
  bed: 'Bedroom',
  dresser: 'Storage',
  wardrobe: 'Storage',
  desk: 'Office',
  chair: 'Seating',
  nightstand: 'Storage',
};

const KIND_COLORS: Record<string, string> = {
  bed: '#C9B391',
  dresser: '#B08C5F',
  wardrobe: '#A88457',
  desk: '#B5946C',
  chair: '#CBB28F',
  nightstand: '#C0A47A',
  imported: '#7E8A60',
};

function getBaseSize(
  ref: MutableRefObject<Map<string, [number, number, number]>>,
  id: string,
  size: [number, number, number],
): [number, number, number] {
  if (!ref.current.has(id)) {
    ref.current.set(id, [size[0], size[1], size[2]]);
  }
  return ref.current.get(id)!;
}

type PaletteEntry = {
  kind: string;
  label: string;
  cat: string;
  tags: string[];
  isBuiltin: boolean;
  catalogEntry?: UserCatalogEntry;
};

interface DesignerProps {
  onBack: () => void;
}

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function pushRecent(kind: string) {
  const prev = loadRecent().filter((k) => k !== kind);
  const next = [kind, ...prev].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

export function Designer({ onBack }: DesignerProps) {
  const { user } = useAuth();
  const { isAdmin } = useAdminStats(user?.id);
  const { workspace } = useRoomWorkspace();
  const { save, saving, error: saveError } = useRoomSave(workspace?.id ?? null);
  const sceneRef = useRef<SceneHandle>(null);
  const baseSizeRef = useRef<Map<string, [number, number, number]>>(new Map());
  const meshSizedRef = useRef<Set<string>>(new Set());

  const selectedId = useStore((s) => s.selectedId);
  const item = useStore((s) => (selectedId ? s.items[selectedId] : null));
  const order = useStore((s) => s.order);
  const addItem = useStore((s) => s.addItem);
  const removeItem = useStore((s) => s.removeItem);
  const updateRotation = useStore((s) => s.updateRotation);
  const setItemSize = useStore((s) => s.setItemSize);
  const setItemElevation = useStore((s) => s.setItemElevation);
  const setWallMounted = useStore((s) => s.setWallMounted);
  const setBedHeight = useStore((s) => s.setBedHeight);
  const setBeddingEnabled = useStore((s) => s.setBeddingEnabled);
  const setBlanketColor = useStore((s) => s.setBlanketColor);
  const setBlanketTexture = useStore((s) => s.setBlanketTexture);
  const updatePosition = useStore((s) => s.updatePosition);
  const timeOfDay = useStore((s) => s.environment.timeOfDay);
  const orientationDeg = useStore((s) => s.environment.orientationDeg);
  const setTimeOfDay = useStore((s) => s.setTimeOfDay);
  const setOrientation = useStore((s) => s.setOrientation);
  const setExposure = useStore((s) => s.setExposure);
  const setGodRays = useStore((s) => s.setGodRays);
  const godRays = useStore((s) => s.environment.godRays);
  const roomGeometry = useStore((s) => s.roomGeometry);
  const setRoomDimensions = useStore((s) => s.setRoomDimensions);
  const addWindow = useStore((s) => s.addWindow);
  const updateWindow = useStore((s) => s.updateWindow);
  const removeWindow = useStore((s) => s.removeWindow);
  const setEmitterEnabled = useStore((s) => s.setEmitterEnabled);
  const setEmitterConfig = useStore((s) => s.setEmitterConfig);

  const maxItemFootprint = Math.max(roomGeometry.width, roomGeometry.depth, 200);

  const [roomName, setRoomName] = useState(workspace?.name ?? '');
  const [savedLabel, setSavedLabel] = useState('Saved');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importTab, setImportTab] = useState<'upload' | 'generate' | 'poster'>('generate');
  const [paletteQuery, setPaletteQuery] = useState('');
  const [paletteCat, setPaletteCat] = useState('All');
  const [sizeMode, setSizeMode] = useState<'uniform' | 'axis'>('uniform');
  const [recentKinds, setRecentKinds] = useState<string[]>(loadRecent);
  const [roomPanelOpen, setRoomPanelOpen] = useState(false);

  const [beddingBusy, setBeddingBusy] = useState(false);

  const { catalog, loading: catalogLoading, refresh: refreshCatalog } = useUserCatalog(Boolean(user?.id));

  useEffect(() => {
    setRoomName(workspace?.name ?? '');
  }, [workspace?.name]);

  useEffect(() => {
    if (!item || item.kind !== 'imported' || !item.importedNaturalSize) return;
    if (meshSizedRef.current.has(item.id)) return;
    meshSizedRef.current.add(item.id);
    baseSizeRef.current.set(item.id, [item.size[0], item.size[1], item.size[2]]);
  }, [item]);

  const placedCount = order.length;

  const paletteItems = useMemo((): PaletteEntry[] => {
    const builtins: PaletteEntry[] = (Object.keys(FURNITURE) as Array<keyof typeof FURNITURE>).map((k) => ({
      kind: k,
      label: FURNITURE[k].label,
      cat: BUILTIN_CATS[k],
      tags: [],
      isBuiltin: true,
    }));
    const community: PaletteEntry[] = catalog.map((c) => ({
      kind: c.kind,
      label: c.label,
      cat: 'Community',
      tags: c.tags,
      isBuiltin: false,
      catalogEntry: c,
    }));
    return [...builtins, ...community];
  }, [catalog]);

  const categories = useMemo(() => {
    const cats = new Set(paletteItems.map((p) => p.cat));
    return ['All', ...Array.from(cats).sort()];
  }, [paletteItems]);

  const filteredPalette = useMemo(() => {
    const q = paletteQuery.trim().toLowerCase();
    return paletteItems.filter((p) => {
      if (paletteCat !== 'All' && p.cat !== paletteCat) return false;
      if (!q) return true;
      return (
        p.label.toLowerCase().includes(q) ||
        p.kind.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [paletteItems, paletteQuery, paletteCat]);

  const recentItems = useMemo(
    () => recentKinds.map((k) => paletteItems.find((p) => p.kind === k)).filter(Boolean) as PaletteEntry[],
    [recentKinds, paletteItems],
  );

  const addFromPalette = useCallback(
    (entry: PaletteEntry) => {
      if (entry.isBuiltin) {
        const id = addItem(entry.kind as FurnitureKind);
        const placed = useStore.getState().items[id];
        if (placed) {
          baseSizeRef.current.set(id, [...placed.size] as [number, number, number]);
        }
      } else if (entry.catalogEntry?.signedUrl) {
        const c = entry.catalogEntry;
        const dims: [number, number, number] = [c.width_in, c.height_in, c.depth_in];
        const id = addItem('imported', {
          url: c.signedUrl ?? undefined,
          storagePath: c.storagePath || undefined,
          label: c.label,
          size: dims,
          catalogSizeIn: dims,
        });
        baseSizeRef.current.set(id, dims);
      }
      pushRecent(entry.kind);
      setRecentKinds(loadRecent());
      setPaletteOpen(false);
    },
    [addItem],
  );

  const uniformBase = item
    ? getBaseSize(baseSizeRef, item.id, item.size)
    : ([24, 24, 24] as [number, number, number]);

  const uniformPct = item
    ? Math.round(
        (Math.max(item.size[0], item.size[1], item.size[2]) /
          Math.max(...uniformBase)) *
          100,
      ) || 100
    : 100;

  const handleUniformChange = (pct: number) => {
    if (!item) return;
    const base = getBaseSize(baseSizeRef, item.id, item.size);
    const maxBase = Math.max(base[0], base[1], base[2]);
    const target = (maxBase * pct) / 100;
    setItemSize(item.id, proportionalSizesFromMaxSide(base, target));
  };

  const handleSave = async () => {
    if (!workspace?.id) return;
    const trimmed = roomName.trim();
    if (trimmed && trimmed !== workspace.name) {
      await supabase.from('rooms').update({ name: trimmed }).eq('id', workspace.id);
    }
    await save();
    setSavedLabel('Saved just now');
  };

  const duplicateSelected = () => {
    if (!item) return;
    const offset = 12;
    let newId: string;
    if (item.kind === 'imported') {
      newId = addItem('imported', {
        url: item.importedUrl ?? undefined,
        storagePath: item.importedStoragePath,
        label: item.label,
        size: [...item.size] as [number, number, number],
        catalogSizeIn: item.catalogSizeIn
          ? ([...item.catalogSizeIn] as [number, number, number])
          : ([...item.size] as [number, number, number]),
      });
    } else {
      newId = addItem(item.kind);
      setItemSize(newId, [...item.size] as [number, number, number]);
    }
    updateRotation(newId, item.rotationY);
    updatePosition(newId, [item.position[0] + offset, item.position[1], item.position[2] + offset]);
    if (item.wallMounted) setWallMounted(newId, true);
    if (item.kind === 'bed') {
      if (item.bedLegHeight != null) setBedHeight(newId, item.bedLegHeight);
      if (item.beddingEnabled) setBeddingEnabled(newId, true);
      if (item.blanketColor) setBlanketColor(newId, item.blanketColor);
    }
    if (item.emitter?.enabled) {
      setEmitterEnabled(newId, true);
      setEmitterConfig(newId, item.emitter);
    }
  };

  const rotDeg = item ? Math.round(((item.rotationY * 180) / Math.PI) % 360) : 0;
  const maxElevation = item ? Math.max(0, roomGeometry.height - item.size[1]) : 0;
  const emitter = item?.emitter;

  return (
    <div className="designer-page">
      <header className="designer-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button type="button" onClick={onBack} style={{ cursor: 'pointer', border: '1px solid var(--border)', background: '#fff', color: 'var(--text-dark)', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 9 }}>← Rooms</button>
          <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
          <input
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            onBlur={() => void handleSave()}
            style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 500, color: 'var(--text)', border: 'none', background: 'transparent', outline: 'none', padding: '4px 6px', borderRadius: 7, width: 300 }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" onClick={() => sceneRef.current?.resetCamera()} style={{ cursor: 'pointer', border: '1px solid var(--border)', background: '#fff', color: 'var(--text-dark)', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 9 }}>Reset view</button>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-subtle)' }}>{saving ? 'Saving…' : savedLabel}</div>
          <button type="button" className="tv-btn-primary" style={{ fontSize: 13, padding: '9px 18px', borderRadius: 9 }} disabled={saving} onClick={() => void handleSave()}>Save</button>
        </div>
      </header>

      {saveError ? (
        <div className="tv-banner-error" style={{ margin: '0 20px', position: 'relative', zIndex: 25 }} role="alert">{saveError}</div>
      ) : null}

      <div className="designer-canvas-wrap">
        <div className="designer-canvas-full">
          <Scene ref={sceneRef} />
        </div>

        <div className="designer-hud">
          <span className="landing-hero-dot" />
          Drag furniture to move · drag empty space to orbit · click a piece to edit
        </div>

        <div className="designer-status-chip">
          <span className="landing-hero-dot" />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{roomName}</span>
          <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>· {placedCount} pieces</span>
        </div>

        <div className="designer-env-panel">
          <div className="designer-env-row">
            <span className="designer-env-glyph" aria-hidden>
              {isDaytime(timeOfDay) ? '☀' : '☾'}
            </span>
            <span className="designer-env-time">{formatTimeOfDay(timeOfDay)}</span>
            <input
              type="range"
              className="designer-env-slider"
              min={0}
              max={24}
              step={0.25}
              value={timeOfDay}
              onChange={(e) => setTimeOfDay(Number(e.target.value))}
              aria-label="Time of day"
            />
          </div>
          <div className="designer-env-row">
            <span className="designer-env-label">N</span>
            <input
              type="range"
              className="designer-env-slider designer-env-orient"
              min={0}
              max={360}
              step={5}
              value={orientationDeg}
              onChange={(e) => setOrientation(Number(e.target.value))}
              aria-label="Room orientation"
            />
            <span className="designer-env-orient-val">{Math.round(orientationDeg)}°</span>
          </div>
          <div className="designer-env-presets">
            <button
              type="button"
              className="designer-env-preset"
              onClick={() => { setTimeOfDay(0); setExposure(0.35); setGodRays(false); }}
            >
              Midnight
            </button>
            <button
              type="button"
              className="designer-env-preset"
              onClick={() => { setTimeOfDay(7); setExposure(1); setGodRays(true); }}
            >
              Golden hour
            </button>
            <button
              type="button"
              className="designer-env-preset"
              onClick={() => { setTimeOfDay(13); setExposure(1); }}
            >
              Noon
            </button>
            <button
              type="button"
              className="designer-env-preset"
              onClick={() => { setTimeOfDay(11); setExposure(0.65); }}
            >
              Overcast
            </button>
          </div>
          <div className="designer-env-row" style={{ marginTop: 6 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, flex: 1 }}>
              <input
                type="checkbox"
                checked={godRays}
                onChange={(e) => setGodRays(e.target.checked)}
                style={{ accentColor: 'var(--accent)' }}
              />
              Light shafts
            </label>
            <button
              type="button"
              className="designer-env-preset"
              onClick={() => setRoomPanelOpen((v) => !v)}
            >
              Room {roomPanelOpen ? '▾' : '▸'}
            </button>
          </div>
          {roomPanelOpen ? (
            <div className="designer-room-panel">
              {(['width', 'depth', 'height'] as const).map((dim) => (
                <div key={dim} className="designer-env-row">
                  <span className="designer-env-label" style={{ minWidth: 52, textTransform: 'capitalize' }}>{dim}</span>
                  <input
                    type="range"
                    className="designer-env-slider"
                    min={dim === 'height' ? 72 : 60}
                    max={dim === 'width' ? 360 : dim === 'depth' ? 480 : 144}
                    step={2}
                    value={roomGeometry[dim]}
                    onChange={(e) => setRoomDimensions({ [dim]: Number(e.target.value) })}
                  />
                  <span className="designer-env-orient-val">{Math.round(roomGeometry[dim])}″</span>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Windows</span>
                <button type="button" className="designer-env-preset" onClick={() => addWindow()}>+ Add</button>
              </div>
              {roomGeometry.windows.map((win, i) => (
                <div key={i} className="designer-window-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>Window {i + 1}</span>
                    {roomGeometry.windows.length > 1 ? (
                      <button type="button" className="designer-env-preset" onClick={() => removeWindow(i)}>Remove</button>
                    ) : null}
                  </div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Wall
                    <select
                      value={win.wall}
                      onChange={(e) => updateWindow(i, { wall: e.target.value as WallId })}
                      style={{ width: '100%', marginTop: 4, fontFamily: 'inherit', fontSize: 12 }}
                    >
                      {WALL_OPTIONS.map((w) => (
                        <option key={w} value={w}>{w}</option>
                      ))}
                    </select>
                  </label>
                  {(['x', 'y', 'w', 'h'] as const).map((field) => (
                    <div key={field} className="designer-env-row" style={{ marginTop: 4 }}>
                      <span className="designer-env-label" style={{ minWidth: 28 }}>{field}</span>
                      <input
                        type="range"
                        className="designer-env-slider"
                        min={field === 'y' ? 0 : field === 'w' || field === 'h' ? 12 : -120}
                        max={field === 'y' ? roomGeometry.height - 12 : field === 'w' ? 120 : field === 'h' ? 96 : 120}
                        step={2}
                        value={win[field]}
                        onChange={(e) => updateWindow(i, { [field]: Number(e.target.value) })}
                      />
                      <span className="designer-env-orient-val">{Math.round(win[field])}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {!selectedId ? (
          <button type="button" className="designer-add-btn" onClick={() => setPaletteOpen(true)}>
            <span style={{ fontSize: 20, lineHeight: 0, marginTop: -2 }}>＋</span> Add furniture
          </button>
        ) : item ? (
          <div className="designer-quick-bar">
            <div className="designer-quick-size">
              <div className="designer-quick-size-labels">
                <span style={{ fontWeight: 600 }}>Size</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{uniformPct}%</span>
              </div>
              <input type="range" min={40} max={220} step={5} value={uniformPct} onChange={(e) => handleUniformChange(Number(e.target.value))} />
            </div>
            <div style={{ width: 1, height: 32, background: 'var(--border)' }} />
            <button type="button" title="Add another piece" onClick={() => setPaletteOpen(true)} style={{ cursor: 'pointer', border: '1px solid var(--border)', background: '#fff', color: 'var(--text-dark)', fontFamily: 'inherit', fontSize: 19, fontWeight: 600, width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>＋</button>
            <button
              type="button"
              className={`designer-advanced-btn${advancedOpen ? ' active' : ''}`}
              aria-pressed={advancedOpen}
              onClick={() => setAdvancedOpen((v) => !v)}
            >
              Advanced <span>⤢</span>
            </button>
          </div>
        ) : null}

        {paletteOpen ? (
          <div className="designer-palette-backdrop" role="presentation" onClick={() => setPaletteOpen(false)}>
            <div className="designer-palette tv-scroll" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
              <div className="palette-head">
                <div className="palette-head-row">
                  <div className="palette-title">Add furniture</div>
                  <span className="palette-count">{filteredPalette.length} models</span>
                  <button type="button" className="palette-close" onClick={() => setPaletteOpen(false)}>✕</button>
                </div>
                <div className="palette-search">
                  <span style={{ color: 'var(--text-subtle)', fontSize: 16 }}>⌕</span>
                  <input value={paletteQuery} onChange={(e) => setPaletteQuery(e.target.value)} placeholder="Search furniture, materials, tags…" />
                </div>
                <div className="palette-chips tv-scroll">
                  {categories.map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      className={`palette-chip${paletteCat === ch ? ' active' : ''}`}
                      onClick={() => setPaletteCat(ch)}
                    >
                      {ch}
                    </button>
                  ))}
                </div>
              </div>

              <div className="palette-body tv-scroll">
                <div className="palette-promo">
                  <div className="palette-promo-icon">⤒</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>Turn a photo into 3D</div>
                    <div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>Upload any furniture photo — we build a real 3D model.</div>
                  </div>
                  {isAdmin ? (
                    <button
                      type="button"
                      className="tv-btn-primary"
                      style={{ fontSize: 13, padding: '11px 17px', borderRadius: 9, flex: 'none' }}
                      onClick={() => { setImportTab('generate'); setImportOpen(true); }}
                    >
                      Upload
                    </button>
                  ) : (
                    <a
                      href={CALENDLY_DEMO_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tv-btn-primary"
                      style={{ fontSize: 13, padding: '11px 17px', borderRadius: 9, flex: 'none', textDecoration: 'none' }}
                    >
                      Schedule a demo
                    </a>
                  )}
                </div>

                {recentItems.length > 0 ? (
                  <>
                    <div className="palette-section-label">Recently used</div>
                    <div className="palette-recent tv-scroll">
                      {recentItems.map((r) => (
                        <button key={r.kind} type="button" className="palette-recent-chip" onClick={() => addFromPalette(r)}>
                          <FurniturePreview
                            kind={r.isBuiltin ? r.kind : 'imported'}
                            size={r.catalogEntry ? [r.catalogEntry.width_in, r.catalogEntry.height_in, r.catalogEntry.depth_in] : undefined}
                            url={r.isBuiltin ? undefined : r.catalogEntry?.signedUrl ?? undefined}
                            className="palette-recent-preview"
                          />
                          <span className="palette-recent-label">{r.label}</span>
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}

                {catalogLoading ? <p style={{ color: 'var(--text-subtle)', fontSize: 14 }}>Loading community models…</p> : null}

                <div className="palette-grid">
                  {filteredPalette.map((c) => (
                    <button key={`${c.kind}-${c.label}`} type="button" className="palette-tile" onClick={() => addFromPalette(c)}>
                      <div className="palette-tile-preview">
                        <FurniturePreview
                          kind={c.isBuiltin ? c.kind : 'imported'}
                          size={c.catalogEntry ? [c.catalogEntry.width_in, c.catalogEntry.height_in, c.catalogEntry.depth_in] : undefined}
                          url={c.catalogEntry?.signedUrl ?? undefined}
                          className="palette-preview-canvas"
                        />
                        <span className="palette-tile-cat">{c.cat}</span>
                      </div>
                      <div className="palette-tile-label">{c.label}</div>
                      {c.tags.length > 0 ? <div className="palette-tile-tags">{c.tags.slice(0, 2).join(' · ')}</div> : <div className="palette-tile-tags" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {advancedOpen && item ? (
          <aside className="designer-advanced tv-scroll">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--accent)' }}>Advanced · selected piece</span>
              <button type="button" onClick={() => setAdvancedOpen(false)} style={{ cursor: 'pointer', width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', color: 'var(--text-muted)', fontSize: 13 }}>✕</button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: 12, border: '1px solid var(--border)', borderRadius: 12, background: '#fff', marginBottom: 18 }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: KIND_COLORS[item.kind] ?? '#CBB28F' }} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{item.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>{item.kind}</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Size</span>
              <div style={{ display: 'flex', background: '#EDE5D8', borderRadius: 8, padding: 3 }}>
                <button type="button" onClick={() => setSizeMode('uniform')} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: sizeMode === 'uniform' ? '#fff' : 'transparent' }}>Uniform</button>
                <button type="button" onClick={() => setSizeMode('axis')} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: sizeMode === 'axis' ? '#fff' : 'transparent' }}>Size (in)</button>
              </div>
            </div>

            {sizeMode === 'uniform' ? (
              <>
                <div style={{ fontSize: 12, color: 'var(--text-dark)', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                  <span>Scale</span><span style={{ fontFamily: 'var(--font-mono)' }}>{uniformPct}%</span>
                </div>
                <input type="range" min={40} max={220} step={5} value={uniformPct} onChange={(e) => handleUniformChange(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)', marginBottom: 20 }} />
              </>
            ) : (
              (['Width', 'Height', 'Depth'] as const).map((label, i) => (
                <div key={label}>
                  <div style={{ fontSize: 12, color: 'var(--text-dark)', marginBottom: 5, display: 'flex', justifyContent: 'space-between' }}>
                    <span>{label}</span><span style={{ fontFamily: 'var(--font-mono)' }}>{Math.round(item.size[i])}″</span>
                  </div>
                  <input type="range" min={1} max={maxItemFootprint} step={1} value={item.size[i]} onChange={(e) => { const next = [...item.size] as [number, number, number]; next[i] = Number(e.target.value); setItemSize(item.id, next); }} style={{ width: '100%', accentColor: 'var(--accent)', marginBottom: 12 }} />
                </div>
              ))
            )}

            <div style={{ fontSize: 12, color: 'var(--text-dark)', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
              <span>Rotation</span><span style={{ fontFamily: 'var(--font-mono)' }}>{rotDeg}°</span>
            </div>
            <input type="range" min={0} max={360} step={15} value={rotDeg} onChange={(e) => updateRotation(item.id, (Number(e.target.value) * Math.PI) / 180)} style={{ width: '100%', accentColor: 'var(--accent)', marginBottom: 18 }} />

            {item.kind !== 'bed' ? (
              <>
                <div style={{ fontSize: 12, color: 'var(--text-dark)', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                  <span>Height off floor</span><span style={{ fontFamily: 'var(--font-mono)' }}>{Math.round(item.position[1])}″</span>
                </div>
                <input type="range" min={0} max={maxElevation} step={2} value={item.position[1]} onChange={(e) => setItemElevation(item.id, Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)', marginBottom: 18 }} />
              </>
            ) : null}

            {item.kind === 'bed' ? (
              <>
                <div style={{ fontSize: 12, color: 'var(--text-dark)', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                  <span>Leg height</span><span style={{ fontFamily: 'var(--font-mono)' }}>{item.bedLegHeight ?? 8}″</span>
                </div>
                <input type="range" min={4} max={36} step={1} value={item.bedLegHeight ?? 8} onChange={(e) => setBedHeight(item.id, Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)', marginBottom: 18 }} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 14, fontWeight: 600 }}>
                  <input type="checkbox" checked={!!item.beddingEnabled} onChange={(e) => setBeddingEnabled(item.id, e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
                  Bedding
                </label>
                {item.beddingEnabled ? (
                  <div style={{ marginBottom: 16 }}>
                    <input type="color" value={item.blanketColor ?? DEFAULT_BLANKET_COLOR} onChange={(e) => setBlanketColor(item.id, e.target.value)} disabled={beddingBusy} style={{ width: '100%', height: 36, marginBottom: 8 }} />
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Blanket pattern</label>
                    <input type="file" accept="image/*" disabled={beddingBusy} onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      setBeddingBusy(true);
                      try {
                        const { uploadBlanketTexture, removeBlanketTexture } = await import('../lib/beddingStorage');
                        const prevPath = item.blanketTexturePath;
                        const { path, signedUrl } = await uploadBlanketTexture(file);
                        setBlanketTexture(item.id, { path, url: signedUrl });
                        if (prevPath && prevPath !== path) await removeBlanketTexture(prevPath).catch(() => {});
                      } finally {
                        setBeddingBusy(false);
                      }
                    }} />
                  </div>
                ) : null}
              </>
            ) : null}

            <button type="button" onClick={() => setWallMounted(item.id, !item.wallMounted)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '11px 13px', border: '1px solid var(--border)', borderRadius: 10, background: '#fff', cursor: 'pointer', marginBottom: 16, fontFamily: 'inherit', fontSize: 14, fontWeight: 600 }}>
              Wall mounted
              <span style={{ fontSize: 12, color: item.wallMounted ? 'var(--accent)' : 'var(--text-subtle)' }}>{item.wallMounted ? 'On' : 'Off'}</span>
            </button>

            <div style={{ marginBottom: 16, padding: 12, border: '1px solid var(--border)', borderRadius: 10, background: '#fff' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 14, fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={!!emitter?.enabled}
                  onChange={(e) => setEmitterEnabled(item.id, e.target.checked)}
                  style={{ accentColor: 'var(--accent)' }}
                />
                Emits light
              </label>
              {emitter?.enabled ? (
                <>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    {(['point', 'spot'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setEmitterConfig(item.id, { type: t })}
                        style={{
                          flex: 1,
                          padding: '6px 8px',
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                          background: (emitter.type ?? DEFAULT_EMITTER.type) === t ? 'var(--accent-soft)' : '#fff',
                          fontFamily: 'inherit',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <input
                    type="color"
                    value={emitter.color ?? DEFAULT_EMITTER.color}
                    onChange={(e) => setEmitterConfig(item.id, { color: e.target.value })}
                    style={{ width: '100%', height: 32, marginBottom: 8 }}
                  />
                  {(['intensity', 'range'] as const).map((field) => (
                    <div key={field}>
                      <div style={{ fontSize: 12, marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ textTransform: 'capitalize' }}>{field}</span>
                        <span style={{ fontFamily: 'var(--font-mono)' }}>{(emitter[field] ?? DEFAULT_EMITTER[field]).toFixed(1)}</span>
                      </div>
                      <input
                        type="range"
                        min={field === 'intensity' ? 0.1 : 20}
                        max={field === 'intensity' ? 8 : 200}
                        step={field === 'intensity' ? 0.1 : 5}
                        value={emitter[field] ?? DEFAULT_EMITTER[field]}
                        onChange={(e) => setEmitterConfig(item.id, { [field]: Number(e.target.value) })}
                        style={{ width: '100%', accentColor: 'var(--accent)', marginBottom: 8 }}
                      />
                    </div>
                  ))}
                  {(emitter.type ?? 'point') === 'spot' ? (
                    <div>
                      <div style={{ fontSize: 12, marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                        <span>Angle</span>
                        <span style={{ fontFamily: 'var(--font-mono)' }}>{emitter.angleDeg ?? 45}°</span>
                      </div>
                      <input
                        type="range"
                        min={15}
                        max={90}
                        step={5}
                        value={emitter.angleDeg ?? 45}
                        onChange={(e) => setEmitterConfig(item.id, { angleDeg: Number(e.target.value) })}
                        style={{ width: '100%', accentColor: 'var(--accent)', marginBottom: 8 }}
                      />
                    </div>
                  ) : null}
                  <div>
                    <div style={{ fontSize: 12, marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                      <span>Glow</span>
                      <span style={{ fontFamily: 'var(--font-mono)' }}>{Math.round((emitter.emissiveBoost ?? 0.35) * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={emitter.emissiveBoost ?? 0.35}
                      onChange={(e) => setEmitterConfig(item.id, { emissiveBoost: Number(e.target.value) })}
                      style={{ width: '100%', accentColor: 'var(--accent)' }}
                    />
                  </div>
                </>
              ) : null}
            </div>

            <button type="button" onClick={duplicateSelected} style={{ width: '100%', cursor: 'pointer', border: '1px solid var(--border)', background: '#fff', color: 'var(--text)', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, padding: 10, borderRadius: 9, marginBottom: 8 }}>Duplicate</button>
            <button type="button" onClick={() => { removeItem(item.id); setAdvancedOpen(false); }} style={{ width: '100%', cursor: 'pointer', border: '1px solid #EBCFC8', background: 'var(--danger-bg)', color: 'var(--danger)', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, padding: 10, borderRadius: 9 }}>Delete piece</button>
          </aside>
        ) : null}
      </div>

      {user?.id ? (
        <ImportModelModal
          userId={user.id}
          open={importOpen}
          initialTab={importTab}
          onClose={() => setImportOpen(false)}
          onAdded={() => { void refreshCatalog(); setImportOpen(false); }}
        />
      ) : null}
    </div>
  );
}
