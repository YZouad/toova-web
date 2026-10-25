import { describe, expect, it } from 'vitest';
import { purchasedDebt, totalCredits, type BillingSnapshot } from './billing';

const base: BillingSnapshot = {
  tier: 'free',
  display_name: 'Free',
  entitlements: {
    tier: 'free',
    display_name: 'Free',
    max_rooms: 5,
    unlimited_rooms: false,
    monthly_credits: 15,
    export_max_px: 1920,
    watermark: true,
    ar_export: false,
    share_ttl_days: 14,
  },
  monthly_balance: 10,
  purchased_balance: 5,
  purchased_debt: 3,
  monthly_period_end: null,
  subscription: null,
};

describe('billing helpers', () => {
  it('sums spendable balances and surfaces debt', () => {
    expect(totalCredits(base)).toBe(15);
    expect(purchasedDebt(base)).toBe(3);
    expect(purchasedDebt(null)).toBe(0);
    expect(purchasedDebt({ ...base, purchased_debt: -1 })).toBe(0);
  });
});
