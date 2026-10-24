begin;
select plan(6);

select ok(
  exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ),
  'notifications is in supabase_realtime publication'
);

select ok(
  not has_function_privilege('anon', 'public.create_notification(uuid, text, text, text, jsonb)', 'EXECUTE'),
  'anon cannot execute create_notification'
);

select ok(
  not has_function_privilege('authenticated', 'public.ensure_notification_prefs(uuid)', 'EXECUTE'),
  'authenticated cannot execute ensure_notification_prefs'
);

select ok(
  has_function_privilege('authenticated', 'public.get_my_notifications(int)', 'EXECUTE'),
  'authenticated can execute get_my_notifications'
);

select ok(
  has_function_privilege('authenticated', 'public.mark_notifications_read(uuid[])', 'EXECUTE'),
  'authenticated can execute mark_notifications_read'
);

select ok(
  has_table_privilege('authenticated', 'public.notification_prefs', 'SELECT')
    and has_table_privilege('authenticated', 'public.notification_prefs', 'INSERT')
    and has_table_privilege('authenticated', 'public.notification_prefs', 'UPDATE'),
  'authenticated can select/insert/update notification_prefs'
);

select * from finish();
rollback;
