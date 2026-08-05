import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useRoomWorkspace } from '../context/RoomWorkspaceContext';
import { useAuth } from '../hooks/useAuth';
import { useRoomSave } from '../hooks/useRoomLayout';
import type { GalleryModel } from '../hooks/useGalleryCatalog';
import { recordCatalogDownload } from '../lib/catalogEngagement';
import { proportionalSizesFromMaxSide } from '../lib/uniformItemSize';
import { supabase } from '../lib/supabase';
import { type FurnitureKind } from '../furniture/registry';
import { Scene, type SceneHandle } from '../scene/Scene';
import { useStore, DEFAULT_BLANKET_COLOR, DEFAULT_EMITTER, type Item, type CameraPresetId } from '../store';
import { planBounds } from '../lib/roomGeometry';
import { useChecklistModal } from '../hooks/useChecklistModal';
import { ChecklistModal } from './ChecklistModal';
import { FeedbackModal } from './FeedbackModal';
import { ImportModelModal } from './ImportModelModal';
import { DesignerGalleryPanel, pushRecentKind } from './DesignerGalleryPanel';
import { SceneCheckoutPanel } from './SceneCheckoutPanel';
import { AtmosphereStrip } from './AtmosphereStrip';
import { LookDrawer } from './LookDrawer';
import { ExportRenderDialog } from './ExportRenderDialog';
import { ShareModal } from './ShareModal';
import { UnsavedLeaveModal } from './UnsavedLeaveModal';
import { fetchRoomAttribution, type RoomAttributionPayload } from '../lib/profiles';
import { uploadRoomThumbnail } from '../lib/roomThumbnailStorage';
import { renderRoomPreviewJpeg } from '../lib/roomPreviewThumbnail';
import { navigate, profilePath, publicRoomPath } from '../hooks/useRoute';

function roomDirtyFingerprint(name: string): string {
  const { items, order, environment, roomGeometry } = useStore.getState();
  return JSON.stringify({
    name: name.trim(),
    order,
    items,
    environment,
    roomGeometry,
  });
}

