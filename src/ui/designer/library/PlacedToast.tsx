import { useEffect, useRef, useState } from 'react';
import type { CatalogModel } from '../chromeTypes';
import { LazyThumb } from './LazyThumb';

export interface PlacedToastState {
  itemId: string;
  model: CatalogModel;
  pairs: CatalogModel[];
}

export function PlacedToast({
  state,
  onUndo,
  onPlacePair,
  onDismiss,
}: {
  state: PlacedToastState;
  onUndo: () => void;
  onPlacePair: (model: CatalogModel) => void;
  onDismiss: () => void;
}) {
  const [paused, setPaused] = useState(false);
  const dismissAt = useRef(Date.now() + 6_000);

  useEffect(() => {
    dismissAt.current = Date.now() + 6_000;
  }, [state.itemId]);

  useEffect(() => {
    if (paused) return;
    const tick = () => {
      if (Date.now() >= dismissAt.current) onDismiss();
    };
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [paused, onDismiss, state.itemId]);

  return (
    <div
      className="dgl-placed-toast dgl-placed-toast--float"
      role="status"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => {
        setPaused(false);
        dismissAt.current = Date.now() + 6_000;
      }}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setPaused(false);
          dismissAt.current = Date.now() + 6_000;
        }
      }}
    >
      <div className="dgl-placed-toast__main">
        <span className="dgl-placed-toast__label">Placed {state.model.label}</span>
        <button type="button" className="dgl-btn" onClick={onUndo}>
          Undo
        </button>
        <button type="button" className="dgl-btn dgl-btn--ghost" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      </div>
      {state.pairs.length > 0 ? (
        <div className="dgl-placed-toast__pairs">
          <span className="dgl-eyebrow">Pairs well with</span>
          <div className="dgl-placed-toast__rail">
            {state.pairs.map((m) => (
              <button
                key={m.kind}
                type="button"
                className="dgl-pair-chip"
                onClick={() => onPlacePair(m)}
                aria-label={`Place ${m.label}`}
              >
                <LazyThumb
                  kind={m.kind}
                  label={m.label}
                  previewUrl={m.previewUrl}
                  isBuiltin={m.isBuiltin}
                  size={36}
                />
                <span>{m.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
