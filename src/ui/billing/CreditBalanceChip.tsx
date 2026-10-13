import { useEntitlements } from '../../hooks/useEntitlements';
import { navigate, pricingPath } from '../../hooks/useRoute';
import { Button } from '../kit/Button';
import { MonoMeta } from '../kit/MonoMeta';

interface CreditBalanceChipProps {
  onNeedCredits?: () => void;
  compact?: boolean;
}

export function CreditBalanceChip({ onNeedCredits, compact }: CreditBalanceChipProps) {
  const { creditsTotal, billing, loading } = useEntitlements();
  const tier = billing?.tier ?? 'free';

  if (loading && !billing) {
    return <MonoMeta>Credits…</MonoMeta>;
  }

  const low = creditsTotal <= 10;

  return (
    <div
      className="tv-credit-chip"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: compact ? 6 : 10,
        flexWrap: 'wrap',
      }}
    >
      <MonoMeta>
        {creditsTotal} credit{creditsTotal === 1 ? '' : 's'}
        {!compact ? ` · ${tier}` : ''}
      </MonoMeta>
      {low ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => (onNeedCredits ? onNeedCredits() : navigate(pricingPath()))}
        >
          Top up
        </Button>
      ) : null}
    </div>
  );
}
