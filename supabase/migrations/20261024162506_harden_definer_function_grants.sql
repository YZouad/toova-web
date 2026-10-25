-- Harden SECURITY DEFINER function grants and pg_net table access.
-- Supabase default privileges grant EXECUTE to anon/authenticated even after
-- REVOKE FROM PUBLIC. Explicitly revoke those roles and keep service_role only
-- for internal notification/lifecycle/trigger helpers.
-- unsubscribe_lifecycle_email stays callable by anon (email link).

-- ---------------------------------------------------------------------------
-- Notification + lifecycle RPCs
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.ensure_notification_prefs(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_notification_prefs(uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.create_notification(uuid, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_notification(uuid, text, text, text, jsonb)
  TO service_role;

REVOKE ALL ON FUNCTION public.enqueue_lifecycle_email(uuid, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_lifecycle_email(uuid, text, text, jsonb)
  TO service_role;

REVOKE ALL ON FUNCTION public.enqueue_lifecycle_candidates()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_lifecycle_candidates()
  TO service_role;

REVOKE ALL ON FUNCTION public.invoke_lifecycle_email_drain()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_lifecycle_email_drain()
  TO service_role;

-- Trigger-only definer helpers (still fire from table triggers after revoke).
REVOKE ALL ON FUNCTION public.notify_on_room_like()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_on_room_like()
  TO service_role;

REVOKE ALL ON FUNCTION public.notify_on_room_fork()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_on_room_fork()
  TO service_role;

REVOKE ALL ON FUNCTION public.notify_on_conversion_completed()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_on_conversion_completed()
  TO service_role;

REVOKE ALL ON FUNCTION public.profiles_init_credit_wallet()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.profiles_init_credit_wallet()
  TO service_role;

REVOKE ALL ON FUNCTION public.trg_room_shares_require_terms()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_room_shares_require_terms()
  TO service_role;

REVOKE ALL ON FUNCTION public.trg_block_preserved_catalog_delete()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_block_preserved_catalog_delete()
  TO service_role;

REVOKE ALL ON FUNCTION public.trg_block_preserved_room_delete()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_block_preserved_room_delete()
  TO service_role;

REVOKE ALL ON FUNCTION public.trg_block_quarantined_catalog_public()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_block_quarantined_catalog_public()
  TO service_role;

REVOKE ALL ON FUNCTION public.trg_block_quarantined_room_public()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_block_quarantined_room_public()
  TO service_role;

-- Public unsubscribe link still needs anon EXECUTE.
REVOKE ALL ON FUNCTION public.unsubscribe_lifecycle_email(text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unsubscribe_lifecycle_email(text)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Lifecycle cron secret in Vault + drain reads from Vault
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.secrets WHERE name = 'lifecycle_cron_secret'
  ) THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'lifecycle_cron_secret',
      'Shared secret for pg_cron → send-lifecycle-email edge drain'
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.invoke_lifecycle_email_drain()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, vault, extensions
AS $$
DECLARE
  req_id bigint;
  endpoint text;
  secret text;
BEGIN
  endpoint := nullif(current_setting('app.settings.lifecycle_email_url', true), '');
  IF endpoint IS NULL THEN
    endpoint := 'https://xfifgtedssabneqlxbhf.supabase.co/functions/v1/send-lifecycle-email';
  END IF;

  SELECT s.decrypted_secret
  INTO secret
  FROM vault.decrypted_secrets s
  WHERE s.name = 'lifecycle_cron_secret'
  LIMIT 1;

  IF secret IS NULL OR length(secret) < 16 THEN
    RAISE WARNING 'lifecycle_cron_secret missing or too short — skipping drain';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := endpoint,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', secret
    ),
    body := '{}'::jsonb
  ) INTO req_id;

  RETURN req_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_lifecycle_email_drain()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_lifecycle_email_drain()
  TO service_role;

-- ---------------------------------------------------------------------------
-- Lock down pg_net request/response tables (headers can leak cron secrets)
-- NOTE: Grants on net.* are owned by supabase_admin. The postgres role cannot
-- revoke them (SET ROLE supabase_admin is denied). net is not in PostgREST
-- exposed schemas (public, graphql_public only), so Data API clients cannot
-- SELECT these tables. Re-attempt revoke when/if supabase_admin access exists.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'net' AND table_name = 'http_request_queue'
  ) THEN
    EXECUTE 'REVOKE ALL ON TABLE net.http_request_queue FROM PUBLIC, anon, authenticated';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'net' AND table_name = '_http_response'
  ) THEN
    EXECUTE 'REVOKE ALL ON TABLE net._http_response FROM PUBLIC, anon, authenticated';
  END IF;
  EXECUTE 'REVOKE USAGE ON SCHEMA net FROM PUBLIC, anon, authenticated';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Could not revoke net schema/table grants (expected without supabase_admin): %', SQLERRM;
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not revoke net schema/table grants: %', SQLERRM;
END $$;
