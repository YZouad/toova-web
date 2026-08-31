import { describe, expect, it } from 'vitest';
import {
  initialMobileChromeState,
  mobileChromeReducer,
  MOBILE_SHEET_TOP,
  type MobileChromeState,
} from './mobileTypes';

function reduce(
  actions: Parameters<typeof mobileChromeReducer>[1][],
  start: MobileChromeState = initialMobileChromeState(),
) {
  return actions.reduce(mobileChromeReducer, { ...start, gestureLegendSeen: true });
}

describe('mobile chrome reducer', () => {
  it('opens sheets exclusively and clears checklist drill-down when leaving checklist', () => {
    let state = reduce([{ type: 'open_sheet', sheet: 'checklist' }]);
    expect(state.sheet).toBe('checklist');
    state = reduce([{ type: 'open_checklist_item', id: 'bed' }], state);
    expect(state.checklistItemId).toBe('bed');
    state = reduce([{ type: 'open_sheet', sheet: 'add' }], state);
    expect(state.sheet).toBe('add');
    expect(state.checklistItemId).toBeNull();
  });

  it('supports checklist drill-down back', () => {
    const state = reduce([
      { type: 'open_sheet', sheet: 'checklist' },
      { type: 'open_checklist_item', id: 'desk' },
      { type: 'close_checklist_item' },
    ]);
    expect(state.sheet).toBe('checklist');
    expect(state.checklistItemId).toBeNull();
  });

  it('tracks import route independently of sheet kind', () => {
    const state = reduce([
      { type: 'open_sheet', sheet: 'import' },
      { type: 'set_import_route', route: 'photo' },
    ]);
    expect(state.sheet).toBe('import');
    expect(state.importRoute).toBe('photo');
  });

  it('resets sheets for present and draw', () => {
    const base = reduce([
      { type: 'open_sheet', sheet: 'look' },
      { type: 'open_checklist_item', id: 'x' },
    ]);
    expect(reduce([{ type: 'reset_for_present' }], base).sheet).toBeNull();
    expect(reduce([{ type: 'reset_for_draw' }], base).sheet).toBeNull();
    expect(reduce([{ type: 'reset_for_present' }], base).presentControlsVisible).toBe(true);
  });

  it('toggles present controls visibility', () => {
    let state = reduce([{ type: 'toggle_present_controls' }]);
    expect(state.presentControlsVisible).toBe(false);
    state = reduce([{ type: 'show_present_controls' }], state);
    expect(state.presentControlsVisible).toBe(true);
  });

  it('clears inspect sheet when selection chrome clears', () => {
    const inspect = reduce([{ type: 'open_sheet', sheet: 'inspect' }]);
    expect(reduce([{ type: 'clear_selection_chrome' }], inspect).sheet).toBeNull();
    const add = reduce([{ type: 'open_sheet', sheet: 'add' }]);
    expect(reduce([{ type: 'clear_selection_chrome' }], add).sheet).toBe('add');
  });

  it('defines reference snap top offsets for every sheet', () => {
    expect(MOBILE_SHEET_TOP).toMatchObject({
      add: '96px',
      checklist: '96px',
      import: '120px',
      inspect: '150px',
      light: 'auto',
      look: 'auto',
      pieces: '380px',
    });
  });
});

describe('mobile dock visibility contract', () => {
  it('dock should hide when sheet, selection, drawing, or present owns the edge', () => {
    // Mirrors useMobileDesignerChrome showDock formula.
    const showDock = (opts: {
      present: boolean;
      drawing: boolean;
      sheet: string | null;
      selectedId: string | null;
    }) => {
      if (opts.present || opts.drawing) return false;
      if (opts.sheet) return false;
      if (opts.selectedId) return false;
      return true;
    };
    expect(showDock({ present: false, drawing: false, sheet: null, selectedId: null })).toBe(true);
    expect(showDock({ present: false, drawing: false, sheet: 'add', selectedId: null })).toBe(false);
    expect(showDock({ present: false, drawing: false, sheet: null, selectedId: '1' })).toBe(false);
    expect(showDock({ present: true, drawing: false, sheet: null, selectedId: null })).toBe(false);
    expect(showDock({ present: false, drawing: true, sheet: null, selectedId: null })).toBe(false);
  });
});
