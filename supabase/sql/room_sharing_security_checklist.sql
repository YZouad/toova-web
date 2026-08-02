-- Verification queries for room_sharing.sql security invariants.
-- Prefer also testing the Data API with the anon key for true role simulation.
--
-- Expected results are noted in comments.

-- 1) Anon must have no table grants on private tables
SELECT table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'anon'
  AND table_schema = 'public'
  AND table_name IN (
    'rooms', 'room_items', 'furniture_catalog',
    'room_shares', 'room_collaborators', 'share_asset_grants'
  );
-- Expect: no rows. furniture_catalog should stay revoked from anon.

-- 2) Function execute grants
SELECT
  p.proname,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
  has_function_privilege('public', p.oid, 'EXECUTE') AS public_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'get_shared_room', 'redeem_share_token', 'fork_shared_room',
    'is_room_owner', 'is_room_editor', 'has_share_asset_grant',
    '_grant_share_assets'
  )
ORDER BY p.proname;
-- Expect: get_shared_room anon+auth true, public false;
-- redeem/fork auth only; _grant_share_assets no client execute.

-- 3) After creating a share as owner:
--   SELECT public.get_shared_room('<token>');
-- Confirm share_asset_grants rows exist and expire within ~1h.

-- 4) Revoke and confirm failure:
--   UPDATE room_shares SET revoked_at = now() WHERE token = '<token>';
--   SELECT public.get_shared_room('<token>');  -- raises invalid share link

-- 5) Manual API checks (anon key, no session):
--   - GET /rest/v1/rooms → empty or permission denied
--   - createSignedUrl without grant → error
--   - After get_shared_room, createSignedUrl for granted path → ok
--   - Collaborator: save layout ok; DELETE room fail; INSERT room_shares fail
--   - fork_shared_room → new room owned by forker
