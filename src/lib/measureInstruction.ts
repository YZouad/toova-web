import { measureFieldHint, measureFieldLabel, type MeasureAcceptField } from './measureDistance';

export interface MeasureHintState {
  hasPending: boolean;
  acceptField: MeasureAcceptField | null;
  count: number;
}

export function measureBannerHint(state: MeasureHintState): string {
  const field = state.acceptField;
  if (state.hasPending) {
    if (field) {
      return `Click the second point · ${measureFieldHint(field)}`;
    }
    return 'Click the second point to finish this tape';
  }

  if (field) {
    return `Click two points · Measuring ${measureFieldLabel(field)} · ${measureFieldHint(field)}`;
  }

  if (state.count > 0) {
    return 'Click two points for another tape · Esc exits';
  }

  return 'Click two points on any surface · Hold Alt to suspend snap';
}

export function measureEndpointLabel(endpoint: 'a' | 'b'): string {
  return endpoint === 'a' ? 'Point A' : 'Point B';
}
