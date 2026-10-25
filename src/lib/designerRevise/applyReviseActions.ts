import {
  furnishingsFromColorScheme,
  mergeAppearanceWithColorScheme,
} from '../agenticColorScheme';
import { applyAgenticPaletteToItems, furnishingsForAgenticVibe } from '../agenticRoomVibe';
import { nearestComforterColorId, nearestSheetColorId } from './beddingNearest';
import { placeCuratedProduct } from '../placeCuratedProduct';
import { resolveValidXZ } from '../../interaction/collision';
import type { Item } from '../../store';
import type { BeddingConfigPatch } from '../bedding/types';
import type { RoomGeometry } from '../roomGeometry';
import type { CuratedProduct } from '../dormChecklist';
import { targetPositionForPlacement } from './placementHint';
import {
  activeProductForProposal,
  resolvePendingAddProposal,
  type PendingAddProposal,
} from './pendingAdd';
import { resolveUniqueItemTarget } from './resolveItemTarget';
import {
  MAX_ADDS_PER_TURN,
  MAX_REMOVES_WITHOUT_CONFIRM,
  type ReviseAction,
} from './reviseSchema';
import { captureReviseUndoSnapshot, type ReviseUndoSnapshot } from './reviseUndo';
import { useStore } from '../../store';
import { FURNITURE, type GalleryFurnitureKind } from '../../furniture/registry';

export interface PendingRemoveBatch {
  ids: string[];
  description: string;
}

export interface ApplyReviseResult {
  appliedSummaries: string[];
  pendingAdds: PendingAddProposal[];
  pendingRemoves: PendingRemoveBatch | null;
  undoSnapshot: ReviseUndoSnapshot | null;
  warnings: string[];
}

type StoreSlice = ReturnType<typeof useStore.getState>;

function applyPaletteToStoreItems(
  getState: () => StoreSlice,
  palette: ReturnType<typeof furnishingsFromColorScheme>,
  itemIds?: string[],
) {
  const s = getState();
  const ids = itemIds ?? s.order;
  const subset = ids.map((id) => s.items[id]).filter(Boolean) as Item[];
  const painted = applyAgenticPaletteToItems(subset, palette);
  for (const next of painted) {
    const patch: Partial<Item> = {};
    if (next.tintColor !== s.items[next.id]?.tintColor) patch.tintColor = next.tintColor;
    if (next.mattressColor !== s.items[next.id]?.mattressColor) {
      patch.mattressColor = next.mattressColor;
    }
    if (next.blanketColor !== s.items[next.id]?.blanketColor) {
      patch.blanketColor = next.blanketColor;
    }
    if (next.topColor !== s.items[next.id]?.topColor) patch.topColor = next.topColor;
    if (next.emitter !== s.items[next.id]?.emitter) patch.emitter = next.emitter;
    if (Object.keys(patch).length === 0) continue;
    useStore.setState((state) => ({
      items: { ...state.items, [next.id]: { ...state.items[next.id]!, ...patch } },
    }));
  }
}

function patchAllWindowCurtains(color: string, openingId: string | undefined, geom: RoomGeometry) {
  const openings = geom.openings.filter((o) => o.kind === 'window');
  const targets = openingId ? openings.filter((o) => o.id === openingId) : openings;
  for (const o of targets) {
    useStore.getState().patchOpening(o.id, {
      curtains: { color, openness: o.curtains?.openness ?? 0.35 },
    });
  }
}

