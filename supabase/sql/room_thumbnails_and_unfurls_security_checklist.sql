-- Security checklist: room thumbnails + unfurls (Phase 3)
-- Run after applying room_thumbnails_and_unfurls.sql
-- Project: xfifgtedssabneqlxbhf

-- 1) Bucket is private
-- select id, public, file_size_limit, allowed_mime_types
-- from storage.buckets where id = 'room-thumbnails';
-- Expect: public = false, jpeg only

-- 2) Privileges (least privilege)
select
  p.proname,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
  has_function_privilege('public', p.oid, 'EXECUTE') as public_exec
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'get_share_unfurl',
    'get_public_room_unfurl',
    'has_room_thumbnail_access',
    'has_public_room_thumbnail',
    '_grant_share_assets'
  )
order by p.proname;
-- Expect: unfurl + access helpers anon+auth true, public false;
-- _grant_share_assets no client execute.

-- 3) Unfurl miss is opaque (null, no title/path leak)
-- select public.get_share_unfurl('not-a-real-token!!!!!!!');
-- select public.get_share_unfurl('<revoked_token>');
-- select public.get_public_room_unfurl('missing_handle', '00000000-0000-0000-0000-000000000000');
-- select public.get_public_room_unfurl('<handle>', '<private_room_id>');
-- Expect: all NULL

-- 4) Valid share unfurl
-- select public.get_share_unfurl('<active_token>');
-- Expect: title, owner_display, thumbnail_path (nullable), canonical_url
-- Then createSignedUrl on room-thumbnails for thumbnail_path → ok while grant live

-- 5) Valid public room unfurl (public profile + public room only)
-- select public.get_public_room_unfurl('<handle>', '<public_room_id>');
-- Expect: metadata; createSignedUrl on thumbnail → ok
-- Unpublish room or set profile private → NULL; new signatures denied

-- 6) Owner upload path
-- Authenticated owner: upload to room-thumbnails/{userId}/{roomId}/{uuid}.jpg → ok
-- Other user folder → denied
-- Anon list/enumerate storage → denied

-- 7) Revocation / unpublish
-- Revoke share or expire token → get_share_unfurl NULL; fresh createSignedUrl fails
-- Note: third-party chat OG caches may retain old previews until they re-crawl

-- 8) No table SELECT for anon on rooms/profiles (unchanged)
-- Confirm RLS still blocks anon SELECT on public.rooms / public.profiles

-- 9) Advisors
-- Dashboard → Advisors (or MCP get_advisors) after migration; triage storage/RLS/function warns
