import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { CatalogModel } from '../chromeTypes';
import {
  beginCatalogDrop,
  cancelCatalogDrop,
  endCatalogDrop,
  isCatalogDropActive,
  updateCatalogDrop,
} from '../../../interaction/catalogDropBridge';
import { clampPositionInRoom } from '../../../interaction/collision';
import { getActiveGeometry } from '../../../store';

const DRAG_THRESHOLD_PX = 6;

export interface CatalogDragHandlers {
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
  onPointerCancel: (e: ReactPointerEvent) => void;
  dragging: boolean;
}

export interface UseCatalogDragOpts {
  model: CatalogModel;
  onPlaceAt: (model: CatalogModel, spawnAt: [number, number]) => void | Promise<void>;
  /** Called when a press ends without becoming a drag (click). */
  onClickPlace?: (model: CatalogModel) => void | Promise<void>;
  disabled?: boolean;
}

export function useCatalogDrag({
  model,
  onPlaceAt,
  onClickPlace,
  disabled,
}: UseCatalogDragOpts): CatalogDragHandlers {
  const [dragging, setDragging] = useState(false);
  const pending = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const active = useRef(false);

  const finish = useCallback(
    async (clientX: number, clientY: number, didDrag: boolean) => {
      if (didDrag) {
        const ended = endCatalogDrop();
        setDragging(false);
        active.current = false;
        document.documentElement.classList.remove('dgl-catalog-dragging');
        if (!ended?.floor) return;
        const size: [number, number, number] = [
          ended.model.width_in,
          ended.model.height_in,
          ended.model.depth_in,
        ];
        const proposed: [number, number, number] = [ended.floor.x, 0, ended.floor.z];
        const clamped = clampPositionInRoom(proposed, 0, size, getActiveGeometry());
        await onPlaceAt(ended.model, [clamped[0], clamped[2]]);
        return;
      }
      if (isCatalogDropActive()) cancelCatalogDrop();
      setDragging(false);
      active.current = false;
      document.documentElement.classList.remove('dgl-catalog-dragging');
      await onClickPlace?.(model);
    },
    [model, onPlaceAt, onClickPlace],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (!active.current && !isCatalogDropActive()) return;
      cancelCatalogDrop();
      setDragging(false);
      active.current = false;
      pending.current = null;
      document.documentElement.classList.remove('dgl-catalog-dragging');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    return () => {
      if (active.current || isCatalogDropActive()) {
        cancelCatalogDrop();
        document.documentElement.classList.remove('dgl-catalog-dragging');
      }
    };
  }, []);

  return {
    dragging,
    onPointerDown: (e) => {
      if (disabled || e.button !== 0) return;
      // Buttons/links inside the drag surface (heart, price) must keep their click.
      const interactive = (e.target as Element | null)?.closest?.('button, a, input, textarea, select');
      if (interactive && interactive !== e.currentTarget) return;
      pending.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
      };
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    onPointerMove: (e) => {
      const p = pending.current;
      if (!p || p.pointerId !== e.pointerId) return;
      const dx = e.clientX - p.startX;
      const dy = e.clientY - p.startY;
      if (!active.current) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        active.current = true;
        setDragging(true);
        document.documentElement.classList.add('dgl-catalog-dragging');
        beginCatalogDrop(model, e.clientX, e.clientY);
        return;
      }
      updateCatalogDrop(e.clientX, e.clientY);
    },
    onPointerUp: (e) => {
      const p = pending.current;
      if (!p || p.pointerId !== e.pointerId) return;
      pending.current = null;
      const didDrag = active.current;
      void finish(e.clientX, e.clientY, didDrag);
    },
    onPointerCancel: () => {
      pending.current = null;
      if (active.current || isCatalogDropActive()) {
        cancelCatalogDrop();
        active.current = false;
        setDragging(false);
        document.documentElement.classList.remove('dgl-catalog-dragging');
      }
    },
  };
}
