import type { WindowCurtains } from './floorPlanGeometry';

export const CURTAIN_COLOR_SWATCHES = [
  { label: 'Linen', color: '#d8c4ad' },
  { label: 'Ivory', color: '#eee8dc' },
  { label: 'Sage', color: '#87917b' },
  { label: 'Clay', color: '#a96f59' },
  { label: 'Navy', color: '#39475e' },
] as const;

export const DEFAULT_WINDOW_CURTAINS: WindowCurtains = {
  color: CURTAIN_COLOR_SWATCHES[0].color,
  openness: 0.65,
};
