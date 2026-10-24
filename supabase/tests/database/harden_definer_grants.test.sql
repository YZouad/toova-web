begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- Notification / lifecycle RPCs must not be executable by anon.
select is(
  has_function_privilege('anon', 'public.create_notification(uuid, text, text, text, jsonb)', 'EXECUTE'),
  false,
  'anon cannot execute create_notification'
);

select is(
  has_function_privilege('anon', 'public.enqueue_lifecycle_email(uuid, text, text, jsonb)', 'EXECUTE'),
  false,
  'anon cannot execute enqueue_lifecycle_email'
);

select is(
  has_function_privilege('anon', 'public.ensure_notification_prefs(uuid)', 'EXECUTE'),
  false,
  'anon cannot execute ensure_notification_prefs'
);

select is(
  has_function_privilege('authenticated', 'public.ensure_notification_prefs(uuid)', 'EXECUTE'),
  false,
  'authenticated cannot execute ensure_notification_prefs'
);

select is(
  has_function_privilege('anon', 'public.enqueue_lifecycle_candidates()', 'EXECUTE'),
  false,
  'anon cannot execute enqueue_lifecycle_candidates'
);

select is(
  has_function_privilege('anon', 'public.invoke_lifecycle_email_drain()', 'EXECUTE'),
  false,
  'anon cannot execute invoke_lifecycle_email_drain'
);

select is(
  has_function_privilege('anon', 'public.notify_on_room_like()', 'EXECUTE'),
  false,
  'anon cannot execute notify_on_room_like'
);

select is(
  has_function_privilege('anon', 'public.notify_on_room_fork()', 'EXECUTE'),
  false,
  'anon cannot execute notify_on_room_fork'
);

select is(
  has_function_privilege('anon', 'public.notify_on_conversion_completed()', 'EXECUTE'),
  false,
  'anon cannot execute notify_on_conversion_completed'
);

select is(
  has_function_privilege('anon', 'public.profiles_init_credit_wallet()', 'EXECUTE'),
  false,
  'anon cannot execute profiles_init_credit_wallet'
);

-- Unsubscribe remains public by design.
select is(
  has_function_privilege('anon', 'public.unsubscribe_lifecycle_email(text)', 'EXECUTE'),
  true,
  'anon can execute unsubscribe_lifecycle_email'
);

-- service_role retains access to internal helpers.
select is(
  has_function_privilege('service_role', 'public.create_notification(uuid, text, text, text, jsonb)', 'EXECUTE'),
  true,
  'service_role can execute create_notification'
);

select is(
  has_function_privilege('service_role', 'public.ensure_notification_prefs(uuid)', 'EXECUTE'),
  true,
  'service_role can execute ensure_notification_prefs'
);

select is(
  has_function_privilege('service_role', 'public.invoke_lifecycle_email_drain()', 'EXECUTE'),
  true,
  'service_role can execute invoke_lifecycle_email_drain'
);

select * from finish();
rollback;
