import { useMemo, type RefObject } from 'react';
import { useShoppingCatalogContext } from '../../../context/ShoppingCatalogContext';
import {
  categoryIdsSatisfiedByPlacements,
  leafCategories,
  roomItemsToPlacementRefs,
} from '../../../lib/dormChecklist';
import { useStore, type CameraPresetId } from '../../../store';
import { VIEW_PRESETS, type CatalogModel } from '../chromeTypes';
import {
  IconBack,
  IconEye,
  IconLight,
  IconPieces,
  IconPlus,
  IconRoomLook,
  IconSearch,
  IconUpload,
} from '../icons';
import type { DesignerChrome } from '../useDesignerChrome';
import { MobileChecklistSheet } from './MobileChecklistSheet';
import { MobileDrawChrome } from './MobileDrawChrome';
import { MobileImportSheet } from './MobileImportSheet';
import { MobileInspectorSheet } from './MobileInspectorSheet';
import { MobileLibrarySheet } from './MobileLibrarySheet';
import { MobileLightSheet } from './MobileLightSheet';
import { MobileLookSheet } from './MobileLookSheet';
import { MobilePiecesSheet } from './MobilePiecesSheet';
import { MobilePresentBar } from './MobilePresentBar';
import { MobileSelectionActions } from './MobileSelectionActions';
import { useMobileDesignerChrome } from './useMobileDesignerChrome';

function detailLabelFor(kind: string | undefined): string {
  if (kind === 'bed') return 'Bedding & details';
  if (kind === 'hanging') return 'Path & bulbs';
  if (kind === 'light') return 'Light settings';
  return 'Edit details';
}

export interface MobileDesignerChromeProps {
  chrome: DesignerChrome;
  roomName: string;
  onRoomNameChange: (name: string) => void;
  onRoomNameBlur: () => void;
  savedLabel: string;
  saving: boolean;
  onBack: () => void;
  onSave: () => void;
  /** Visible topbar label — "Save" or "Save design" for guests. */
  saveLabel?: string;
  onEditFloorPlan?: () => void;
  onOpenShare?: () => void;
  onOpenExport: () => void;
  onOpenFeedback: () => void;
  onOpenFullChecklist: () => void;
  goPreset: (id: CameraPresetId) => void;
  cameraPreset: CameraPresetId;
  addLightSource: () => void;
  isAdmin?: boolean;
  onOpenModel: (model: CatalogModel) => void;
  onImportComplete: (model: CatalogModel) => void;
  searchTriggerRef: RefObject<HTMLButtonElement | null>;
}

/**
 * Phone-only designer chrome. Mounted when compact; desktop tree stays separate.
 */
