import { useEffect, useState } from 'react';
import type { ChecklistBudgetSummary, CuratedProduct } from '../../lib/dormChecklist';
import { formatPriceCents } from '../../lib/dormChecklist';
import { parseOwnedPurchaseDetails } from '../../lib/ownedChecklistItems';

export interface ChecklistBudgetFootProps {
  budget: ChecklistBudgetSummary;
  onSetBudget: (cents: number | null) => void;
  className?: string;
  totalClassName?: string;
  eyebrowClassName?: string;
  valueClassName?: string;
  subClassName?: string;
  ctaClassName?: string;
}

function parseBudgetInput(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, '').trim();
  if (!cleaned) return null;
  const dollars = Number(cleaned);
  if (!Number.isFinite(dollars) || dollars < 0) return null;
  return Math.round(dollars * 100);
}

export function ChecklistBudgetFoot({
  budget,
  onSetBudget,
  className = '',
  totalClassName = '',
  eyebrowClassName = '',
  valueClassName = '',
  subClassName = '',
  ctaClassName = '',
}: ChecklistBudgetFootProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const openEditor = () => {
    setDraft(
      budget.budgetCents != null ? String((budget.budgetCents / 100).toFixed(0)) : '',
    );
    setEditing(true);
  };

  const commit = () => {
    onSetBudget(parseBudgetInput(draft));
    setEditing(false);
  };

  if (editing) {
    return (
      <div className={`checklist-budget-foot checklist-budget-foot--edit ${className}`.trim()}>
        <label className={eyebrowClassName || 'checklist-budget-foot__eyebrow'}>
          Move-in budget
        </label>
        <div className="checklist-budget-foot__edit-row">
          <span className="checklist-budget-foot__prefix">$</span>
          <input
            type="number"
            min={0}
            step={1}
            className="checklist-budget-foot__input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') setEditing(false);
            }}
            autoFocus
            inputMode="numeric"
            aria-label="Move-in budget in dollars"
          />
          <button type="button" className="checklist-budget-foot__save" onClick={commit}>
            Save
          </button>
        </div>
      </div>
    );
  }

  if (budget.budgetCents == null) {
    return (
      <div className={`checklist-budget-foot ${className}`.trim()}>
        <button
          type="button"
          className={ctaClassName || 'checklist-budget-foot__set'}
          onClick={openEditor}
        >
          Set a budget
        </button>
        {budget.spentCents > 0 ? (
          <span className={subClassName || 'checklist-budget-foot__sub'}>
            Spent {budget.spentLabel} so far
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`checklist-budget-foot ${totalClassName}`.trim()}>
      <span className={eyebrowClassName || 'checklist-budget-foot__eyebrow'}>
        Budget remaining
      </span>
      <button
        type="button"
        className={valueClassName || 'checklist-budget-foot__value'}
        onClick={openEditor}
        aria-label="Edit move-in budget"
      >
        {budget.remainingLabel}
      </button>
      {budget.spentOfCapLabel ? (
        <span className={subClassName || 'checklist-budget-foot__sub'}>{budget.spentOfCapLabel}</span>
      ) : null}
    </div>
  );
}

export interface ChecklistResolutionActionsProps {
  status: import('../../lib/dormChecklist').ChecklistLineStatus;
  categoryName: string;
  ownedProduct?: CuratedProduct | null;
  onMarkOwned: (input: {
    name: string;
    affiliateUrl: string;
    priceCents: number;
  }) => void | Promise<void>;
  onSkip: () => void;
  onUndo: () => void;
  className?: string;
}

export function ChecklistResolutionActions({
  status,
  categoryName,
  ownedProduct,
  onMarkOwned,
  onSkip,
  onUndo,
  className = '',
}: ChecklistResolutionActionsProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(categoryName);
  const [link, setLink] = useState('');
  const [price, setPrice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) {
      setName(categoryName);
      setLink(ownedProduct?.affiliateUrl ?? '');
      setPrice(
        ownedProduct?.priceCents != null
          ? String((ownedProduct.priceCents / 100).toFixed(2)).replace(/\.00$/, '')
          : '',
      );
      setError(null);
    }
  }, [categoryName, ownedProduct, editing]);

  if (status === 'placed') return null;

  const openEditor = () => {
    setName(categoryName);
    setLink(ownedProduct?.affiliateUrl ?? '');
    setPrice(
      ownedProduct?.priceCents != null
        ? String((ownedProduct.priceCents / 100).toFixed(2)).replace(/\.00$/, '')
        : '',
    );
    setError(null);
    setEditing(true);
  };

  const cancelEditor = () => {
    setEditing(false);
    setError(null);
  };

  const submitOwned = async () => {
    const parsed = parseOwnedPurchaseDetails(name, link, price);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onMarkOwned({
        name: parsed.name,
        affiliateUrl: parsed.affiliateUrl,
        priceCents: parsed.priceCents,
      });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  if (status === 'have' && ownedProduct && !editing) {
    const priceLabel = formatPriceCents(ownedProduct.priceCents, ownedProduct.currency);
    return (
      <div className={`checklist-resolution ${className}`.trim()}>
        <span className="checklist-resolution__label">
          {ownedProduct.name}
          {priceLabel ? ` · ${priceLabel}` : ''}
        </span>
        <div className="checklist-resolution__actions">
          <button type="button" className="checklist-resolution__btn" onClick={openEditor}>
            Edit
          </button>
          <button type="button" className="checklist-resolution__undo" onClick={onUndo}>
            Undo
          </button>
        </div>
      </div>
    );
  }

  if (status === 'have' && !ownedProduct && !editing) {
    return (
      <div className={`checklist-resolution ${className}`.trim()}>
        <span className="checklist-resolution__label">
          Marked as already owned — add a price for your budget
        </span>
        <div className="checklist-resolution__actions">
          <button type="button" className="checklist-resolution__btn" onClick={openEditor}>
            Add details
          </button>
          <button type="button" className="checklist-resolution__undo" onClick={onUndo}>
            Undo
          </button>
        </div>
      </div>
    );
  }

  if (status === 'skip') {
    return (
      <div className={`checklist-resolution ${className}`.trim()}>
        <span className="checklist-resolution__label">Marked as not needed</span>
        <button type="button" className="checklist-resolution__undo" onClick={onUndo}>
          Undo
        </button>
      </div>
    );
  }

  if (editing || status === 'open') {
    if (editing) {
      return (
        <div className={`checklist-resolution checklist-resolution--form ${className}`.trim()}>
          <span className="checklist-resolution__label">What do you already have?</span>
          <label className="checklist-resolution__field">
            <span className="checklist-resolution__field-label">Name</span>
            <input
              className="checklist-resolution__input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
            />
          </label>
          <label className="checklist-resolution__field">
            <span className="checklist-resolution__field-label">Price (USD)</span>
            <input
              className="checklist-resolution__input"
              type="text"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              disabled={saving}
              placeholder="29.99"
            />
          </label>
          <label className="checklist-resolution__field">
            <span className="checklist-resolution__field-label">
              Link <span className="checklist-resolution__optional">optional</span>
            </span>
            <input
              className="checklist-resolution__input"
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              disabled={saving}
              placeholder="https://www.amazon.com/…"
            />
          </label>
          {error ? (
            <p className="checklist-resolution__error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="checklist-resolution__actions">
            <button
              type="button"
              className="checklist-resolution__btn checklist-resolution__btn--primary"
              onClick={() => void submitOwned()}
              disabled={saving}
            >
              Save
            </button>
            <button
              type="button"
              className="checklist-resolution__btn"
              onClick={cancelEditor}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className={`checklist-resolution ${className}`.trim()}>
        <button type="button" className="checklist-resolution__btn" onClick={openEditor}>
          I already have
        </button>
        <button type="button" className="checklist-resolution__btn" onClick={onSkip}>
          Don&apos;t need
        </button>
      </div>
    );
  }

  return null;
}
