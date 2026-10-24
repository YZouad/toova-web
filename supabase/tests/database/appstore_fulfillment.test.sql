begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'appstore-topup@test.local',
    crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'appstore-sub@test.local',
    crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  )
on conflict (id) do nothing;

insert into public.profiles (id, handle, display_name)
values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'as_topup', 'AS Topup'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'as_sub', 'AS Sub')
on conflict (id) do nothing;

select public.ensure_credit_wallet('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1');
select public.ensure_credit_wallet('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2');

-- 1) credit pack fulfill
select is(
  (public.appstore_fulfill_transaction(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
    'txn_credits_1',
    'txn_credits_1',
    'net.toova.credits.50',
    'Sandbox',
    null,
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
    now(),
    '{}'::jsonb
  )->>'credits_granted')::int,
  50,
  'appstore credit pack grants 50'
);

-- 2) idempotent replay
select is(
  (public.appstore_fulfill_transaction(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
    'txn_credits_1',
    'txn_credits_1',
    'net.toova.credits.50',
    'Sandbox',
    null,
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
    now(),
    '{}'::jsonb
  )->>'idempotent')::boolean,
  true,
  'appstore credit pack is idempotent'
);

-- 3) wallet balance
select is(
  (select purchased_balance from public.credit_wallets
   where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'),
  50,
  'purchased_balance reflects credit pack'
);

-- 4) subscription fulfill
select is(
  (public.appstore_fulfill_transaction(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
    'txn_pro_1',
    'orig_pro_1',
    'net.toova.pro.monthly',
    'Sandbox',
    now() + interval '30 days',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
    now(),
    '{}'::jsonb
  )->>'tier'),
  'pro',
  'appstore subscription grants pro'
);

select is(
  (select source from public.subscriptions
   where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2'),
  'app_store',
  'subscription source is app_store'
);

select is(
  public.get_effective_tier('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2'),
  'pro',
  'effective tier is pro after App Store sub'
);

-- 5) revoke credits
select ok(
  (public.appstore_revoke_transaction('txn_credits_1', 'refund')->>'ok')::boolean,
  'revoke credit transaction succeeds'
);

select is(
  (select purchased_balance from public.credit_wallets
   where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'),
  0,
  'credit clawback after refund'
);

-- 6) expire subscription
select ok(
  (public.appstore_expire_subscription('orig_pro_1')->>'ok')::boolean,
  'expire subscription succeeds'
);

select is(
  public.get_effective_tier('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2'),
  'free',
  'tier falls back to free after expire'
);

select * from finish();
rollback;
