import type {
  AgenticManifestResolution,
  AgenticShoppingManifestEntry,
} from '../lib/agenticShoppingManifest';
import { manifestResolutionLabel } from '../lib/agenticShoppingManifest';
import { ManifestSearchLinks } from './ManifestSearchLinks';
import { MonoMeta } from './kit/MonoMeta';

interface ManifestPlanRowsProps {
  entries: AgenticShoppingManifestEntry[];
  source: 'designer_checklist_ticker' | 'checklist_checkout';
  onDismiss?: (entryId: string) => void;
  onSetResolution?: (entryId: string, resolution: AgenticManifestResolution | null) => void;
}

function ManifestResolutionActions({
  entry,
  onSetResolution,
}: {
  entry: AgenticShoppingManifestEntry;
  onSetResolution?: (entryId: string, resolution: AgenticManifestResolution | null) => void;
}) {
  if (!onSetResolution) return null;

  if (entry.resolution === 'skip') {
    return (
      <div className="manifest-plan-list__resolution">
        <span className="manifest-plan-list__resolution-label">Marked as not needed</span>
        <button
          type="button"
          className="manifest-plan-list__resolution-undo"
          onClick={() => onSetResolution(entry.id, null)}
        >
          Undo
        </button>
      </div>
    );
  }

  if (entry.resolution === 'have') {
    return (
      <div className="manifest-plan-list__resolution">
        <span className="manifest-plan-list__resolution-label">Already purchased</span>
        <button
          type="button"
          className="manifest-plan-list__resolution-undo"
          onClick={() => onSetResolution(entry.id, null)}
        >
          Undo
        </button>
      </div>
    );
  }

  return (
    <div className="manifest-plan-list__resolution">
      <button
        type="button"
        className="manifest-plan-list__resolution-btn"
        onClick={() => onSetResolution(entry.id, 'have')}
      >
        Already have
      </button>
      <button
        type="button"
        className="manifest-plan-list__resolution-btn"
        onClick={() => onSetResolution(entry.id, 'skip')}
      >
        Don&apos;t need
      </button>
    </div>
  );
}

export function ManifestPlanRows({
  entries,
  source,
  onDismiss,
  onSetResolution,
}: ManifestPlanRowsProps) {
  if (entries.length === 0) return null;

  return (
    <ul className="manifest-plan-list">
      {entries.map((entry) => {
        const statusChip = manifestResolutionLabel(entry.resolution);
        const resolved = entry.resolution === 'have' || entry.resolution === 'skip';

        return (
          <li
            key={entry.id}
            className={`manifest-plan-list__item${resolved ? ' is-resolved' : ''}`}
          >
            <div className="manifest-plan-list__head">
              <div className="manifest-plan-list__copy">
                {statusChip ? (
                  <span className="manifest-plan-list__status">{statusChip}</span>
                ) : null}
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
              {!resolved ? (
                <div className="manifest-plan-list__shop">
                  <ManifestSearchLinks query={entry.query} source={source} />
                </div>
              ) : null}
            </div>
            <ManifestResolutionActions entry={entry} onSetResolution={onSetResolution} />
            {onDismiss && !resolved ? (
              <button
                type="button"
                className="manifest-plan-list__dismiss"
                onClick={() => onDismiss(entry.id)}
              >
                Remove from list
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
