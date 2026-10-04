import { describe, expect, it } from 'vitest';
import {
  AGENTIC_VIBE_FURNISHINGS,
  applyAgenticVibeToItems,
  appearanceForAgenticVibe,
} from './agenticRoomVibe';
import { newAttachmentKey, type Item } from '../store';

function builtinItem(kind: Item['kind'], extra: Partial<Item> = {}): Item {
  return {
    id: 'item-1',
    kind,
    position: [0, 0, 0],
    rotationY: 0,
    size: [24, 24, 24],
    label: kind,
    attachmentKey: newAttachmentKey(),
    ...extra,
  };
}

describe('agenticRoomVibe', () => {
  it('uses dark floor and trim for moody vibe', () => {
    const appearance = appearanceForAgenticVibe('moody');
    expect(appearance.wallColor).toBe('#3a3a3a');
    expect(appearance.floorPreset).toBe('charcoalCarpet');
    expect(appearance.trimPreset).toBe('blackTrim');
    expect(appearance.recessedLights).toBe(true);
  });

  it('tints wood furniture for moody vibe', () => {
    const [dresser, nightstand, bed] = applyAgenticVibeToItems(
      [
        builtinItem('dresser'),
        builtinItem('nightstand'),
        builtinItem('bed', { beddingEnabled: true }),
      ],
      'moody',
    );
    expect(dresser.tintColor).toBe(AGENTIC_VIBE_FURNISHINGS.moody.woodTint);
    expect(nightstand.tintColor).toBe(AGENTIC_VIBE_FURNISHINGS.moody.woodTint);
    expect(bed.tintColor).toBe(AGENTIC_VIBE_FURNISHINGS.moody.bedFrameTint);
    expect(bed.blanketColor).toBe(AGENTIC_VIBE_FURNISHINGS.moody.blanketColor);
    expect(bed.mattressColor).toBe(AGENTIC_VIBE_FURNISHINGS.moody.mattressColor);
    expect(dresser.topColor).toBe(AGENTIC_VIBE_FURNISHINGS.moody.topColor);
  });

  it('uses sage blanket and wood tints for sage vibe', () => {
    const [bed] = applyAgenticVibeToItems([builtinItem('bed', { beddingEnabled: true })], 'sage');
    expect(bed.blanketColor).toBe('#5c7a6a');
    expect(bed.tintColor).toBe('#6b4f33');
  });
});
