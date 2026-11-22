import type { GalleryModel } from '../hooks/useGalleryCatalog';

/** Catalog entry used while dragging from the library onto the floor. */
export type CatalogDropModel = GalleryModel;

export type CatalogDropScreenToFloor = (
  clientX: number,
  clientY: number,
) => { x: number; z: number } | null;

export interface CatalogDropSession {
  model: CatalogDropModel;
  sizeIn: [number, number, number];
  clientX: number;
  clientY: number;
  floor: { x: number; z: number } | null;
  valid: boolean;
}

type Listener = () => void;

let screenToFloor: CatalogDropScreenToFloor | null = null;
let session: CatalogDropSession | null = null;
const listeners = new Set<Listener>();

function notify() {
  for (const l of listeners) l();
}

export function registerCatalogScreenToFloor(fn: CatalogDropScreenToFloor | null) {
  screenToFloor = fn;
}

export function getCatalogScreenToFloor(): CatalogDropScreenToFloor | null {
  return screenToFloor;
}

export function getCatalogDropSession(): CatalogDropSession | null {
  return session;
}

export function subscribeCatalogDrop(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function beginCatalogDrop(
  model: CatalogDropModel,
  clientX: number,
  clientY: number,
): CatalogDropSession {
  const sizeIn: [number, number, number] = [
    model.width_in,
    model.height_in,
    model.depth_in,
  ];
  const floor = screenToFloor?.(clientX, clientY) ?? null;
  session = {
    model,
    sizeIn,
    clientX,
    clientY,
    floor,
    valid: !!floor,
  };
  notify();
  return session;
}

export function updateCatalogDrop(clientX: number, clientY: number): CatalogDropSession | null {
  if (!session) return null;
  const floor = screenToFloor?.(clientX, clientY) ?? null;
  session = {
    ...session,
    clientX,
    clientY,
    floor,
    valid: !!floor,
  };
  notify();
  return session;
}

export function endCatalogDrop(): CatalogDropSession | null {
  const ended = session;
  session = null;
  notify();
  return ended;
}

export function cancelCatalogDrop(): void {
  if (!session) return;
  session = null;
  notify();
}

export function isCatalogDropActive(): boolean {
  return session != null;
}
