import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GalleryModel } from '../../hooks/useGalleryCatalog';
import { getBuiltinPreviewUrl, useBuiltinPreviews } from '../../hooks/useBuiltinPreviews';
import { useShoppingCatalogContext } from '../../context/ShoppingCatalogContext';
import { flattenCatalogProducts } from '../../lib/agenticRoomResolve';
import {
  applyReviseActions,
  buildReviseRoomSnapshot,
  confirmPendingAdd,
  confirmPendingRemove,
  fetchDesignerRevise,
  galleryModelForPendingProposal,
  restoreReviseUndo,
  type PendingAddProposal,
  type PendingRemoveBatch,
  type ReviseUndoSnapshot,
} from '../../lib/designerRevise';
import { useStore } from '../../store';
import { PanelShell } from './PanelShell';

export interface RevisePanelProps {
  compact?: boolean;
  roomId: string;
  onClose: () => void;
  onPreviewModel: (model: GalleryModel) => void;
}

type TranscriptEntry =
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'assistant'; text: string }
  | {
      id: string;
      kind: 'applied';
      summaries: string[];
      warnings: string[];
      undoSnapshot: ReviseUndoSnapshot | null;
    }
  | { id: string; kind: 'pending_add'; proposal: PendingAddProposal }
  | { id: string; kind: 'pending_remove'; batch: PendingRemoveBatch; undoSnapshot: ReviseUndoSnapshot | null };

function storageKey(roomId: string) {
  return `toova-designer-revise-${roomId}`;
}

