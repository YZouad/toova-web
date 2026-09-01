import { useCallback, useEffect, useMemo, useReducer } from 'react';
import type { DesignerChrome } from '../useDesignerChrome';
import type { DesignerPanel, ImportRoute, InspectorTab } from '../chromeTypes';
import {
  initialMobileChromeState,
  mobileChromeReducer,
  type MobileChromeState,
  type MobileSheetKind,
} from './mobileTypes';

export interface MobileDesignerChromeApi extends MobileChromeState {
  openSheet: (sheet: Exclude<MobileSheetKind, null>) => void;
  closeSheet: () => void;
  openChecklist: () => void;
  openChecklistItem: (id: string) => void;
  closeChecklistItem: () => void;
  openImport: (route?: ImportRoute) => void;
  setImportRoute: (route: ImportRoute) => void;
  openInspector: (tab?: InspectorTab) => void;
  setInspectorTab: (tab: InspectorTab) => void;
  togglePresentControls: () => void;
  showPresentControls: () => void;
  /** Dock visible when nothing owns the bottom edge. */
  showDock: boolean;
  /** Camera / checklist chips visible on home-ish surfaces. */
  showSceneChips: boolean;
}

function dockPanelToSheet(panel: DesignerPanel): Exclude<MobileSheetKind, null> | null {
  switch (panel) {
    case 'add':
      return 'add';
    case 'look':
      return 'look';
    case 'light':
      return 'light';
    case 'pieces':
      return 'pieces';
    case 'inspect':
      return 'inspect';
    default:
      return null;
  }
}

/**
 * Phone-only chrome state. Shares selection / save / present / draw with the
 * desktop chrome API but keeps sheet ownership local so desktop DOM stays untouched.
 */
export function useMobileDesignerChrome(desktop: DesignerChrome): MobileDesignerChromeApi {
  const [state, dispatch] = useReducer(mobileChromeReducer, undefined, initialMobileChromeState);

  // Mirror desktop panel opens into mobile sheets when compact chrome is active.
  useEffect(() => {
    const mapped = dockPanelToSheet(desktop.panel);
    if (mapped && state.sheet !== mapped) {
      dispatch({ type: 'open_sheet', sheet: mapped });
    }
    if (!desktop.panel && (state.sheet === 'add' || state.sheet === 'look' || state.sheet === 'light' || state.sheet === 'pieces' || state.sheet === 'inspect' || state.sheet === 'import')) {
      // Desktop closed the panel (e.g. Escape) — close mobile sheet too.
      if (!desktop.drawing && !desktop.present) {
        // Only clear if desktop intentionally closed; selection can still open inspect.
      }
    }
  }, [desktop.panel]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (desktop.importOpen) {
      dispatch({ type: 'open_sheet', sheet: 'import' });
      dispatch({ type: 'set_import_route', route: desktop.importRoute });
    }
  }, [desktop.importOpen, desktop.importRoute]);

  useEffect(() => {
    if (desktop.present) dispatch({ type: 'reset_for_present' });
  }, [desktop.present]);

  useEffect(() => {
    if (desktop.drawing) dispatch({ type: 'reset_for_draw' });
  }, [desktop.drawing]);

  useEffect(() => {
    if (!desktop.selectedId) dispatch({ type: 'clear_selection_chrome' });
  }, [desktop.selectedId]);

  const openSheet = useCallback(
    (sheet: Exclude<MobileSheetKind, null>) => {
      dispatch({ type: 'open_sheet', sheet });
      const panelMap: Partial<Record<Exclude<MobileSheetKind, null>, DesignerPanel>> = {
        add: 'add',
        look: 'look',
        light: 'light',
        pieces: 'pieces',
        inspect: 'inspect',
      };
      const panel = panelMap[sheet];
      if (panel) desktop.setPanel(panel);
      if (sheet === 'checklist') desktop.closePanels();
    },
    [desktop],
  );

  const closeSheet = useCallback(() => {
    dispatch({ type: 'close_sheet' });
    desktop.closePanels();
  }, [desktop]);

  const openChecklist = useCallback(() => {
    dispatch({ type: 'open_sheet', sheet: 'checklist' });
    desktop.closePanels();
  }, [desktop]);

  const openChecklistItem = useCallback((id: string) => {
    dispatch({ type: 'open_checklist_item', id });
  }, []);

  const closeChecklistItem = useCallback(() => {
    dispatch({ type: 'close_checklist_item' });
  }, []);

  const openImport = useCallback(
    (route: ImportRoute = null) => {
      dispatch({ type: 'open_sheet', sheet: 'import' });
      dispatch({ type: 'set_import_route', route });
      desktop.openImport(route);
    },
    [desktop],
  );

  const setImportRoute = useCallback((route: ImportRoute) => {
    dispatch({ type: 'set_import_route', route });
  }, []);

  const openInspector = useCallback(
    (tab?: InspectorTab) => {
      dispatch({ type: 'open_sheet', sheet: 'inspect' });
      if (tab) dispatch({ type: 'set_inspector_tab', tab });
      desktop.openInspector();
      if (tab) desktop.setInspectorTab(tab);
    },
    [desktop],
  );

  const setInspectorTab = useCallback(
    (tab: InspectorTab) => {
      dispatch({ type: 'set_inspector_tab', tab });
      desktop.setInspectorTab(tab);
    },
    [desktop],
  );

  const togglePresentControls = useCallback(() => {
    dispatch({ type: 'toggle_present_controls' });
  }, []);

  const showPresentControls = useCallback(() => {
    dispatch({ type: 'show_present_controls' });
  }, []);

  const showDock = useMemo(() => {
    if (desktop.present || desktop.drawing) return false;
    if (state.sheet) return false;
    if (desktop.selectedId) return false;
    return true;
  }, [desktop.present, desktop.drawing, desktop.selectedId, state.sheet]);

  const showSceneChips = useMemo(() => {
    if (desktop.present || desktop.drawing) return false;
    if (state.sheet === 'import' || state.sheet === 'inspect') return false;
    return true;
  }, [desktop.present, desktop.drawing, state.sheet]);

  return {
    ...state,
    openSheet,
    closeSheet,
    openChecklist,
    openChecklistItem,
    closeChecklistItem,
    openImport,
    setImportRoute,
    openInspector,
    setInspectorTab,
    togglePresentControls,
    showPresentControls,
    showDock,
    showSceneChips,
  };
}
