import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useRoomWorkspace } from '../context/RoomWorkspaceContext';
import { useAuth } from '../hooks/useAuth';
import { useRoomSave } from '../hooks/useRoomLayout';
import type { GalleryModel } from '../hooks/useGalleryCatalog';
import { recordCatalogDownload, shouldRecordCatalogDownload } from '../lib/catalogEngagement';
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
import { HangingDecorToolRail } from './HangingDecorToolRail';
import { HangingDecorPanel } from './HangingDecorPanel';
import { fetchRoomAttribution, type RoomAttributionPayload } from '../lib/profiles';
import { uploadRoomThumbnail } from '../lib/roomThumbnailStorage';
import { renderRoomPreviewJpeg } from '../lib/roomPreviewThumbnail';
import { resolvePreviewTintsForModelUrls } from '../lib/previewTintColor';
import { navigate, profilePath, publicRoomPath } from '../hooks/useRoute';
import { Button } from './kit/Button';
import { Checkbox } from './kit/Checkbox';
import { MonoMeta } from './kit/MonoMeta';
import { RangeControl } from './kit/RangeControl';
import { Rule } from './kit/Rule';
import { Tabs } from './kit/Tabs';

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
  hanging: '#8A8478',
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
        if (shouldRecordCatalogDownload(model, user?.id)) {
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
        const floorItems = order
          .map((id) => items[id])
          .filter((it): it is Item => Boolean(it) && it.kind !== 'hanging');

        const modelUrls = [
          ...new Set(
            floorItems
              .filter((it) => it.kind === 'imported' && it.importedStoragePath)
              .map((it) => it.importedStoragePath!),
          ),
        ];
        const tints =
          modelUrls.length > 0
            ? await resolvePreviewTintsForModelUrls(modelUrls)
            : new Map<string, string>();

        const previewItems = floorItems.map((it) => ({
          id: it.id,
          kind: it.kind,
          position: [...it.position] as [number, number, number],
          rotationY: it.rotationY,
          size: [...it.size] as [number, number, number],
          tint:
            it.kind === 'imported' && it.importedStoragePath
              ? tints.get(it.importedStoragePath) ?? null
              : null,
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
        <div className="designer-topbar-start">
          <button type="button" className="designer-topbar-btn" onClick={requestLeave}>← Rooms</button>
          <div className="designer-topbar-divider" />
          <div>
            <input
              className="designer-room-name"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              onBlur={() => void handleSave()}
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
        <div className="designer-topbar-end">
          <Button size="sm" variant="outline" onClick={() => setFeedbackOpen(true)}>
            Feedback
          </Button>
          <Button size="sm" variant="outline" onClick={onOpenChecklist}>
            Checklist
          </Button>
          {workspace?.isOwner ? (
            <Button size="sm" variant="outline" onClick={() => setShareOpen(true)}>
              Share
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => sceneRef.current?.resetCamera()}>
            Reset view
          </Button>
          <MonoMeta size="sm" tone="dense" className="designer-save-status">
            {saving ? 'Saving…' : savedLabel}
          </MonoMeta>
          <Button size="sm" disabled={saving} onClick={() => void handleSave()}>Save</Button>
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
        <HangingDecorToolRail />

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
          <Button
            size="lg"
            className="designer-add-btn"
            onClick={() => setPaletteOpen(true)}
          >
            Add furniture
          </Button>
        ) : item?.kind === 'hanging' ? (
          <div className="designer-quick-bar">
            <span className="designer-quick-bar-label">{item.label}</span>
            <div className="designer-quick-bar-divider" />
            <button
              type="button"
              className={`designer-advanced-btn${advancedOpen ? ' active' : ''}`}
              aria-pressed={advancedOpen}
              onClick={() => setAdvancedOpen((v) => !v)}
            >
              Customize
            </button>
          </div>
        ) : item ? (
          <div className="designer-quick-bar">
            <RangeControl
              label="Size"
              value={uniformPct}
              min={40}
              max={220}
              step={5}
              unit="%"
              onChange={handleUniformChange}
              style={{ width: 180, marginBottom: 0 }}
            />
            <div className="designer-quick-bar-divider" />
            <button type="button" className="designer-quick-add-btn" title="Add another piece" onClick={() => setPaletteOpen(true)}>+</button>
            <button
              type="button"
              className={`designer-advanced-btn${advancedOpen ? ' active' : ''}`}
              aria-pressed={advancedOpen}
              onClick={() => setAdvancedOpen((v) => !v)}
            >
              Advanced
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

        {advancedOpen && item?.kind === 'hanging' ? (
          <HangingDecorPanel onClose={() => setAdvancedOpen(false)} />
        ) : null}

        {advancedOpen && item && item.kind !== 'hanging' ? (
          <aside className="designer-advanced tv-scroll">
            <div className="designer-advanced-head">
              <span className="designer-advanced-eyebrow">Advanced · selected piece</span>
              <button type="button" className="designer-advanced-close" onClick={() => setAdvancedOpen(false)} aria-label="Close">×</button>
            </div>

            <div className="designer-advanced-item-card">
              <div className="designer-advanced-swatch" style={{ background: KIND_COLORS[item.kind] ?? '#CBB28F' }} />
              <div>
                <div className="designer-advanced-item-title">{item.label}</div>
                <div className="designer-advanced-item-meta">{item.kind}</div>
              </div>
            </div>

            <Tabs
              active={sizeMode}
              onChange={(id) => setSizeMode(id as 'uniform' | 'axis')}
              style={{ marginBottom: 16 }}
              tabs={[
                { id: 'uniform', label: 'Uniform' },
                { id: 'axis', label: 'Size (in)' },
              ]}
            />

            <div className="designer-advanced-section">
              {sizeMode === 'uniform' ? (
                <RangeControl
                  label="Scale"
                  value={uniformPct}
                  min={40}
                  max={220}
                  step={5}
                  unit="%"
                  onChange={handleUniformChange}
                />
              ) : (
                (['Width', 'Height', 'Depth'] as const).map((label, i) => (
                  <RangeControl
                    key={label}
                    label={label}
                    value={Math.round(item.size[i])}
                    min={1}
                    max={maxItemFootprint}
                    step={1}
                    unit="″"
                    onChange={(v) => {
                      const next = [...item.size] as [number, number, number];
                      next[i] = v;
                      setItemSize(item.id, next);
                    }}
                  />
                ))
              )}

              <RangeControl
                label="Rotation"
                value={rotDeg}
                min={0}
                max={360}
                step={15}
                unit="°"
                onChange={(v) => updateRotation(item.id, (v * Math.PI) / 180)}
              />

              {item.kind !== 'bed' ? (
                <RangeControl
                  label="Height off floor"
                  value={Math.round(item.position[1])}
                  min={0}
                  max={maxElevation}
                  step={2}
                  unit="″"
                  onChange={(v) => setItemElevation(item.id, v)}
                />
              ) : null}

              {item.kind === 'bed' ? (
                <>
                  <RangeControl
                    label="Leg height"
                    value={item.bedLegHeight ?? 8}
                    min={4}
                    max={36}
                    step={1}
                    unit="″"
                    onChange={(v) => setBedHeight(item.id, v)}
                  />
                  <Checkbox
                    checked={!!item.beddingEnabled}
                    label="Bedding"
                    onChange={(checked) => setBeddingEnabled(item.id, checked)}
                  />
                  {item.beddingEnabled ? (
                    <div style={{ marginBottom: 8 }}>
                      <input type="color" value={item.blanketColor ?? DEFAULT_BLANKET_COLOR} onChange={(e) => setBlanketColor(item.id, e.target.value)} disabled={beddingBusy} style={{ width: '100%', height: 36, marginBottom: 8, borderRadius: 'var(--radius-xs)', border: '1px solid var(--rule-hair)' }} />
                      <MonoMeta size="xs" tone="dense" upper style={{ display: 'block', marginBottom: 6 }}>Blanket pattern</MonoMeta>
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
            </div>

            <Rule weight="hair" spacing={16} />

            <button type="button" className="designer-advanced-toggle-row" onClick={() => setWallMounted(item.id, !item.wallMounted)}>
              Wall mounted
              <MonoMeta size="sm" tone="dense">{item.wallMounted ? 'On' : 'Off'}</MonoMeta>
            </button>

            <div className="designer-advanced-panel-block">
              <Checkbox
                checked={!!emitter?.enabled}
                label="Emits light"
                onChange={(checked) => setEmitterEnabled(item.id, checked)}
              />
              {emitter?.enabled ? (
                <>
                  <div className="designer-advanced-emitter-type">
                    {(['point', 'spot'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={(emitter.type ?? DEFAULT_EMITTER.type) === t ? 'active' : ''}
                        onClick={() => setEmitterConfig(item.id, { type: t })}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <input
                    type="color"
                    value={emitter.color ?? DEFAULT_EMITTER.color}
                    onChange={(e) => setEmitterConfig(item.id, { color: e.target.value })}
                    style={{ width: '100%', height: 32, marginBottom: 8, borderRadius: 'var(--radius-xs)', border: '1px solid var(--rule-hair)' }}
                  />
                  {(['intensity', 'range'] as const).map((field) => (
                    <RangeControl
                      key={field}
                      label={field}
                      value={emitter[field] ?? DEFAULT_EMITTER[field]}
                      min={field === 'intensity' ? 0.1 : 20}
                      max={field === 'intensity' ? 8 : 200}
                      step={field === 'intensity' ? 0.1 : 5}
                      formatValue={(v) => v.toFixed(1)}
                      onChange={(v) => setEmitterConfig(item.id, { [field]: v })}
                    />
                  ))}
                  {(emitter.type ?? 'point') === 'spot' ? (
                    <RangeControl
                      label="Angle"
                      value={emitter.angleDeg ?? 45}
                      min={15}
                      max={90}
                      step={5}
                      unit="°"
                      onChange={(v) => setEmitterConfig(item.id, { angleDeg: v })}
                    />
                  ) : null}
                  <RangeControl
                    label="Glow"
                    value={Math.round((emitter.emissiveBoost ?? 0.35) * 100)}
                    min={0}
                    max={100}
                    step={5}
                    unit="%"
                    onChange={(v) => setEmitterConfig(item.id, { emissiveBoost: v / 100 })}
                  />
                </>
              ) : null}
            </div>

            <div className="designer-advanced-actions">
              <Button size="sm" variant="outline" full onClick={duplicateSelected}>Duplicate</Button>
              <Button size="sm" variant="outline" full onClick={() => { removeItem(item.id); setAdvancedOpen(false); }} style={{ color: 'var(--danger)', borderColor: 'var(--danger)', background: 'var(--danger-bg)' }}>Delete piece</Button>
            </div>
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