export function applyReviseActions(
  actions: ReviseAction[],
  products: CuratedProduct[],
): ApplyReviseResult {
  const warnings: string[] = [];
  const appliedSummaries: string[] = [];
  const pendingAdds: PendingAddProposal[] = [];
  const removeIds: string[] = [];

  const immediate = actions.filter((a) => a.type !== 'add_item');
  const addActions = actions.filter((a) => a.type === 'add_item');

  if (addActions.length > MAX_ADDS_PER_TURN) {
    warnings.push(`Only ${MAX_ADDS_PER_TURN} add proposals per turn; extra requests were skipped.`);
  }

  let undoSnapshot: ReviseUndoSnapshot | null = null;
  const needsUndo = immediate.some(
    (a) => !(a.type === 'remove_item' && removeIds.length <= MAX_REMOVES_WITHOUT_CONFIRM),
  );

  const state = useStore.getState();
  if (needsUndo || immediate.length > 0) {
    undoSnapshot = captureReviseUndoSnapshot({
      items: state.items,
      order: state.order,
      environment: state.environment,
      roomGeometry: state.roomGeometry,
    });
  }

  for (const action of immediate) {
    if (action.type === 'remove_item') {
      const resolved = resolveUniqueItemTarget(
        action.target,
        state.items,
        state.order,
        state.selectedId,
      );
      if (!resolved.ok) {
        warnings.push(
          resolved.reason === 'ambiguous'
            ? 'Could not remove — multiple pieces matched.'
            : 'Could not remove — no matching piece.',
        );
        continue;
      }
      removeIds.push(...resolved.ids);
      continue;
    }

    if (action.type === 'paint_wall') {
      if (action.wallId && action.wallId !== 'all') {
        useStore.getState().setWallPaint(action.color, action.wallId);
        appliedSummaries.push(`Painted wall ${action.wallId}`);
      } else {
        useStore.getState().setWallPaint(action.color);
        appliedSummaries.push('Updated wall paint');
      }
      continue;
    }

    if (action.type === 'set_appearance') {
      useStore.getState().setAppearance({
        ...(action.floorPreset ? { floorPreset: action.floorPreset } : {}),
        ...(action.trimPreset ? { trimPreset: action.trimPreset } : {}),
        ...(action.showBaseboards != null ? { showBaseboards: action.showBaseboards } : {}),
      });
      appliedSummaries.push('Updated room finishes');
      continue;
    }

    if (action.type === 'set_curtains') {
      patchAllWindowCurtains(action.color, action.openingId, useStore.getState().roomGeometry);
      appliedSummaries.push('Updated curtain color');
      continue;
    }

    if (action.type === 'apply_color_scheme') {
      const base = useStore.getState().environment.appearance;
      const merged = mergeAppearanceWithColorScheme(base, action.colors);
      useStore.getState().setAppearance(merged);
      const palette = furnishingsFromColorScheme(
        action.colors,
        furnishingsForAgenticVibe('neutral'),
      );
      applyPaletteToStoreItems(() => useStore.getState(), palette);
      appliedSummaries.push('Applied color palette');
      continue;
    }

    if (action.type === 'set_item_color') {
      const resolved = resolveUniqueItemTarget(
        action.target,
        useStore.getState().items,
        useStore.getState().order,
        useStore.getState().selectedId,
      );
      if (!resolved.ok) {
        warnings.push('Could not recolor — specify which piece.');
        continue;
      }
      const id = resolved.ids[0]!;
      const store = useStore.getState();
      if (action.field === 'tint') store.setTintColor(id, action.color);
      if (action.field === 'mattress') store.setMattressColor(id, action.color);
      if (action.field === 'top') store.setTopColor(id, action.color);
      if (action.field === 'drawer') store.setDrawerColor(id, action.color);
      if (action.field === 'blanket') store.setBlanketColor(id, action.color);
      appliedSummaries.push('Updated piece color');
      continue;
    }

    if (action.type === 'set_bedding') {
      const resolved = resolveUniqueItemTarget(
        action.target,
        useStore.getState().items,
        useStore.getState().order,
        useStore.getState().selectedId,
      );
      if (!resolved.ok) {
        warnings.push('Could not update bedding — specify which bed.');
        continue;
      }
      const id = resolved.ids[0]!;
      const it = useStore.getState().items[id];
      if (!it || it.kind !== 'bed') {
        warnings.push('Bedding changes apply to beds only.');
        continue;
      }
      const patch: BeddingConfigPatch = {};
      if (action.sheetColor) {
        patch.sheets = {
          enabled: true,
          colorId: nearestSheetColorId(action.sheetColor),
        };
      }
      if (action.comforterColor) {
        patch.comforter = {
          enabled: true,
          colorId: nearestComforterColorId(action.comforterColor),
        };
      }
      useStore.getState().setBeddingConfig(id, patch);
      appliedSummaries.push('Updated bedding');
      continue;
    }

    if (action.type === 'duplicate_item') {
      const resolved = resolveUniqueItemTarget(
        action.target,
        useStore.getState().items,
        useStore.getState().order,
        useStore.getState().selectedId,
      );
      if (!resolved.ok) {
        warnings.push('Could not duplicate — specify which piece.');
        continue;
      }
      useStore.getState().duplicateItem(resolved.ids[0]!);
      appliedSummaries.push('Duplicated piece');
      continue;
    }

    if (action.type === 'move_item') {
      const resolved = resolveUniqueItemTarget(
        action.target,
        useStore.getState().items,
        useStore.getState().order,
        useStore.getState().selectedId,
      );
      if (!resolved.ok) {
        warnings.push('Could not move — specify which piece.');
        continue;
      }
      const id = resolved.ids[0]!;
      const s = useStore.getState();
      const item = s.items[id];
      if (!item || item.kind === 'hanging') continue;
      const pos = targetPositionForPlacement(
        action.placement,
        s.roomGeometry,
        s.items,
        s.order,
        s.selectedId,
        item.size,
      );
      const others = Object.values(s.items).filter((o) => o.id !== id);
      const candidate: Item = { ...item, position: pos };
      const { position, ok } = resolveValidXZ(candidate, others);
      s.updatePosition(id, position);
      if (!ok) warnings.push('Piece is tight against others — nudged as far as possible.');
      appliedSummaries.push('Moved piece');
      continue;
    }

    if (action.type === 'rotate_item') {
      const resolved = resolveUniqueItemTarget(
        action.target,
        useStore.getState().items,
        useStore.getState().order,
        useStore.getState().selectedId,
      );
      if (!resolved.ok) {
        warnings.push('Could not rotate — specify which piece.');
        continue;
      }
      useStore.getState().updateRotation(resolved.ids[0]!, action.rotationY);
      appliedSummaries.push('Rotated piece');
    }
  }

  let pendingRemoves: PendingRemoveBatch | null = null;
  if (removeIds.length > 0) {
    if (removeIds.length > MAX_REMOVES_WITHOUT_CONFIRM) {
      pendingRemoves = {
        ids: [...new Set(removeIds)],
        description: `Remove ${removeIds.length} pieces?`,
      };
    } else {
      for (const id of removeIds) {
        useStore.getState().removeItem(id);
      }
      appliedSummaries.push(`Removed ${removeIds.length} piece(s)`);
    }
  }

  for (const action of addActions.slice(0, MAX_ADDS_PER_TURN)) {
    if (action.type !== 'add_item') continue;
    const proposal = resolvePendingAddProposal(
      action.query,
      products,
      action.placement ?? 'center',
    );
    if (!proposal) {
      warnings.push(`Could not find a catalog match for “${action.query}”.`);
      continue;
    }
    if (!proposal.candidate.product && !proposal.candidate.builtinKind) {
      warnings.push(`No placeable match for “${action.query}”.`);
      continue;
    }
    pendingAdds.push(proposal);
  }

  if (
    appliedSummaries.length === 0 &&
    pendingAdds.length === 0 &&
    !pendingRemoves &&
    warnings.length === 0
  ) {
    undoSnapshot = null;
  }

  return {
    appliedSummaries,
    pendingAdds,
    pendingRemoves,
    undoSnapshot,
    warnings,
  };
}

