import { measureFieldHint, measureFieldLabel, type MeasureAcceptField } from './measureDistance';
import type { MeasureDraft } from './measureDraftState';

export function measureBannerHint(draft: MeasureDraft): string {
  const field = draft.acceptField;
  const measuringField = field ? `Measuring ${measureFieldLabel(field)}` : null;

  if (draft.draggingEndpoint) {
    return 'Drag to move point · Release to place';
  }

  if (measuringField && field) {
    return `${measuringField} · ${measureFieldHint(field)} · Drag points to measure`;
  }

  if (draft.activeEndpoint) {
    return 'Drag points to measure · Adjust height on selected point · Done when ready';
  }

  return 'Drag either point to measure · Click a point to select it';
}

export function measureEndpointLabel(endpoint: 'a' | 'b'): string {
  return endpoint === 'a' ? 'Point A' : 'Point B';
}
