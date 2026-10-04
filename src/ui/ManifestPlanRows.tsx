import type { AgenticShoppingManifestEntry } from '../lib/agenticShoppingManifest';
import { ManifestSearchLinks } from './ManifestSearchLinks';
import { MonoMeta } from './kit/MonoMeta';

interface ManifestPlanRowsProps {
  entries: AgenticShoppingManifestEntry[];
  source: 'designer_checklist_ticker' | 'checklist_checkout';
  onDismiss?: (entryId: string) => void;
}

export function ManifestPlanRows({ entries, source, onDismiss }: ManifestPlanRowsProps) {
  if (entries.length === 0) return null;

  return (
    <ul className="manifest-plan-list">
      {entries.map((entry) => (
        <li key={entry.id} className="manifest-plan-list__item">
          <div className="manifest-plan-list__copy">
            <span className="manifest-plan-list__name">{entry.query}</span>
            {entry.bankPosterLabel ? (
              <MonoMeta size="xs" tone="dense" className="manifest-plan-list__meta">
                Poster: {entry.bankPosterLabel}
              </MonoMeta>
            ) : entry.qty > 1 ? (
              <MonoMeta size="xs" tone="dense" className="manifest-plan-list__meta">
                Qty {entry.qty}
              </MonoMeta>
            ) : (
              <MonoMeta size="xs" tone="dense" className="manifest-plan-list__meta">
                Search to buy
              </MonoMeta>
            )}
          </div>
          <div className="manifest-plan-list__actions">
            <ManifestSearchLinks query={entry.query} source={source} />
            {onDismiss ? (
              <button
                type="button"
                className="manifest-plan-list__dismiss"
                onClick={() => onDismiss(entry.id)}
              >
                Dismiss
              </button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
