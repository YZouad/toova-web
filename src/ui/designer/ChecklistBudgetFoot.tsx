import { useState } from 'react';
import type { ChecklistBudgetSummary } from '../../lib/dormChecklist';

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
  onHave: () => void;
  onSkip: () => void;
  onUndo: () => void;
  className?: string;
}

export function ChecklistResolutionActions({
  status,
  onHave,
  onSkip,
  onUndo,
  className = '',
}: ChecklistResolutionActionsProps) {
  if (status === 'placed') return null;

  if (status === 'have') {
    return (
      <div className={`checklist-resolution ${className}`.trim()}>
        <span className="checklist-resolution__label">Marked as already owned</span>
        <button type="button" className="checklist-resolution__undo" onClick={onUndo}>
          Undo
        </button>
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

  return (
    <div className={`checklist-resolution ${className}`.trim()}>
      <button type="button" className="checklist-resolution__btn" onClick={onHave}>
        I already have
      </button>
      <button type="button" className="checklist-resolution__btn" onClick={onSkip}>
        Don&apos;t need
      </button>
    </div>
  );
}
