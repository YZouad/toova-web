import { describe, expect, it } from 'vitest';
import { newAttachmentKey, type Item } from '../store';
import { dbRowToItem, serializeLayoutForRoom, type RoomItemRow } from './roomLayoutSerialize';

function wardrobe(patch: Partial<Item> = {}): Item {
  return {
    id: 'w1',
    kind: 'wardrobe',
    position: [10, 0, 20],
    rotationY: 0,
    size: [36, 72, 24],
    label: 'Wardrobe',
    attachmentKey: 'att-wardrobe',
    ...patch,
  };
}

describe('roomLayoutSerialize furniture finish', () => {
  it('round-trips a wardrobe photo wrap and tint through blanket_texture_path', () => {
    const item = wardrobe({
      tintColor: '#5c6166',
      finishTexturePath: 'user-1/finishes/wood.jpg',
    });
    const rows = serializeLayoutForRoom('room-1', { [item.id]: item }, [item.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.blanket_color).toBe('#5c6166');
    expect(rows[0]!.tint_color).toBe('#5c6166');
    expect(rows[0]!.blanket_texture_path).toBe('user-1/finishes/wood.jpg');
    expect(rows[0]!.finish_texture_path).toBe('user-1/finishes/wood.jpg');

    const restored = dbRowToItem({
      id: 'w1',
      room_id: 'room-1',
      kind: 'wardrobe',
      label: 'Wardrobe',
      pos_x: 10,
      pos_y: 0,
      pos_z: 20,
      rotation_y: 0,
      size_w: 36,
      size_h: 72,
      size_d: 24,
      bed_leg_height: null,
      natural_w: null,
      natural_h: null,
      natural_d: null,
      sort_order: 0,
      blanket_color: rows[0]!.blanket_color,
      blanket_texture_path: rows[0]!.blanket_texture_path,
      tint_color: rows[0]!.tint_color,
      finish_texture_path: rows[0]!.finish_texture_path,
      instance_key: 'att-wardrobe',
    } satisfies RoomItemRow);

    expect(restored?.kind).toBe('wardrobe');
    expect(restored?.tintColor).toBe('#5c6166');
    expect(restored?.finishTexturePath).toBe('user-1/finishes/wood.jpg');
    expect(restored?.blanketTexturePath).toBeUndefined();
  });

  it('keeps bed blanket textures off the furniture finish field', () => {
    const bed: Item = {
      id: 'b1',
      kind: 'bed',
      position: [0, 0, 0],
      rotationY: 0,
      size: [38, 22, 75],
      label: 'Twin Bed',
      attachmentKey: 'att-bed',
      tintColor: '#5c6166',
      mattressColor: '#d5d8df',
      blanketTexturePath: 'user-1/bedding/quilt.jpg',
      finishTexturePath: 'user-1/finishes/frame.jpg',
    };
    const rows = serializeLayoutForRoom('room-1', { [bed.id]: bed }, [bed.id]);
    expect(rows[0]!.blanket_texture_path).toBe('user-1/bedding/quilt.jpg');
    expect(rows[0]!.finish_texture_path).toBe('user-1/finishes/frame.jpg');
    expect(rows[0]!.tint_color).toBe('#5c6166');
    expect(rows[0]!.mattress_color).toBe('#d5d8df');
    expect(rows[0]!.blanket_color).toBeNull();

    const restored = dbRowToItem({
      id: 'b1',
      room_id: 'room-1',
      kind: 'bed',
      label: 'Twin Bed',
      pos_x: 0,
      pos_y: 0,
      pos_z: 0,
      rotation_y: 0,
      size_w: 38,
      size_h: 22,
      size_d: 75,
      bed_leg_height: null,
      natural_w: null,
      natural_h: null,
      natural_d: null,
      sort_order: 0,
      blanket_texture_path: 'user-1/bedding/quilt.jpg',
      finish_texture_path: 'user-1/finishes/frame.jpg',
      tint_color: '#5c6166',
      mattress_color: '#d5d8df',
      instance_key: 'att-bed',
    });
    expect(restored?.blanketTexturePath).toBe('user-1/bedding/quilt.jpg');
    expect(restored?.finishTexturePath).toBe('user-1/finishes/frame.jpg');
    expect(restored?.tintColor).toBe('#5c6166');
    expect(restored?.mattressColor).toBe('#d5d8df');
  });

  it('round-trips a desk top color separately from the base', () => {
    const desk: Item = {
      id: 'dk1',
      kind: 'desk',
      position: [0, 0, 0],
      rotationY: 0,
      size: [48, 30, 24],
      label: 'Desk',
      attachmentKey: 'att-desk',
      tintColor: '#8a6440',
      topColor: '#f2efe8',
    };
    const rows = serializeLayoutForRoom('room-1', { [desk.id]: desk }, [desk.id]);
    expect(rows[0]!.tint_color).toBe('#8a6440');
    expect(rows[0]!.top_color).toBe('#f2efe8');

    const restored = dbRowToItem({
      id: 'dk1',
      room_id: 'room-1',
      kind: 'desk',
      label: 'Desk',
      pos_x: 0,
      pos_y: 0,
      pos_z: 0,
      rotation_y: 0,
      size_w: 48,
      size_h: 30,
      size_d: 24,
      bed_leg_height: null,
      natural_w: null,
      natural_h: null,
      natural_d: null,
      sort_order: 0,
      tint_color: '#8a6440',
      top_color: '#f2efe8',
      instance_key: 'att-desk',
    });
    expect(restored?.tintColor).toBe('#8a6440');
    expect(restored?.topColor).toBe('#f2efe8');
  });

  it('round-trips an imported desk top color separately from the base', () => {
    const desk: Item = {
      id: 'imp1',
      kind: 'imported',
      position: [0, 0, 0],
      rotationY: 0,
      size: [44, 27, 22],
      label: 'Max-P desk',
      attachmentKey: 'att-maxp-desk',
      tintColor: '#8a6440',
      topColor: '#f2efe8',
    };
    const rows = serializeLayoutForRoom('room-1', { [desk.id]: desk }, [desk.id]);
    expect(rows[0]!.tint_color).toBe('#8a6440');
    expect(rows[0]!.top_color).toBe('#f2efe8');
  });

  it('round-trips a dresser top color separately from the base', () => {
    const dresser: Item = {
      id: 'd1',
      kind: 'dresser',
      position: [0, 0, 0],
      rotationY: 0,
      size: [30, 32, 18],
      label: 'Dresser',
      attachmentKey: 'att-dresser',
      tintColor: '#5c6166',
      topColor: '#f2efe8',
    };
    const rows = serializeLayoutForRoom('room-1', { [dresser.id]: dresser }, [dresser.id]);
    expect(rows[0]!.tint_color).toBe('#5c6166');
    expect(rows[0]!.top_color).toBe('#f2efe8');

    const restored = dbRowToItem({
      id: 'd1',
      room_id: 'room-1',
      kind: 'dresser',
      label: 'Dresser',
      pos_x: 0,
      pos_y: 0,
      pos_z: 0,
      rotation_y: 0,
      size_w: 30,
      size_h: 32,
      size_d: 18,
      bed_leg_height: null,
      natural_w: null,
      natural_h: null,
      natural_d: null,
      sort_order: 0,
      tint_color: '#5c6166',
      top_color: '#f2efe8',
      instance_key: 'att-dresser',
    });
    expect(restored?.tintColor).toBe('#5c6166');
    expect(restored?.topColor).toBe('#f2efe8');
  });
});
