import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRoomWorkspace } from '../context/RoomWorkspaceContext';
import { useAuth } from '../hooks/useAuth';
import { useRoomSave } from '../hooks/useRoomLayout';
import type { GalleryModel } from '../hooks/useGalleryCatalog';
import { supabase } from '../lib/supabase';
import { Scene, type SceneHandle } from '../scene/Scene';
import { useStore, type Item, type CameraPresetId } from '../store';
import { FeedbackModal } from './FeedbackModal';
import { ExportRenderDialog } from './ExportRenderDialog';
import { ShareModal } from './ShareModal';
import { UnsavedLeaveModal } from './UnsavedLeaveModal';
import { ModelDetailModal } from './ModelDetailModal';
import { fetchRoomAttribution, type RoomAttributionPayload } from '../lib/profiles';
import { uploadRoomThumbnail } from '../lib/roomThumbnailStorage';
import { renderRoomPreviewJpeg } from '../lib/roomPreviewThumbnail';
import { resolvePreviewTintsForModelUrls } from '../lib/previewTintColor';
import { navigate, profilePath, publicRoomPath } from '../hooks/useRoute';
import './designer/designer.css';
import './designer/mobile/mobile-designer.css';
import { useDesignerChrome } from './designer/useDesignerChrome';
import { VIEW_PRESETS } from './designer/chromeTypes';
import type { CatalogModel } from './designer/chromeTypes';
import { LibraryPanel } from './designer/LibraryPanel';
import { LookPanel } from './designer/LookPanel';
import { LightPanel } from './designer/LightPanel';
import { PiecesPanel } from './designer/PiecesPanel';
import { InspectorPanel } from './designer/InspectorPanel';
import { ChecklistTicker } from './designer/ChecklistTicker';
import { DrawBanner } from './designer/DrawBanner';
import { CommandPalette } from './designer/CommandPalette';
import { buildDesignerCommands } from './designer/commandPaletteCommands';
import { KeysOverlay } from './designer/KeysOverlay';
import { TourCard } from './designer/TourCard';
import { ContextBar } from './designer/ContextBar';
import { ImportFlow } from './designer/ImportFlow';
import { MobileDesignerChrome } from './designer/mobile/MobileDesignerChrome';
import { placeFromCatalog } from './designer/placeCatalogModel';
import {
  IconBack,
  IconEye,
  IconLight,
  IconPieces,
  IconPlay,
  IconPlus,
  IconReset,
  IconRoomLook,
  IconSearch,
} from './designer/icons';
import { planBounds } from '../lib/roomGeometry';

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

function detailLabelFor(kind: string | undefined): string {
  if (kind === 'bed') return 'Bedding & details';
  if (kind === 'hanging') return 'Path & bulbs';
  if (kind === 'light') return 'Light settings';
  return 'Edit details';
}

interface DesignerProps {
  onBack: () => void;
  onEditFloorPlan?: () => void;
  onOpenChecklist: () => void;
  isAdmin?: boolean;
  /** Guest rooms call this instead of persisting to Supabase. */
  onRequestSaveAuth?: () => void;
}

