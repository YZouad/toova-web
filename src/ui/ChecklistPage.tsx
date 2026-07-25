import { useCallback, useMemo, useState } from 'react';
import {
  DORM_CHECKLIST,
  loadCheckedIds,
  saveCheckedIds,
} from '../lib/dormChecklist';

interface ChecklistPageProps {
  onBack: () => void;
  onDesign?: () => void;
}

export function ChecklistPage({ onBack, onDesign }: ChecklistPageProps) {
  const [checked, setChecked] = useState<Set<string>>(() => loadCheckedIds());

  const toggle = useCallback((id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveCheckedIds(next);
      return next;
    });
  }, []);

  const { done, total } = useMemo(
    () => ({
      done: DORM_CHECKLIST.filter((item) => checked.has(item.id)).length,
      total: DORM_CHECKLIST.length,
    }),
    [checked],
  );

  return (
    <div className="checklist-page">
      <header className="checklist-page-topbar">
        <button type="button" className="checklist-page-back" onClick={onBack}>
          ← Back
        </button>
        <div className="checklist-page-brand">
          <div className="tv-logo-mark" style={{ width: 25, height: 25, borderRadius: 7, fontSize: 17 }}>
            t
          </div>
          <span className="tv-logo-text" style={{ fontSize: 22 }}>
            Toova
          </span>
        </div>
        {onDesign ? (
          <button type="button" className="tv-btn-primary checklist-page-design" onClick={onDesign}>
            Design your room
          </button>
        ) : (
          <span className="checklist-page-topbar-spacer" />
        )}
      </header>

      <main className="checklist-page-main">
        <div className="checklist-page-intro">
          <p className="checklist-page-eyebrow">Dorm essentials</p>
          <h1 className="checklist-page-title">The Toova checklist</h1>
          <p className="checklist-page-copy">
            Check items off as you grab them. Shop our picks, then place everything in your room before you buy.
          </p>
          <div className="checklist-page-progress" aria-live="polite">
            <span className="checklist-page-progress-label">
              {done} of {total} packed
            </span>
            <div className="checklist-page-progress-track" aria-hidden>
              <div
                className="checklist-page-progress-fill"
                style={{ width: `${total ? (done / total) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>

        <ul className="checklist-page-list">
          {DORM_CHECKLIST.map((item) => {
            const isChecked = checked.has(item.id);
            return (
              <li
                key={item.id}
                className={`checklist-page-row${isChecked ? ' checklist-page-row--done' : ''}`}
              >
                <label className="checklist-page-check">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggle(item.id)}
                  />
                  <span className="checklist-page-box" aria-hidden />
                  <span className="checklist-page-name">{item.name}</span>
                </label>
                <span className="checklist-page-links">
                  {item.links.length === 0 ? (
                    <span className="checklist-page-soon">Coming soon</span>
                  ) : (
                    item.links.map((link) => (
                      <a
                        key={link.url}
                        className="checklist-page-shop"
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {item.links.length > 1 ? link.label : 'Shop'}
                      </a>
                    ))
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}
