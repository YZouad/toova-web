import type { ImportRoute, InspectorTab } from '../chromeTypes';

/** Mobile sheet kinds that occupy the bottom of the phone UI. */
export type MobileSheetKind =
  | null
  | 'add'
  | 'look'
  | 'light'
  | 'pieces'
  | 'inspect'
  | 'checklist'
  | 'import';

/**
 * Reference snap offsets from Designer Phone.dc.html —
 * sheet top inset from the viewport top (smaller = taller sheet).
 * Use `'auto'` for short panels that should hug content instead of
 * stretching empty body space.
 */
export const MOBILE_SHEET_TOP: Record<Exclude<MobileSheetKind, null>, string> = {
  add: '96px',
  checklist: '96px',
  import: '120px',
  inspect: '150px',
  light: 'auto',
  look: 'auto',
  pieces: '380px',
};

export const MOBILE_GESTURE_LEGEND_KEY = 'toova-designer-mobile-gesture-legend-v1';

export interface MobileChromeState {
  sheet: MobileSheetKind;
  /** Checklist category currently drilled into (shop item view). */
  checklistItemId: string | null;
  importRoute: ImportRoute;
  inspectorTab: InspectorTab;
  /** Present-mode chrome can be tapped away. */
  presentControlsVisible: boolean;
  /** One-time gesture legend under the camera chip. */
  gestureLegendSeen: boolean;
}

export type MobileChromeAction =
  | { type: 'open_sheet'; sheet: Exclude<MobileSheetKind, null> }
  | { type: 'close_sheet' }
  | { type: 'open_checklist_item'; id: string }
  | { type: 'close_checklist_item' }
  | { type: 'set_import_route'; route: ImportRoute }
  | { type: 'set_inspector_tab'; tab: InspectorTab }
  | { type: 'toggle_present_controls' }
  | { type: 'show_present_controls' }
  | { type: 'dismiss_gesture_legend' }
  | { type: 'reset_for_present' }
  | { type: 'reset_for_draw' }
  | { type: 'clear_selection_chrome' };

export function loadGestureLegendSeen(): boolean {
  try {
    return localStorage.getItem(MOBILE_GESTURE_LEGEND_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveGestureLegendSeen() {
  try {
    localStorage.setItem(MOBILE_GESTURE_LEGEND_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function initialMobileChromeState(): MobileChromeState {
  return {
    sheet: null,
    checklistItemId: null,
    importRoute: null,
    inspectorTab: 'fit',
    presentControlsVisible: true,
    gestureLegendSeen: loadGestureLegendSeen(),
  };
}

export function mobileChromeReducer(
  state: MobileChromeState,
  action: MobileChromeAction,
): MobileChromeState {
  switch (action.type) {
    case 'open_sheet':
      return {
        ...state,
        sheet: action.sheet,
        checklistItemId: action.sheet === 'checklist' ? state.checklistItemId : null,
        importRoute: action.sheet === 'import' ? state.importRoute : null,
      };
    case 'close_sheet':
      return {
        ...state,
        sheet: null,
        checklistItemId: null,
        importRoute: null,
      };
    case 'open_checklist_item':
      return {
        ...state,
        sheet: 'checklist',
        checklistItemId: action.id,
      };
    case 'close_checklist_item':
      return { ...state, checklistItemId: null };
    case 'set_import_route':
      return { ...state, importRoute: action.route };
    case 'set_inspector_tab':
      return { ...state, inspectorTab: action.tab };
    case 'toggle_present_controls':
      return { ...state, presentControlsVisible: !state.presentControlsVisible };
    case 'show_present_controls':
      return { ...state, presentControlsVisible: true };
    case 'dismiss_gesture_legend':
      saveGestureLegendSeen();
      return { ...state, gestureLegendSeen: true };
    case 'reset_for_present':
      return {
        ...state,
        sheet: null,
        checklistItemId: null,
        importRoute: null,
        presentControlsVisible: true,
      };
    case 'reset_for_draw':
      return {
        ...state,
        sheet: null,
        checklistItemId: null,
        importRoute: null,
      };
    case 'clear_selection_chrome':
      return state.sheet === 'inspect'
        ? { ...state, sheet: null }
        : state;
    default:
      return state;
  }
}