export function Designer({
  onBack,
  onEditFloorPlan,
  onOpenChecklist,
  isAdmin = false,
  onRequestSaveAuth,
}: DesignerProps) {
  const { user } = useAuth();
  const { workspace } = useRoomWorkspace();
  const { save, saving, error: saveError } = useRoomSave(workspace?.id ?? null);
  const sceneRef = useRef<SceneHandle>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const chrome = useDesignerChrome();
  const roomGeometry = useStore((s) => s.roomGeometry);

  const [shareOpen, setShareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [leaveSaving, setLeaveSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const dirtyBaselineRef = useRef('');
  const [roomName, setRoomName] = useState(workspace?.name ?? '');
  const [savedLabel, setSavedLabel] = useState('Saved');
  const [forkMeta, setForkMeta] = useState<RoomAttributionPayload | null>(null);
  const [cameraPreset, setCameraPreset] = useState<CameraPresetId>('corner');
  const [detailModel, setDetailModel] = useState<GalleryModel | null>(null);

  const cancelHangingDraft = useStore((s) => s.cancelHangingDraft);
  const addLightSource = useStore((s) => s.addLightSource);

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

  const handleSave = useCallback(async () => {
    if (!workspace?.id) return;
    if (onRequestSaveAuth) {
      onRequestSaveAuth();
      return;
    }
    const trimmed = roomName.trim();
    if (trimmed && trimmed !== workspace.name) {
      await supabase.from('rooms').update({ name: trimmed }).eq('id', workspace.id);
    }
    await save();
    dirtyBaselineRef.current = roomDirtyFingerprint(roomName);
    setDirty(false);
    setSavedLabel('Saved just now');

    if (user?.id) {
      try {
        const { items, order, roomGeometry } = useStore.getState();
        const floorItems = order
          .map((id) => items[id])
          .filter((it): it is Item => Boolean(it) && it.kind !== 'hanging' && it.kind !== 'light');

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
  }, [workspace?.id, workspace?.name, roomName, save, user?.id, onRequestSaveAuth]);

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
      /* keep dialog open */
    } finally {
      setLeaveSaving(false);
    }
  }, [handleSave, onBack]);

  const stayInRoom = useCallback(() => {
    if (!leaveSaving) setLeaveConfirmOpen(false);
  }, [leaveSaving]);

  const goPreset = useCallback((id: CameraPresetId) => {
    setCameraPreset(id);
    sceneRef.current?.goToPreset(id);
  }, []);

  const openModel = useCallback((model: CatalogModel) => {
    setDetailModel(model);
  }, []);

  const placeModel = useCallback(
    (model: GalleryModel) => {
      placeFromCatalog(model, user?.id);
      setDetailModel(null);
      chrome.closePanels();
    },
    [user?.id, chrome],
  );

  const inspectorDetailLabel = detailLabelFor(chrome.selectedItem?.kind);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const fixturesEpoch = useStore(
    (s) =>
      `${s.environment.appearance.recessedLights}:${Object.values(s.items)
        .map((it) => `${it.id}:${it.emitter?.enabled}:${it.hanging?.lightsEnabled}`)
        .join(',')}`,
  );

  const commands = useMemo(
    () =>
      buildDesignerCommands({
        setPanel: chrome.setPanel,
        openInspector: chrome.openInspector,
        openImport: () => chrome.openImport(null),
        togglePresent: chrome.togglePresent,
        startDraw: chrome.startDraw,
        addLightSource: () => addLightSource(),
        handleSave: () => void handleSave(),
        onOpenChecklist,
        onEditFloorPlan,
        openShare: workspace?.isOwner ? () => setShareOpen(true) : undefined,
        openExport: () => setExportOpen(true),
        openFeedback: () => setFeedbackOpen(true),
        openKeys: () => chrome.setOverlay('keys'),
        restartTour: chrome.restartTour,
        goPreset,
        resetCamera: () => {
          sceneRef.current?.resetCamera();
          setCameraPreset('corner');
        },
        selectedId: chrome.selectedId,
        saveLabel: onRequestSaveAuth ? 'Save design…' : 'Save room',
        isOwner: !!workspace?.isOwner,
      }),
    [
      chrome.setPanel,
      chrome.openInspector,
      chrome.openImport,
      chrome.togglePresent,
      chrome.startDraw,
      chrome.setOverlay,
      chrome.restartTour,
      chrome.selectedId,
      addLightSource,
      handleSave,
      onOpenChecklist,
      onEditFloorPlan,
      workspace?.isOwner,
      goPreset,
      onRequestSaveAuth,
      fixturesEpoch,
    ],
  );

  // Global shortcuts for designer chrome
  useEffect(() => {
    const isEditable = (t: EventTarget | null) => {
      if (!(t instanceof HTMLElement)) return false;
      if (t.isContentEditable) return true;
      const tag = t.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    };

    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      const key = e.key;
      const lower = key.length === 1 ? key.toLowerCase() : key;
      const editable = isEditable(e.target);

      // ⌘K works even from fields (palette is search).
      if (meta && lower === 'k') {
        e.preventDefault();
        if (chrome.present) return;
        chrome.setOverlay(chrome.overlay === 'cmdk' ? null : 'cmdk');
        return;
      }

      if (key === 'Escape') {
        if (editable && e.target instanceof HTMLElement) e.target.blur();
        if (chrome.importOpen) {
          chrome.closeImport();
          return;
        }
        if (chrome.overlay) {
          chrome.setOverlay(null);
          return;
        }
        if (chrome.present) {
          chrome.setPresent(false);
          return;
        }
        if (chrome.panel) {
          chrome.closePanels();
          return;
        }
        if (chrome.radialOpen) {
          chrome.setRadialOpen(false);
          return;
        }
        if (chrome.selectedId) {
          chrome.clearSelection();
          return;
        }
        if (chrome.hangingDraft) {
          cancelHangingDraft();
        }
        return;
      }

      // Don't steal keystrokes from real text fields (including room rename).
      if (editable) return;

      if (chrome.present || chrome.importOpen || chrome.overlay === 'cmdk') return;
      if (e.altKey) return;

      // ? → shortcuts overlay
      if (key === '?' || (e.code === 'Slash' && e.shiftKey)) {
        e.preventDefault();
        chrome.setOverlay(chrome.overlay === 'keys' ? null : 'keys');
        return;
      }

      if (meta) return;

      if (chrome.overlay === 'keys') return;

      if (e.shiftKey && lower === 's') {
        e.preventDefault();
        if (workspace?.isOwner) {
          chrome.setOverlay(null);
          setShareOpen(true);
        }
        return;
      }
      if (e.shiftKey && lower === 'e') {
        e.preventDefault();
        chrome.setOverlay(null);
        setExportOpen(true);
        return;
      }
      if (e.shiftKey) return;

      if (lower === 'a') {
        e.preventDefault();
        chrome.setPanel('add');
        return;
      }
      if (lower === 'l') {
        e.preventDefault();
        const s = useStore.getState();
        s.toggleRoomFixtures(!s.roomFixturesLit());
        return;
      }
      if (lower === 'p') {
        e.preventDefault();
        chrome.togglePresent();
        return;
      }
      if (lower === 'f' && onEditFloorPlan) {
        e.preventDefault();
        chrome.setOverlay(null);
        onEditFloorPlan();
        return;
      }
      if (key === 'Enter' && chrome.selectedId) {
        e.preventDefault();
        chrome.openInspector();
        return;
      }
      if (key === '0') {
        e.preventDefault();
        sceneRef.current?.resetCamera();
        setCameraPreset('corner');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cancelHangingDraft, chrome, onEditFloorPlan, workspace?.isOwner]);

  // Clicking the viewport takes focus off the room-name field so shortcuts work.
  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el) return;
    const onPointerDown = () => {
      const ae = document.activeElement;
      if (ae instanceof HTMLElement && ae.classList.contains('dg-topbar-title__name')) {
        ae.blur();
      }
    };
    el.addEventListener('pointerdown', onPointerDown);
    return () => el.removeEventListener('pointerdown', onPointerDown);
  }, []);

  const pageClass = [
    'dg-page',
    chrome.compact ? 'is-compact is-phone' : '',
    chrome.present ? 'is-present' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const isPhone = chrome.compact;

  return (
    <div className={pageClass} ref={pageRef}>
      {!chrome.present && !isPhone ? (
        <header className="dg-topbar">
          <div className="dg-topbar-left">
            <button type="button" className="dg-topbar-icon" onClick={requestLeave} aria-label="Back to rooms">
              <IconBack />
            </button>
            <div className="dg-rule--v" aria-hidden />
            <div className="dg-topbar-title">
              <input
                className="dg-topbar-title__name"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                onBlur={() => void handleSave()}
                aria-label="Room name"
              />
              {forkMeta?.attribution?.visible ? (
                <div className="dg-topbar-title__meta">
                  Forked from{' '}
                  <button
                    type="button"
                    className="dg-link"
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
              ) : (
                <div className="dg-topbar-title__meta">
                  {(() => {
                    const b = planBounds(roomGeometry);
                    const fmt = (inches: number) => {
                      const ft = Math.floor(inches / 12);
                      const inn = Math.round(inches % 12);
                      return `${ft}′${inn}″`;
                    };
                    return `${fmt(b.width)} × ${fmt(b.depth)} · room`;
                  })()}
                </div>
              )}
            </div>
          </div>

          {!chrome.importOpen ? (
            <button
              type="button"
              className="dg-topbar-search"
              ref={searchTriggerRef}
              onClick={() => chrome.setOverlay('cmdk')}
              aria-label="Search anything"
            >
              <IconSearch />
              <span className="dg-topbar-search__label">Search pieces, colors, actions</span>
              <kbd className="dg-topbar-search__kbd">⌘K</kbd>
            </button>
          ) : null}

          <div className="dg-topbar-right dg-topbar-chrome">
            <div className="dg-topbar-save-group" data-tour-id="topbar-save">
              <span className="dg-topbar-save" aria-live="polite">
                {saving ? 'Saving…' : savedLabel}
              </span>
              <button
                type="button"
                className="dg-topbar-btn"
                disabled={saving}
                onClick={() => void handleSave()}
              >
                {onRequestSaveAuth ? 'Save design' : 'Save'}
              </button>
              <button
                type="button"
                className="dg-topbar-btn is-primary"
                onClick={() => chrome.togglePresent()}
              >
                <IconPlay />
                Present
              </button>
            </div>
            <div className="dg-rule--v" aria-hidden />
            <div className="dg-more">
              <button
                type="button"
                className="dg-topbar-icon"
                aria-label="More actions"
                aria-expanded={chrome.overlay === 'more'}
                onClick={() => chrome.setOverlay(chrome.overlay === 'more' ? null : 'more')}
              >
                ···
              </button>
              {chrome.overlay === 'more' ? (
                <div className="dg-more-menu" role="menu">
                  <div className="dg-more-menu__section">Room</div>
                  {onEditFloorPlan ? (
                    <button type="button" className="dg-more-menu__item" role="menuitem" onClick={() => { onEditFloorPlan(); chrome.setOverlay(null); }}>
                      Edit floor plan
                      <span className="dg-more-menu__kbd">F</span>
                    </button>
                  ) : null}
                  {workspace?.isOwner ? (
                    <button type="button" className="dg-more-menu__item" role="menuitem" onClick={() => { setShareOpen(true); chrome.setOverlay(null); }}>
                      Share design
                      <span className="dg-more-menu__kbd">⇧S</span>
                    </button>
                  ) : null}
                  <button type="button" className="dg-more-menu__item" role="menuitem" onClick={() => { setExportOpen(true); chrome.setOverlay(null); }}>
                    Export render
                    <span className="dg-more-menu__kbd">⇧E</span>
                  </button>
                  <div className="dg-more-menu__rule" aria-hidden />
                  <button type="button" className="dg-more-menu__item" role="menuitem" onClick={() => { chrome.setOverlay('cmdk'); }}>
                    Search
                    <span className="dg-more-menu__kbd">⌘K</span>
                  </button>
                  <button type="button" className="dg-more-menu__item" role="menuitem" onClick={() => { chrome.setOverlay('keys'); }}>
                    Keyboard shortcuts
                    <span className="dg-more-menu__kbd">?</span>
                  </button>
                  <button type="button" className="dg-more-menu__item" role="menuitem" onClick={() => { chrome.restartTour(); chrome.setOverlay(null); }}>
                    Replay the walkthrough
                  </button>
                  <button type="button" className="dg-more-menu__item" role="menuitem" onClick={() => { onOpenChecklist(); chrome.setOverlay(null); }}>
                    Full checklist
                  </button>
                  <button type="button" className="dg-more-menu__item" role="menuitem" onClick={() => { setFeedbackOpen(true); chrome.setOverlay(null); }}>
                    Send feedback
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>
      ) : null}

      {saveError ? (
        <div className="dg-banner is-error" role="alert">
          Couldn’t save: {saveError}
        </div>
      ) : null}

      <div className="dg-viewport" ref={canvasWrapRef} data-tour-id="viewport">
        <div className="dg-canvas">
          <Scene
            ref={sceneRef}
            orbitCssTargetRef={canvasWrapRef}
            interactionMode={isPhone ? 'mobile' : 'desktop'}
            selectionHud={{
              radialOpen: chrome.radialOpen,
              onToggleRadial: () => chrome.setRadialOpen(!chrome.radialOpen),
              onOpenInspector: chrome.openInspector,
              // Always pass an object so Scene uses SelectionHud (not ArcMenu).
              // hidden:true in present/draw — SelectionHud / MobileSelectionHud no-ops.
              hidden: chrome.present || chrome.drawing,
            }}
          />
        </div>
        <div className="dg-viewport-veil" aria-hidden />

        {isPhone ? (
          <MobileDesignerChrome
            chrome={chrome}
            roomName={roomName}
            onRoomNameChange={setRoomName}
            onRoomNameBlur={() => void handleSave()}
            savedLabel={savedLabel}
            saving={saving}
            onBack={requestLeave}
            onSave={() => void handleSave()}
            saveLabel={onRequestSaveAuth ? 'Save design' : 'Save'}
            onEditFloorPlan={onEditFloorPlan}
            onOpenShare={workspace?.isOwner ? () => setShareOpen(true) : undefined}
            onOpenExport={() => setExportOpen(true)}
            onOpenFeedback={() => setFeedbackOpen(true)}
            onOpenFullChecklist={onOpenChecklist}
            goPreset={goPreset}
            cameraPreset={cameraPreset}
            addLightSource={addLightSource}
            isAdmin={isAdmin}
            onOpenModel={openModel}
            onImportComplete={(model) => {
              setDetailModel(model);
            }}
            searchTriggerRef={searchTriggerRef}
          />
        ) : (
          <>
            <DrawBanner />

            {chrome.chromeOn ? (
              <nav className="dg-rail" aria-label="Designer tools">
                <div className="dg-rail-stack">
                  <button
                    type="button"
                    className={`dg-rail-btn is-primary${chrome.panel === 'add' ? ' is-active' : ''}`}
                    data-tour-id="rail-add"
                    onClick={() => chrome.setPanel('add')}
                  >
                    <IconPlus stroke="#F8F3EA" />
                    <span>Add</span>
                  </button>
                  <div className="dg-rule" aria-hidden />
                  <button
                    type="button"
                    className={`dg-rail-btn${chrome.panel === 'look' ? ' is-active' : ''}`}
                    onClick={() => chrome.setPanel('look')}
                  >
                    <IconRoomLook />
                    <span>Room look</span>
                  </button>
                  <button
                    type="button"
                    className={`dg-rail-btn${chrome.panel === 'light' ? ' is-active' : ''}`}
                    onClick={() => chrome.setPanel('light')}
                  >
                    <IconLight />
                    <span>Light</span>
                  </button>
                  <button
                    type="button"
                    className={`dg-rail-btn${chrome.panel === 'pieces' ? ' is-active' : ''}`}
                    onClick={() => chrome.setPanel('pieces')}
                  >
                    <IconPieces />
                    <span>Pieces</span>
                  </button>
                  <div className="dg-rule" aria-hidden />
                  <button
                    type="button"
                    className="dg-rail-btn is-quiet"
                    onClick={() => chrome.setOverlay('keys')}
                  >
                    <span aria-hidden style={{ font: '400 12px/1 var(--font-mono)' }}>?</span>
                    <span>Help</span>
                  </button>
                </div>
              </nav>
            ) : null}

            {chrome.tickerVisible ? (
              <ChecklistTicker
                open={chrome.tickerOpen}
                onToggle={() => chrome.setTickerOpen(!chrome.tickerOpen)}
                compact={false}
                onOpenFull={onOpenChecklist}
              />
            ) : null}

            {chrome.chromeOn ? (
              <div className="dg-camera" data-tour-id="camera">
                <div className="dg-camera-puck" role="group" aria-label="Camera presets">
                  <span className="dg-camera-puck__icon" aria-hidden>
                    <IconEye />
                  </span>
                  {VIEW_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`dg-camera-btn${cameraPreset === p.id ? ' is-active' : ''}`}
                      onClick={() => goPreset(p.id)}
                    >
                      {p.label}
                    </button>
                  ))}
                  <div className="dg-rule--v" aria-hidden />
                  <button
                    type="button"
                    className="dg-camera-btn"
                    aria-label="Reset camera"
                    onClick={() => {
                      sceneRef.current?.resetCamera();
                      setCameraPreset('corner');
                    }}
                  >
                    <IconReset />
                    Reset
                  </button>
                </div>
              </div>
            ) : null}

            {chrome.showContextBar ? (
              <ContextBar onEditDetails={chrome.openInspector} detailLabel={inspectorDetailLabel} />
            ) : null}

            {chrome.panel === 'add' ? (
              <LibraryPanel
                compact={false}
                onClose={chrome.closePanels}
                onImport={() => chrome.openImport(null)}
                onOpenModel={openModel}
                onStartDraw={chrome.startDraw}
                onAddLight={() => {
                  addLightSource();
                  chrome.closePanels();
                }}
              />
            ) : null}
            {chrome.panel === 'look' ? (
              <LookPanel compact={false} onClose={chrome.closePanels} />
            ) : null}
            {chrome.panel === 'light' ? (
              <LightPanel
                compact={false}
                onClose={chrome.closePanels}
                onStartDraw={chrome.startDraw}
                onAddLight={() => addLightSource()}
              />
            ) : null}
            {chrome.panel === 'pieces' ? (
              <PiecesPanel compact={false} onClose={chrome.closePanels} />
            ) : null}
            {chrome.panel === 'inspect' ? (
              <InspectorPanel
                compact={false}
                tab={chrome.inspectorTab}
                onTab={chrome.setInspectorTab}
                onClose={chrome.closePanels}
              />
            ) : null}

            {chrome.present ? (
              <div className="dg-present-bar">
                <div className="dg-camera-puck" role="group" aria-label="Camera presets">
                  {VIEW_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`dg-camera-btn${cameraPreset === p.id ? ' is-active' : ''}`}
                      onClick={() => goPreset(p.id)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="dg-present-bar__actions">
                  {workspace?.isOwner ? (
                    <button type="button" className="dg-present-bar__btn is-ghost" onClick={() => setShareOpen(true)}>
                      Share
                    </button>
                  ) : null}
                  <button type="button" className="dg-present-bar__btn is-ghost" onClick={() => setExportOpen(true)}>
                    Export
                  </button>
                  <button type="button" className="dg-present-bar__btn is-primary" onClick={() => chrome.setPresent(false)}>
                    Exit present
                  </button>
                </div>
              </div>
            ) : null}

            <ImportFlow
              open={chrome.importOpen}
              route={chrome.importRoute}
              onRoute={chrome.setImportRoute}
              onClose={chrome.closeImport}
              isAdmin={isAdmin}
              compact={false}
              onComplete={(model) => {
                chrome.closeImport();
                setDetailModel(model);
              }}
            />
          </>
        )}
      </div>

      {chrome.tourOn && chrome.chromeOn ? (
        <TourCard
          step={chrome.tourStep}
          onNext={chrome.tourNext}
          onPrev={chrome.tourPrev}
          onSkip={chrome.endTour}
          compact={chrome.compact}
          rootRef={pageRef}
        />
      ) : null}

      <CommandPalette
        open={chrome.overlay === 'cmdk'}
        onClose={() => chrome.setOverlay(null)}
        commands={commands}
        userId={user?.id ?? null}
        restoreFocusRef={searchTriggerRef}
        onStartDraw={chrome.startDraw}
        onAddLight={() => addLightSource()}
        onOpenInspector={chrome.openInspector}
        onOpenAddPanel={() => chrome.setPanel('add')}
        onPlaceModel={(model) => {
          placeFromCatalog(model, user?.id);
          chrome.setOverlay(null);
          chrome.closePanels();
        }}
        onPlaceAndEdit={(model) => {
          const id = placeFromCatalog(model, user?.id);
          chrome.setOverlay(null);
          chrome.closePanels();
          if (id) {
            useStore.getState().select(id);
            chrome.openInspector();
          }
        }}
      />
      <KeysOverlay open={chrome.overlay === 'keys'} onClose={() => chrome.setOverlay(null)} />

      {detailModel ? (
        <ModelDetailModal
          model={detailModel}
          currentUserId={user?.id ?? null}
          onClose={() => setDetailModel(null)}
          onPlace={placeModel}
          onModelPatched={(kind, patch) => {
            setDetailModel((m) => (m && m.kind === kind ? { ...m, ...patch } : m));
          }}
          onModelDeleted={() => setDetailModel(null)}
        />
      ) : null}

      {shareOpen && workspace && user?.id ? (
        <ShareModal roomId={workspace.id} userId={user.id} onClose={() => setShareOpen(false)} />
      ) : null}
      {exportOpen ? (
        <ExportRenderDialog sceneRef={sceneRef} onClose={() => setExportOpen(false)} />
      ) : null}
      <FeedbackModal
        open={feedbackOpen}
        pageSource="designer"
        onClose={() => setFeedbackOpen(false)}
      />
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