export function confirmPendingRemove(batch: PendingRemoveBatch): ReviseUndoSnapshot {
  const snapshot = captureReviseUndoSnapshot(useStore.getState());
  for (const id of batch.ids) {
    useStore.getState().removeItem(id);
  }
  return snapshot;
}

export async function confirmPendingAdd(
  proposal: PendingAddProposal,
): Promise<{ itemId: string | null; undoSnapshot: ReviseUndoSnapshot }> {
  const undoSnapshot = captureReviseUndoSnapshot(useStore.getState());
  const product = activeProductForProposal(proposal);
  const s = useStore.getState();
  let itemId: string | null = null;

  if (product) {
    itemId = await placeCuratedProduct(product);
  }
  if (!itemId && proposal.candidate.builtinKind) {
    const kind = proposal.candidate.builtinKind as GalleryFurnitureKind;
    itemId = s.addItem(kind, {
      label: FURNITURE[kind].label,
      curatedProductId: product?.id,
    });
  }

  if (itemId) {
    const item = useStore.getState().items[itemId];
    if (item && item.kind !== 'hanging') {
      const pos = targetPositionForPlacement(
        proposal.placement,
        useStore.getState().roomGeometry,
        useStore.getState().items,
        useStore.getState().order,
        useStore.getState().selectedId,
        item.size,
      );
      const others = Object.values(useStore.getState().items).filter((o) => o.id !== itemId);
      const { position } = resolveValidXZ({ ...item, position: pos }, others);
      useStore.getState().updatePosition(itemId, position);
    }
  }

  return { itemId, undoSnapshot };
}

export function restoreReviseUndo(snapshot: ReviseUndoSnapshot) {
  const list = snapshot.order
    .map((id) => snapshot.items[id])
    .filter((it): it is Item => !!it);
  useStore.getState().hydrateLayout(list, snapshot.order);
  useStore.getState().hydrateRoomSettings(snapshot.environment, snapshot.roomGeometry);
}

/** @internal test helper */
export function applyReviseActionsDryRunRemoves(actions: ReviseAction[]): string[] {
  const ids: string[] = [];
  const state = useStore.getState();
  for (const action of actions) {
    if (action.type !== 'remove_item') continue;
    const resolved = resolveUniqueItemTarget(
      action.target,
      state.items,
      state.order,
      state.selectedId,
    );
    if (resolved.ok) ids.push(...resolved.ids);
  }
  return ids;
}
