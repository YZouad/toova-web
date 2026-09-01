import type { InspectorTab } from './chromeTypes';

/** Default inspector tab for a selected item kind. */
export function defaultInspectorTab(kind: string | undefined): InspectorTab {
  if (kind === 'hanging') return 'path';
  if (kind === 'light') return 'light';
  if (kind === 'bed') return 'bedding';
  return 'fit';
}

/** Which tabs are valid for a kind. */
export function inspectorTabsForKind(kind: string | undefined): InspectorTab[] {
  if (kind === 'hanging') return ['path', 'bulbs'];
  if (kind === 'light') return ['light'];
  if (kind === 'bed') return ['fit', 'bedding', 'finish'];
  return ['fit', 'finish'];
}
