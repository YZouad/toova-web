import { useCallback, useMemo, useState } from 'react';
import {
  DORM_CHECKLIST,
  loadCheckedIds,
  saveCheckedIds,
} from '../lib/dormChecklist';
import { useStore } from '../store';

interface LineItem {
  key: string;
  label: string;
  count: number;
}

interface SceneCheckoutPanelProps {
  onOpenChecklist: () => void;
}

export function SceneCheckoutPanel({ onOpenChecklist }: SceneCheckoutPanelProps) {
  const items = useStore((s) => s.items);
  const order = useStore((s) => s.order);
  const [expanded, setExpanded] = useState(true);
  const [checked, setChecked] = useState<Set<string>>(() => loadCheckedIds());

  const lines = useMemo((): LineItem[] => {
    const counts = new Map<string, LineItem>();
    for (const id of order) {
      const item = items[id];
      if (!item) continue;
      const label = item.label?.trim() || item.kind;
      const key = label.toLowerCase();
      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(key, { key, label, count: 1 });
      }
    }
    return Array.from(counts.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [items, order]);

  const total = order.length;
  const checklistDone = DORM_CHECKLIST.filter((item) => checked.has(item.id)).length;

  const toggle = useCallback((id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveCheckedIds(next);
      return next;
    });
  }, []);

  return (
    <div className="scene-checkout">
      <button
        type="button"
        className="scene-checkout-toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="scene-checkout-title">To buy</span>
        <span className="scene-checkout-badge">{total}</span>
        <span className="scene-checkout-chevron" aria-hidden>
          {expanded ? '▾' : '▸'}
        </span>
      </button>

      {expanded ? (
        <div className="scene-checkout-body">
          {lines.length === 0 ? (
            <p className="scene-checkout-empty">Add furniture to build your list.</p>
          ) : (
            <ul className="scene-checkout-list">
              {lines.map((line) => (
                <li key={line.key} className="scene-checkout-row">
                  <span className="scene-checkout-label">{line.label}</span>
                  <span className="scene-checkout-qty">×{line.count}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="scene-checkout-mini">
            <div className="scene-checkout-mini-head">
              <span className="scene-checkout-mini-title">Checklist</span>
              <span className="scene-checkout-mini-count">
                {checklistDone}/{DORM_CHECKLIST.length}
              </span>
            </div>
            <ul className="scene-checkout-mini-list">
              {DORM_CHECKLIST.map((item) => {
                const isChecked = checked.has(item.id);
                return (
                  <li key={item.id}>
                    <label
                      className={`scene-checkout-mini-item${isChecked ? ' scene-checkout-mini-item--done' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggle(item.id)}
                      />
                      <span className="scene-checkout-mini-box" aria-hidden />
                      <span className="scene-checkout-mini-name">{item.name}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              className="scene-checkout-mini-link"
              onClick={onOpenChecklist}
            >
              Open full checklist →
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
