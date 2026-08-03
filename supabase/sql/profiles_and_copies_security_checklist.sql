-- Phase 2 security checklist (run after profiles_and_copies.sql)
-- Expect denials / null / generic errors as noted.

-- 1) Anon must not enumerate profiles
-- set role anon; select * from profiles;  -- deny / empty
-- select * from profile_handle_aliases; -- deny / empty

-- 2) Private vs missing profiles look the same
-- select public.get_profile_page('definitely_missing_zzzz'); -- null
-- (with a private profile handle) select public.get_profile_page('<private_handle>'); -- null for anon

-- 3) Public profile only returns public rooms
-- After making a profile public and one room public:
-- select jsonb_array_length(public.get_profile_page('<handle>')->'rooms');
-- Only public rooms should appear for anon/other users.

-- 4) get_public_room requires public profile + public room
-- select public.get_public_room('<handle>', '<private_room_id>'); -- room not found
-- select public.get_public_room('<handle>', '<public_room_id>');  -- ok when both public

-- 5) Clients cannot forge lineage / visibility
-- As authenticated owner:
-- update rooms set fork_count = 99 where id = '<id>'; -- fail (column privilege / trigger)
-- update rooms set forked_from = '<other>'; -- fail
-- update rooms set visibility = 'public'; -- fail (use set_room_visibility)

-- 6) Collaborators cannot publish
-- As collaborator: select public.set_room_visibility('<room>', 'public'); -- not room owner

-- 7) Avatar storage scoped
-- Anon createSignedUrl on private profile avatar path → deny
-- Anon createSignedUrl on public profile avatar path → ok after profile.is_public

-- 8) Public room assets scoped
-- Anon createSignedUrl on model path not referenced by any public room → deny
-- Anon createSignedUrl on path referenced by public room of public profile → ok

-- 9) Handle aliases
-- Change handle via update_own_profile; old handle should resolve via get_profile_page
-- and return canonical_handle = new handle.

-- 10) Fork integrity
-- fork_public_room / fork_shared_room: new room.user_id = caller, forked_from set,
-- source fork_count increments by 1; room limit enforced.

-- Spot checks (as service role / SQL editor):
SELECT count(*) AS profile_count FROM public.profiles;
SELECT handle, is_public FROM public.profiles ORDER BY created_at LIMIT 10;

SELECT proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND proname IN (
    'get_profile_page',
    'get_public_room',
    'fork_public_room',
    'set_room_visibility',
    'update_own_profile',
    'list_room_collaborator_profiles',
    'get_room_attribution',
    'has_public_avatar_access',
    'has_public_room_asset'
  )
ORDER BY proname;

-- Ensure private helpers are not executable by anon/authenticated
SELECT
  n.nspname,
  p.proname,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'private'
  AND p.proname IN (
    'copy_room_as_fork',
    'resolve_profile_id',
    'allocate_unique_handle',
    'public_attribution'
  );
