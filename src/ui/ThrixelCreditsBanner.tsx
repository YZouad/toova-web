import { MonoMeta } from './kit';

export interface ThrixelCreditsBannerProps {
  balanceLabel?: string | null;
  costLine?: string | null;
  plan?: string | null;
  loading?: boolean;
  error?: string | null;
  compact?: boolean;
}

export function ThrixelCreditsBanner({
  balanceLabel,
  costLine,
  plan,
  loading,
  error,
  compact = false,
}: ThrixelCreditsBannerProps) {
  if (loading) {
    return (
      <MonoMeta size="sm" tone="subtle" style={{ display: 'block' }}>
        Loading Thrixel balance…
      </MonoMeta>
    );
  }
  if (error) {
    return (
      <MonoMeta size="sm" tone="dense" style={{ display: 'block', color: 'var(--danger, #c44)' }}>
        {error}
      </MonoMeta>
    );
  }
  if (!balanceLabel && !costLine) return null;

  return (
    <div
      style={{
        display: 'grid',
        gap: compact ? 4 : 6,
        padding: compact ? 0 : '10px 12px',
        borderRadius: 8,
        background: compact ? 'transparent' : 'rgba(255,255,255,0.04)',
        border: compact ? 'none' : '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {balanceLabel ? (
        <MonoMeta size="sm" tone="dense" style={{ display: 'block' }}>
          {balanceLabel}
          {plan ? ` · ${plan} plan` : ''}
        </MonoMeta>
      ) : null}
      {costLine ? (
        <MonoMeta size="xs" tone="subtle" style={{ display: 'block' }}>
          {costLine}
        </MonoMeta>
      ) : null}
    </div>
  );
}