function loadTranscript(roomId: string): TranscriptEntry[] {
  try {
    const raw = sessionStorage.getItem(storageKey(roomId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TranscriptEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTranscript(roomId: string, entries: TranscriptEntry[]) {
  try {
    sessionStorage.setItem(storageKey(roomId), JSON.stringify(entries.slice(-40)));
  } catch {
    /* ignore */
  }
}

function PendingAddCard({
  proposal,
  onPreview,
  onConfirm,
  onSkip,
  onSelectProduct,
}: {
  proposal: PendingAddProposal;
  onPreview: () => void;
  onConfirm: () => void;
  onSkip: () => void;
  onSelectProduct: (productId: string) => void;
}) {
  const { candidate, selectedProductId } = proposal;
  const thumb = candidate.previewUrl;
  const alts = [candidate.product, ...candidate.alternates].filter(
    (p): p is NonNullable<typeof p> =>
      !!p && (Boolean(p.placeBuiltinKind) || Boolean(p.placeCatalogKind)),
  );

  return (
    <div className="dg-revise-add-card">
      <div className="dg-revise-add-card__main">
        {thumb ? (
          <img className="dg-revise-add-card__thumb" src={thumb} alt="" />
        ) : (
          <div className="dg-revise-add-card__thumb dg-revise-add-card__thumb--empty" aria-hidden />
        )}
        <div>
          <p className="dg-revise-add-card__title">{candidate.label}</p>
          <p className="dg-revise-add-card__meta">From catalog — confirm to place in the room</p>
        </div>
      </div>
      {alts.length > 1 ? (
        <div className="dg-revise-add-card__alts">
          {alts.map((p) =>
            p ? (
              <button
                key={p.id}
                type="button"
                className={`dg-revise-add-card__alt${selectedProductId === p.id ? ' is-active' : ''}`}
                onClick={() => onSelectProduct(p.id)}
              >
                {p.name}
              </button>
            ) : null,
          )}
        </div>
      ) : null}
      <div className="dg-revise-add-card__actions">
        <button type="button" className="dg-revise-add-card__btn" onClick={onPreview}>
          Preview
        </button>
        <button type="button" className="dg-revise-add-card__btn is-primary" onClick={onConfirm}>
          Confirm
        </button>
        <button type="button" className="dg-revise-add-card__btn is-ghost" onClick={onSkip}>
          Skip
        </button>
      </div>
    </div>
  );
}

export function RevisePanel({ compact, roomId, onClose, onPreviewModel }: RevisePanelProps) {
  const catalog = useShoppingCatalogContext();
  const builtinPreviews = useBuiltinPreviews();
  const products = useMemo(
    () => flattenCatalogProducts(catalog.categories),
    [catalog.categories],
  );

  const [entries, setEntries] = useState<TranscriptEntry[]>(() => loadTranscript(roomId));
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    saveTranscript(roomId, entries);
  }, [entries, roomId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [entries, busy]);

  const buildSnapshot = useCallback(() => {
    const s = useStore.getState();
    return buildReviseRoomSnapshot({
      items: s.items,
      order: s.order,
      environment: s.environment,
      roomGeometry: s.roomGeometry,
      selectedId: s.selectedId,
      selectedWallId: s.selectedWallId,
    });
  }, []);

  const pushEntry = useCallback((entry: TranscriptEntry) => {
    setEntries((prev) => [...prev, entry]);
  }, []);

  const updateProposal = useCallback((proposalId: string, patch: Partial<PendingAddProposal>) => {
    setEntries((prev) =>
      prev.map((e) =>
        e.kind === 'pending_add' && e.proposal.proposalId === proposalId
          ? { ...e, proposal: { ...e.proposal, ...patch } }
          : e,
      ),
    );
  }, []);

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const sendMessage = useCallback(async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    setError(null);
    pushEntry({ id: `u-${crypto.randomUUID().slice(0, 8)}`, kind: 'user', text });
    setBusy(true);

    const history = entries
      .filter((e) => e.kind === 'user' || e.kind === 'assistant')
      .map((e) => ({
        role: e.kind === 'user' ? ('user' as const) : ('assistant' as const),
        content: e.text,
      }));

    const result = await fetchDesignerRevise({
      message: text,
      snapshot: buildSnapshot(),
      history,
    });

    setBusy(false);

    if (!result.ok) {
      setError(result.error ?? 'Could not reach the revise assistant.');
      return;
    }

    pushEntry({
      id: `a-${crypto.randomUUID().slice(0, 8)}`,
      kind: 'assistant',
      text: result.reply,
    });

    const applied = applyReviseActions(result.actions, products);

    if (applied.appliedSummaries.length || applied.warnings.length) {
      pushEntry({
        id: `ap-${crypto.randomUUID().slice(0, 8)}`,
        kind: 'applied',
        summaries: applied.appliedSummaries,
        warnings: applied.warnings,
        undoSnapshot: applied.undoSnapshot,
      });
    }

    for (const proposal of applied.pendingAdds) {
      pushEntry({
        id: proposal.proposalId,
        kind: 'pending_add',
        proposal,
      });
    }

    if (applied.pendingRemoves) {
      pushEntry({
        id: `rm-${crypto.randomUUID().slice(0, 8)}`,
        kind: 'pending_remove',
        batch: applied.pendingRemoves,
        undoSnapshot: applied.undoSnapshot,
      });
    }
  }, [draft, busy, pushEntry, entries, buildSnapshot, products]);

  const handleConfirmAdd = useCallback(
    async (entryId: string, proposal: PendingAddProposal) => {
      const product = proposal.selectedProductId
        ? products.find((p) => p.id === proposal.selectedProductId) ?? null
        : proposal.candidate.product;
      const { undoSnapshot } = await confirmPendingAdd(proposal);
      removeEntry(entryId);
      pushEntry({
        id: `ap-add-${crypto.randomUUID().slice(0, 8)}`,
        kind: 'applied',
        summaries: [`Placed ${product?.name ?? proposal.candidate.label}`],
        warnings: [],
        undoSnapshot,
      });
    },
    [products, pushEntry, removeEntry],
  );

  return (
    <PanelShell
      compact={compact}
      mobileHeight="tall"
      title="Revise"
      eyebrow="Chat"
      onClose={onClose}
      allowViewportPassthrough={compact}
      bodyClassName="dg-revise-panel"
      footer={
        <form
          className="dg-revise-compose"
          onSubmit={(e) => {
            e.preventDefault();
            void sendMessage();
          }}
        >
          <input
            className="dg-revise-compose__input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Make the walls sage, navy bedding…"
            disabled={busy}
            aria-label="Describe a change"
          />
          <button type="submit" className="dg-revise-compose__send" disabled={busy || !draft.trim()}>
            Send
          </button>
        </form>
      }
    >
      <div className="dg-revise-transcript" ref={scrollRef}>
        {entries.length === 0 && !busy ? (
          <p className="dg-revise-empty">
            Describe look or layout changes. Catalog pieces stay pending until you preview and confirm.
          </p>
        ) : null}
        {entries.map((entry) => {
          if (entry.kind === 'user') {
            return (
              <div key={entry.id} className="dg-revise-msg dg-revise-msg--user">
                {entry.text}
              </div>
            );
          }
          if (entry.kind === 'assistant') {
            return (
              <div key={entry.id} className="dg-revise-msg dg-revise-msg--assistant">
                {entry.text}
              </div>
            );
          }
          if (entry.kind === 'applied') {
            return (
              <div key={entry.id} className="dg-revise-applied">
                {entry.summaries.map((s) => (
                  <p key={s}>{s}</p>
                ))}
                {entry.warnings.map((w) => (
                  <p key={w} className="dg-revise-warn">
                    {w}
                  </p>
                ))}
                {entry.undoSnapshot ? (
                  <button
                    type="button"
                    className="dg-revise-undo"
                    onClick={() => {
                      restoreReviseUndo(entry.undoSnapshot!);
                      removeEntry(entry.id);
                    }}
                  >
                    Undo
                  </button>
                ) : null}
              </div>
            );
          }
          if (entry.kind === 'pending_add') {
            const proposal = entry.proposal;
            return (
              <PendingAddCard
                key={entry.id}
                proposal={proposal}
                onPreview={() => {
                  const product =
                    products.find((p) => p.id === proposal.selectedProductId) ??
                    proposal.candidate.product;
                  const model = galleryModelForPendingProposal(
                    proposal,
                    product,
                    proposal.candidate.builtinKind
                      ? getBuiltinPreviewUrl(proposal.candidate.builtinKind, builtinPreviews) ?? null
                      : null,
                  );
                  if (model) onPreviewModel(model);
                }}
                onConfirm={() => void handleConfirmAdd(entry.id, proposal)}
                onSkip={() => removeEntry(entry.id)}
                onSelectProduct={(productId) =>
                  updateProposal(proposal.proposalId, { selectedProductId: productId })
                }
              />
            );
          }
          if (entry.kind === 'pending_remove') {
            return (
              <div key={entry.id} className="dg-revise-remove-confirm">
                <p>{entry.batch.description}</p>
                <div className="dg-revise-add-card__actions">
                  <button
                    type="button"
                    className="dg-revise-add-card__btn is-primary"
                    onClick={() => {
                      const snap = confirmPendingRemove(entry.batch);
                      removeEntry(entry.id);
                      pushEntry({
                        id: `ap-rm-${crypto.randomUUID().slice(0, 8)}`,
                        kind: 'applied',
                        summaries: [`Removed ${entry.batch.ids.length} piece(s)`],
                        warnings: [],
                        undoSnapshot: snap,
                      });
                    }}
                  >
                    Confirm remove
                  </button>
                  <button
                    type="button"
                    className="dg-revise-add-card__btn is-ghost"
                    onClick={() => removeEntry(entry.id)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            );
          }
          return null;
        })}
        {busy ? <p className="dg-revise-busy">Updating the room…</p> : null}
        {error ? <p className="dg-revise-warn">{error}</p> : null}
      </div>
    </PanelShell>
  );
}
