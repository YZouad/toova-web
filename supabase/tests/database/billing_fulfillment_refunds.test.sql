begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- Fixture auth users (Supabase auth.users shape)
insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'billing-topup@test.local',
    crypt('password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'billing-debt@test.local',
    crypt('password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'billing-partial@test.local',
    crypt('password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  )
on conflict (id) do nothing;

insert into public.profiles (id, handle, display_name)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'billing_topup', 'Billing Topup'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'billing_debt', 'Billing Debt'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'billing_partial', 'Billing Partial')
on conflict (id) do nothing;

-- wallets may already exist from trigger
select public.ensure_credit_wallet('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1');
select public.ensure_credit_wallet('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2');
select public.ensure_credit_wallet('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3');

-- 1) claim new event
select is(
  (public.claim_stripe_event('evt_test_1', 'checkout.session.completed')->>'claimed')::boolean,
  true,
  'claim_stripe_event claims a new event'
);

-- 2) duplicate while processing (in flight)
select is(
  (public.claim_stripe_event('evt_test_1', 'checkout.session.completed')->>'in_flight')::boolean,
  true,
  'claim_stripe_event reports in_flight for fresh processing claim'
);

-- 3) fail then reclaim
select ok(
  (public.fail_stripe_event('evt_test_1', 'boom')->>'ok')::boolean,
  'fail_stripe_event marks failed'
);

select is(
  (public.claim_stripe_event('evt_test_1', 'checkout.session.completed')->>'claimed')::boolean,
  true,
  'failed events can be reclaimed'
);

select ok(
  (public.complete_stripe_event('evt_test_1')->>'ok')::boolean,
  'complete_stripe_event marks processed'
);

select is(
  (public.claim_stripe_event('evt_test_1', 'checkout.session.completed')->>'duplicate')::boolean,
  true,
  'processed events are duplicates'
);

-- 4) fulfill top-up idempotently
select is(
  (public.fulfill_checkout_purchase(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    'topup_50',
    'cs_topup_1',
    'pi_topup_1',
    999,
    'usd',
    50,
    null,
    null
  )->>'credits_granted')::int,
  50,
  'fulfill_checkout_purchase grants top-up credits'
);

select is(
  (select purchased_balance from public.credit_wallets where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'),
  50,
  'wallet purchased_balance increases by 50'
);

select is(
  (public.fulfill_checkout_purchase(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    'topup_50',
    'cs_topup_1',
    'pi_topup_1',
    999,
    'usd',
    50,
    null,
    null
  )->>'idempotent')::boolean,
  true,
  'duplicate session fulfillment is idempotent'
);

select is(
  (select purchased_balance from public.credit_wallets where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'),
  50,
  'idempotent fulfill does not double-credit'
);

-- 5) proportional refund with debt when credits spent
update public.credit_wallets
set purchased_balance = 0, purchased_debt = 0
where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2';

select public.fulfill_checkout_purchase(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
  'topup_50',
  'cs_debt_1',
  'pi_debt_1',
  1000,
  'usd',
  50,
  null,
  null
);

-- spend 40 of the purchased credits (simulate by lowering balance to 10)
update public.credit_wallets
set purchased_balance = 10
where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2';

select is(
  (public.process_purchase_refund(
    're_debt_full',
    'pi_debt_1',
    null,
    'ch_debt_1',
    1000,
    1000,
    true
  )->>'credits_clawed')::int,
  50,
  'full refund claws back all granted credits'
);

select is(
  (select purchased_balance from public.credit_wallets where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'),
  0,
  'clawback removes remaining purchased balance'
);

select is(
  (select purchased_debt from public.credit_wallets where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'),
  40,
  'clawback shortfall becomes purchased_debt'
);

-- 6) partial refunds accumulate exactly
select public.fulfill_checkout_purchase(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
  'topup_100',
  'cs_partial_1',
  'pi_partial_1',
  1000,
  'usd',
  100,
  null,
  null
);

-- force kind/credits via direct update if topup_100 not in products — fulfill already inserted
update public.billing_purchases
set credits_granted = 100, amount_total_cents = 1000, kind = 'topup_100'
where checkout_session_id = 'cs_partial_1';

update public.credit_wallets
set purchased_balance = 100, purchased_debt = 0
where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3';

select is(
  (public.process_purchase_refund(
    're_partial_1',
    'pi_partial_1',
    null,
    'ch_partial_1',
    250,
    250,
    false
  )->>'credits_clawed')::int,
  25,
  '25% refund claws back 25 of 100 credits'
);

select is(
  (public.process_purchase_refund(
    're_partial_2',
    'pi_partial_1',
    null,
    'ch_partial_1',
    750,
    1000,
    true
  )->>'credits_clawed')::int,
  75,
  'second refund claws only the remaining delta to 100'
);

-- 7) later top-up settles purchased_debt before adding spendable credits
select public.credit_topup(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
  50,
  'stripe:checkout:cs_settle_debt'
);

select is(
  (select purchased_debt from public.credit_wallets where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'),
  0,
  'new top-up settles prior purchased_debt'
);

select * from finish();
rollback;