export function MobileDesignerChrome({
  chrome,
  roomName,
  onRoomNameChange,
  onRoomNameBlur,
  savedLabel,
  saving,
  onBack,
  onSave,
  saveLabel = 'Save',
  onEditFloorPlan,
  onOpenShare,
  onOpenExport,
  onOpenFeedback,
  onOpenFullChecklist,
  goPreset,
  cameraPreset,
  addLightSource,
  isAdmin,
  onOpenModel,
  onImportComplete,
  searchTriggerRef,
}: MobileDesignerChromeProps) {
  const mobile = useMobileDesignerChrome(chrome);
  const order = useStore((s) => s.order);
  const items = useStore((s) => s.items);
  const { categories, budgetSummary } = useShoppingCatalogContext();

  const checklistMeta = useMemo(() => {
    const leaves = leafCategories(categories).filter((c) => c.published);
    const placedIds = categoryIdsSatisfiedByPlacements(
      categories,
      roomItemsToPlacementRefs(items, order),
    );
    const placed = leaves.filter((leaf) => placedIds.has(leaf.id)).length;
    const total = leaves.length;
    const pillLabel =
      budgetSummary.budgetCents != null
        ? budgetSummary.remainingLabel
        : budgetSummary.spentCents > 0
          ? budgetSummary.spentLabel
          : 'Set budget';
    return {
      placed,
      total,
      pillLabel,
      progress: total === 0 ? 0 : placed / total,
    };
  }, [categories, items, order, budgetSummary]);

  const viewIndex = Math.max(
    0,
    VIEW_PRESETS.findIndex((p) => p.id === cameraPreset),
  );
  const viewLabel = VIEW_PRESETS[viewIndex]?.label ?? 'Room';

  const cycleView = () => {
    const next = VIEW_PRESETS[(viewIndex + 1) % VIEW_PRESETS.length]!;
    goPreset(next.id);
  };

  const cycleViewBy = (dir: -1 | 1) => {
    const next = VIEW_PRESETS[(viewIndex + dir + VIEW_PRESETS.length) % VIEW_PRESETS.length]!;
    goPreset(next.id);
  };

  const moreOpen = chrome.overlay === 'more';
  const showSelection =
    !!chrome.selectedId &&
    !chrome.present &&
    !chrome.drawing &&
    !mobile.sheet;

  return (
    <div className="dgm-root" aria-label="Phone designer chrome">
      {!chrome.present && !chrome.drawing ? (
        <header className="dgm-topbar">
          <button type="button" className="dgm-icon-btn" onClick={onBack} aria-label="Back to rooms">
            <IconBack />
          </button>
          <button
            type="button"
            className="dgm-save-btn"
            data-tour-id="topbar-save"
            disabled={saving}
            onClick={onSave}
          >
            {saving ? 'Saving…' : saveLabel}
          </button>
          <div className="dgm-topbar-identity">
            <input
              className="dgm-topbar-name"
              value={roomName}
              onChange={(e) => onRoomNameChange(e.target.value)}
              onBlur={onRoomNameBlur}
              aria-label="Room name"
            />
            <span className="dgm-topbar-meta">
              {saving ? 'Saving…' : savedLabel}
            </span>
          </div>
          <button
            type="button"
            className="dgm-icon-btn"
            ref={searchTriggerRef as RefObject<HTMLButtonElement>}
            aria-label="Search"
            onClick={() => chrome.setOverlay('cmdk')}
          >
            <IconSearch />
          </button>
          <button
            type="button"
            className="dgm-icon-btn dgm-icon-btn--upload"
            data-tour-id="topbar-upload"
            aria-label="Upload or generate a model"
            onClick={() => mobile.openImport(null)}
          >
            <IconUpload />
          </button>
          <div className="dgm-more">
            <button
              type="button"
              className="dgm-icon-btn"
              aria-label="More actions"
              aria-expanded={moreOpen}
              onClick={() => chrome.setOverlay(moreOpen ? null : 'more')}
            >
              ···
            </button>
            {moreOpen ? (
              <div className="dgm-more-menu" role="menu">
                <button
                  type="button"
                  className="dgm-more-menu__item"
                  role="menuitem"
                  onClick={() => {
                    chrome.togglePresent();
                    chrome.setOverlay(null);
                  }}
                >
                  Present
                </button>
                {onOpenShare ? (
                  <button
                    type="button"
                    className="dgm-more-menu__item"
                    role="menuitem"
                    onClick={() => {
                      onOpenShare();
                      chrome.setOverlay(null);
                    }}
                  >
                    Share design
                  </button>
                ) : null}
                <button
                  type="button"
                  className="dgm-more-menu__item"
                  role="menuitem"
                  onClick={() => {
                    onOpenExport();
                    chrome.setOverlay(null);
                  }}
                >
                  Export render
                </button>
                {onEditFloorPlan ? (
                  <button
                    type="button"
                    className="dgm-more-menu__item"
                    role="menuitem"
                    onClick={() => {
                      onEditFloorPlan();
                      chrome.setOverlay(null);
                    }}
                  >
                    Edit floor plan
                  </button>
                ) : null}
                <button
                  type="button"
                  className="dgm-more-menu__item"
                  role="menuitem"
                  onClick={() => {
                    onOpenFullChecklist();
                    chrome.setOverlay(null);
                  }}
                >
                  Full checklist
                </button>
                <button
                  type="button"
                  className="dgm-more-menu__item"
                  role="menuitem"
                  onClick={() => {
                    chrome.restartTour();
                    chrome.setOverlay(null);
                  }}
                >
                  Replay the walkthrough
                </button>
                <button
                  type="button"
                  className="dgm-more-menu__item"
                  role="menuitem"
                  onClick={() => {
                    onOpenFeedback();
                    chrome.setOverlay(null);
                  }}
                >
                  Send feedback
                </button>
              </div>
            ) : null}
          </div>
        </header>
      ) : null}

      {mobile.showSceneChips ? (
        <div className="dgm-scene-chips">
          <button type="button" className="dgm-pill" data-tour-id="camera" onClick={cycleView}>
            <IconEye />
            <span>{viewLabel}</span>
          </button>
          <div className="dgm-scene-chips__spacer" />
          <button
            type="button"
            className="dgm-pill"
            data-tour-id="ticker"
            onClick={() => mobile.openChecklist()}
          >
            <span className="dgm-pill-progress" aria-hidden>
              <span style={{ width: `${Math.round(checklistMeta.progress * 100)}%` }} />
            </span>
            <span>{checklistMeta.pillLabel}</span>
          </button>
        </div>
      ) : null}

      {chrome.drawing ? <MobileDrawChrome /> : null}

      {showSelection ? (
        <MobileSelectionActions
          onEditDetails={() => mobile.openInspector()}
          onDismiss={chrome.clearSelection}
          detailLabel={detailLabelFor(chrome.selectedItem?.kind)}
        />
      ) : null}

      {mobile.showDock ? (
        <nav className="dgm-dock" aria-label="Designer tools">
          <button
            type="button"
            className="dgm-dock-btn is-primary"
            data-tour-id="dock-add"
            onClick={() => mobile.openSheet('add')}
          >
            <IconPlus stroke="#F8F3EA" />
            <span>Add</span>
          </button>
          <button
            type="button"
            className="dgm-dock-btn"
            onClick={() => mobile.openSheet('look')}
          >
            <IconRoomLook />
            <span>Room look</span>
          </button>
          <button
            type="button"
            className="dgm-dock-btn"
            onClick={() => mobile.openSheet('light')}
          >
            <IconLight />
            <span>Light</span>
          </button>
          <button
            type="button"
            className="dgm-dock-btn"
            onClick={() => mobile.openSheet('pieces')}
          >
            <IconPieces />
            <span>Pieces</span>
          </button>
        </nav>
      ) : null}

      {mobile.sheet === 'add' ? (
        <MobileLibrarySheet
          onClose={mobile.closeSheet}
          onImport={() => mobile.openImport(null)}
          onOpenModel={onOpenModel}
          onStartDraw={chrome.startDraw}
          onAddLight={() => {
            addLightSource();
            mobile.closeSheet();
          }}
        />
      ) : null}
      {mobile.sheet === 'look' ? <MobileLookSheet onClose={mobile.closeSheet} /> : null}
      {mobile.sheet === 'light' ? (
        <MobileLightSheet
          onClose={mobile.closeSheet}
          onStartDraw={chrome.startDraw}
          onAddLight={() => addLightSource()}
        />
      ) : null}
      {mobile.sheet === 'pieces' ? <MobilePiecesSheet onClose={mobile.closeSheet} /> : null}
      {mobile.sheet === 'inspect' ? (
        <MobileInspectorSheet
          tab={mobile.inspectorTab}
          onTab={mobile.setInspectorTab}
          onClose={mobile.closeSheet}
        />
      ) : null}
      {mobile.sheet === 'checklist' ? (
        <MobileChecklistSheet
          onClose={mobile.closeSheet}
          itemId={mobile.checklistItemId}
          onOpenItem={mobile.openChecklistItem}
          onCloseItem={mobile.closeChecklistItem}
          onStartDraw={chrome.startDraw}
        />
      ) : null}
      {mobile.sheet === 'import' || chrome.importOpen ? (
        <MobileImportSheet
          open
          route={mobile.importRoute ?? chrome.importRoute}
          onRoute={(r) => {
            mobile.setImportRoute(r);
            chrome.setImportRoute(r);
          }}
          onClose={() => {
            mobile.closeSheet();
            chrome.closeImport();
          }}
          isAdmin={isAdmin}
          onComplete={(model) => {
            mobile.closeSheet();
            chrome.closeImport();
            onImportComplete(model);
          }}
        />
      ) : null}

      {chrome.present ? (
        <MobilePresentBar
          viewLabel={viewLabel}
          onPrevView={() => cycleViewBy(-1)}
          onNextView={() => cycleViewBy(1)}
          onEdit={() => chrome.setPresent(false)}
          presentControlsVisible={mobile.presentControlsVisible}
          onToggle={mobile.togglePresentControls}
        />
      ) : null}
    </div>
  );
}