const KIND_COLORS: Record<string, string> = {
  bed: '#C9B391',
  dresser: '#B08C5F',
  wardrobe: '#A88457',
  desk: '#B5946C',
  chair: '#CBB28F',
  nightstand: '#C0A47A',
  lamp: '#D4C4A0',
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

interface DesignerProps {
  onBack: () => void;
  onEditFloorPlan?: () => void;
  onOpenChecklist: () => void;
}

export function Designer({ onBack, onEditFloorPlan, onOpenChecklist }: DesignerProps) {
  const { user } = useAuth();
  const { workspace } = useRoomWorkspace();
  const { save, saving, error: saveError } = useRoomSave(workspace?.id ?? null);
  const sceneRef = useRef<SceneHandle>(null);
  const baseSizeRef = useRef<Map<string, [number, number, number]>>(new Map());
  const meshSizedRef = useRef<Set<string>>(new Set());
  const [shareOpen, setShareOpen] = useState(false);

  const selectedId = useStore((s) => s.selectedId);
  const item = useStore((s) => (selectedId ? s.items[selectedId] : null));
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
  const setEmitterEnabled = useStore((s) => s.setEmitterEnabled);
  const setEmitterConfig = useStore((s) => s.setEmitterConfig);

  const roomGeometry = useStore((s) => s.roomGeometry);
  const roomBounds = planBounds(roomGeometry);
  const maxItemFootprint = Math.max(roomBounds.width, roomBounds.depth, 200);

  const [roomName, setRoomName] = useState(workspace?.name ?? '');
  const [savedLabel, setSavedLabel] = useState('Saved');
  const [forkMeta, setForkMeta] = useState<RoomAttributionPayload | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importTab, setImportTab] = useState<'upload' | 'generate' | 'poster'>('generate');
  const [sizeMode, setSizeMode] = useState<'uniform' | 'axis'>('uniform');
  const [lookOpen, setLookOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [leaveSaving, setLeaveSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const dirtyBaselineRef = useRef('');

  const [beddingBusy, setBeddingBusy] = useState(false);
  const { open: checklistOpen, closeChecklist } = useChecklistModal();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [galleryRefreshKey, setGalleryRefreshKey] = useState(0);

  useEffect(() => {
    setRoomName(workspace?.name ?? '');
  }, [workspace?.name]);

  useEffect(() => {
    dirtyBaselineRef.current = roomDirtyFingerprint(workspace?.name ?? '');
    setDirty(false);
    setLeaveConfirmOpen(false);
  }, [workspace?.id, workspace?.name]);

  useEffect(() => {
    const syncDirty = () => {
      setDirty(roomDirtyFingerprint(roomName) !== dirtyBaselineRef.current);
    };
    syncDirty();
    return useStore.subscribe(syncDirty);
  }, [roomName]);

  useEffect(() => {
    let cancelled = false;
    if (!workspace?.id) {
      setForkMeta(null);
      return;
    }
    void (async () => {
      try {
        const meta = await fetchRoomAttribution(workspace.id);
        if (!cancelled) setForkMeta(meta);
      } catch {
        if (!cancelled) setForkMeta(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspace?.id]);

  useEffect(() => {
    if (!item || item.kind !== 'imported' || !item.importedNaturalSize) return;
    if (meshSizedRef.current.has(item.id)) return;
    meshSizedRef.current.add(item.id);
    baseSizeRef.current.set(item.id, [item.size[0], item.size[1], item.size[2]]);
  }, [item]);

  const addFromGallery = useCallback(
    (model: GalleryModel) => {
      if (model.isBuiltin) {
        const id = addItem(model.kind as FurnitureKind);
        const placed = useStore.getState().items[id];
        if (placed) {
          baseSizeRef.current.set(id, [...placed.size] as [number, number, number]);
        }
      } else if (model.signedUrl) {
        const dims: [number, number, number] = [
          model.width_in,
          model.height_in,
          model.depth_in,
        ];
        const id = addItem('imported', {
          url: model.signedUrl ?? undefined,
          storagePath: model.storagePath || undefined,
          label: model.label,
          size: dims,
          catalogSizeIn: dims,
        });
        baseSizeRef.current.set(id, dims);
        if (
          model.visibility === 'public' &&
          model.userId &&
          model.userId !== user?.id
        ) {
          void recordCatalogDownload(model.kind).catch(() => {
            /* best-effort */
          });
        }
      }
      pushRecentKind(model.kind);
      setPaletteOpen(false);
    },
    [addItem, user?.id],
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

  const handleSave = useCallback(async () => {
    if (!workspace?.id) return;
    const trimmed = roomName.trim();
    if (trimmed && trimmed !== workspace.name) {
      await supabase.from('rooms').update({ name: trimmed }).eq('id', workspace.id);
    }
    await save();
    dirtyBaselineRef.current = roomDirtyFingerprint(roomName);
    setDirty(false);
    setSavedLabel('Saved just now');

    // Best-effort OG thumbnail (floor-plan card) — never fail the save.
    if (user?.id) {
      try {
        const { items, order, roomGeometry } = useStore.getState();
        const previewItems = order
          .map((id) => items[id])
          .filter((it): it is Item => Boolean(it))
          .map((it) => ({
            id: it.id,
            kind: it.kind,
            position: [...it.position] as [number, number, number],
            rotationY: it.rotationY,
            size: [...it.size] as [number, number, number],
          }));
        const blob = await renderRoomPreviewJpeg(roomGeometry, previewItems);
        if (blob) {
          await uploadRoomThumbnail(blob, user.id, workspace.id);
        }
      } catch (err) {
        console.warn('[toova] room thumbnail capture failed', err);
      }
    }
  }, [workspace?.id, workspace?.name, roomName, save, user?.id]);

  const requestLeave = useCallback(() => {
    if (!dirty) {
      onBack();
      return;
    }
    setLeaveConfirmOpen(true);
  }, [dirty, onBack]);

  const confirmLeaveWithoutSaving = useCallback(() => {
    setLeaveConfirmOpen(false);
    onBack();
  }, [onBack]);

  const confirmSaveAndLeave = useCallback(async () => {
    setLeaveSaving(true);
    try {
      await handleSave();
      setLeaveConfirmOpen(false);
      onBack();
    } catch {
      // keep dialog open; saveError banner surfaces the failure
    } finally {
      setLeaveSaving(false);
    }
  }, [handleSave, onBack]);

  const stayInRoom = useCallback(() => {
    if (!leaveSaving) setLeaveConfirmOpen(false);
  }, [leaveSaving]);

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
          <button type="button" onClick={requestLeave} style={{ cursor: 'pointer', border: '1px solid var(--border)', background: '#fff', color: 'var(--text-dark)', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 9 }}>← Rooms</button>
          <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
          <div>
            <input
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              onBlur={() => void handleSave()}
              style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 500, color: 'var(--text)', border: 'none', background: 'transparent', outline: 'none', padding: '4px 6px', borderRadius: 7, width: 300 }}
            />
            {forkMeta?.attribution?.visible ? (
              <div className="room-attribution" style={{ paddingLeft: 6 }}>
                Forked from{' '}
                <button
                  type="button"
                  className="share-handle-link"
                  onClick={() => {
                    const a = forkMeta.attribution!;
                    if (a.owner_handle && a.room_id) {
                      navigate(publicRoomPath(a.owner_handle, a.room_id));
                    } else if (a.owner_handle) {
                      navigate(profilePath(a.owner_handle));
                    }
                  }}
                >
                  {forkMeta.attribution.room_name}
                </button>
                {' '}by {forkMeta.attribution.owner_display}
              </div>
            ) : forkMeta?.forked_from ? (
              <div className="room-attribution" style={{ paddingLeft: 6 }}>Copied room</div>
            ) : null}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            className="feedback-btn-ghost"
            onClick={() => setFeedbackOpen(true)}
          >
            Feedback
          </button>
          <button
            type="button"
            className="designer-checklist-btn"
            onClick={onOpenChecklist}
          >
            Checklist
          </button>
          {workspace?.isOwner ? (
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              style={{ cursor: 'pointer', border: '1px solid var(--border)', background: '#fff', color: 'var(--text-dark)', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 9 }}
            >
              Share
            </button>
          ) : null}
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

        <SceneCheckoutPanel onOpenChecklist={onOpenChecklist} />

        <div className="designer-right-rail">
          <AtmosphereStrip
            lookOpen={lookOpen}
            onToggleLook={() => setLookOpen((v) => !v)}
            onCloseLook={() => setLookOpen(false)}
          />
          <LookDrawer
            open={lookOpen}
            onClose={() => setLookOpen(false)}
            onGoToPreset={(id: CameraPresetId) => sceneRef.current?.goToPreset(id)}
            onOpenExport={() => setExportOpen(true)}
            onEditFloorPlan={onEditFloorPlan}
          />
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

        <DesignerGalleryPanel
          key={galleryRefreshKey}
          open={paletteOpen}
          currentUserId={user?.id ?? null}
          onClose={() => setPaletteOpen(false)}
          onPlace={addFromGallery}
          onOpenImport={(tab) => {
            setImportTab(tab);
            setImportOpen(true);
          }}
        />

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
          onAdded={() => {
            setGalleryRefreshKey((k) => k + 1);
            setImportOpen(false);
          }}
        />
      ) : null}

      <ChecklistModal
        open={checklistOpen}
        onClose={closeChecklist}
        onViewChecklist={onOpenChecklist}
      />
      <FeedbackModal
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        pageSource="designer"
        defaultEmail={user?.email ?? ''}
        userId={user?.id ?? null}
      />
      {exportOpen ? (
        <ExportRenderDialog sceneRef={sceneRef} onClose={() => setExportOpen(false)} />
      ) : null}
      {shareOpen && workspace?.id && user?.id && workspace.isOwner ? (
        <ShareModal
          roomId={workspace.id}
          userId={user.id}
          onClose={() => setShareOpen(false)}
        />
      ) : null}
      <UnsavedLeaveModal
        open={leaveConfirmOpen}
        saving={leaveSaving}
        onStay={stayInRoom}
        onLeave={confirmLeaveWithoutSaving}
        onSaveAndLeave={() => void confirmSaveAndLeave()}
      />
    </div>
  );
}
