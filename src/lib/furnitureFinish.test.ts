import { describe, expect, it } from 'vitest';
import { newAttachmentKey, type Item } from '../store';
import {
  assignSignedTextureUrl,
  defaultFinishColor,
  furnitureTopColor,
  finishColor,
  mattressColor,
  itemUsesCustomFinish,
  itemUsesTintColor,
  itemSupportsTopColor,
  itemUsesTopColor,
  shadeHex,
  storedTexturePaths,
  texturePathsToSign,
} from './furnitureFinish';

function wardrobe(patch: Partial<Item> = {}): Item {
  return {
    id: 'w1',
    kind: 'wardrobe',
    position: [0, 0, 0],
    rotationY: 0,
    size: [36, 72, 24],
    label: 'Wardrobe',
    attachmentKey: newAttachmentKey(),
    ...patch,
  };
}

describe('furnitureFinish', () => {
  it('allows photo wraps on built-in wood pieces including beds', () => {
    expect(itemUsesCustomFinish('wardrobe')).toBe(true);
    expect(itemUsesCustomFinish('desk')).toBe(true);
    expect(itemUsesCustomFinish('chair')).toBe(true);
    expect(itemUsesCustomFinish('bed')).toBe(true);
    expect(itemUsesCustomFinish('lamp')).toBe(false);
    expect(itemUsesCustomFinish('imported')).toBe(false);
  });

  it('tints imports, wood pieces, and bed frames', () => {
    expect(itemUsesTintColor('imported')).toBe(true);
    expect(itemUsesTintColor('wardrobe')).toBe(true);
    expect(itemUsesTintColor('bed')).toBe(true);
  });

  it('uses gray-laminate-friendly defaults per kind', () => {
    expect(defaultFinishColor('wardrobe')).toBe('#8a6f52');
    expect(defaultFinishColor('shelf')).toBe('#a98662');
    expect(defaultFinishColor('bed')).toBe('#6b4f33');
    expect(finishColor(wardrobe({ tintColor: '#5c6166' }))).toBe('#5c6166');
    expect(mattressColor(undefined)).toBe('#f1ece1');
    expect(mattressColor('#2c3a4f')).toBe('#2c3a4f');
    expect(furnitureTopColor('dresser', undefined, '#a98662')).toBe('#e8d8b0');
    expect(furnitureTopColor('dresser', '#f2efe8', '#a98662')).toBe('#f2efe8');
    expect(furnitureTopColor('desk', undefined, '#8a6440')).toBe('#e8d8b0');
    expect(furnitureTopColor('desk', '#f2efe8', '#8a6440')).toBe('#f2efe8');
    expect(itemUsesTopColor('dresser')).toBe(true);
    expect(itemUsesTopColor('desk')).toBe(true);
    expect(itemUsesTopColor('wardrobe')).toBe(false);
    expect(
      itemSupportsTopColor({ kind: 'imported', label: 'Max-P desk' }),
    ).toBe(true);
    expect(
      itemSupportsTopColor({ kind: 'imported', label: 'Single Desk' }),
    ).toBe(true);
  });

  it('shades trim darker than the body', () => {
    expect(shadeHex('#5c6166', -28).toLowerCase()).toBe('#40454a');
  });

  it('signs finish photos separately from bed blanket photos', () => {
    const wood = wardrobe({ finishTexturePath: 'uid/finishes/a.jpg' });
    expect(storedTexturePaths(wood)).toEqual(['uid/finishes/a.jpg']);
    expect(texturePathsToSign(wood)).toEqual(['uid/finishes/a.jpg']);
    assignSignedTextureUrl(wood, 'uid/finishes/a.jpg', 'https://signed/a.jpg');
    expect(wood.finishTextureUrl).toBe('https://signed/a.jpg');
    expect(texturePathsToSign(wood)).toEqual([]);

    const bed: Item = {
      ...wardrobe(),
      id: 'b1',
      kind: 'bed',
      label: 'Bed',
      blanketTexturePath: 'uid/bedding/b.jpg',
      finishTexturePath: 'uid/finishes/frame.jpg',
    };
    expect(storedTexturePaths(bed)).toEqual(['uid/bedding/b.jpg', 'uid/finishes/frame.jpg']);
    assignSignedTextureUrl(bed, 'uid/bedding/b.jpg', 'https://signed/b.jpg');
    assignSignedTextureUrl(bed, 'uid/finishes/frame.jpg', 'https://signed/frame.jpg');
    expect(bed.blanketTextureUrl).toBe('https://signed/b.jpg');
    expect(bed.finishTextureUrl).toBe('https://signed/frame.jpg');
  });
});
