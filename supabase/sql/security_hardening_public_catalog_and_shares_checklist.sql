-- Security checklist after security_hardening_public_catalog_and_shares
-- Project: xfifgtedssabneqlxbhf

-- 1) model-files policies are owner + public catalog + public room (no unbound share grant)
-- select policyname, roles, cmd from pg_policies
-- where schemaname='storage' and policyname like 'model_files%';

-- 2) Anonymous cannot execute admin / usdz invoke RPCs
-- select proname,
--   has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
--   has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec
-- from pg_proc p join pg_namespace n on n.oid=p.pronamespace
-- where n.nspname='public' and proname in (
--   'invoke_glb_to_usdz_for','reconvert_glb_to_usdz_for','is_admin',
--   'get_admin_inventory_stats','has_share_asset_grant','list_share_asset_paths'
-- );

-- 3) has_share_asset_grant(path) alone is false; (path, token) is the real check
-- select public.has_share_asset_grant('some/path.glb');
-- Expect: false

-- 4) Public catalog browse: anon can select visibility=public rows and sign those storage paths
-- 5) Share signing: POST /functions/v1/sign-share-assets { "token": "<share>" }
-- Expect: { urls: { "<path>": "https://...signed..." } }

-- 6) Feedback: submit_feedback rate-limits; insert policy is constrained
-- 7) Auth dashboard: enable Leaked Password Protection (not settable via SQL)
-- 8) Advisors: get_advisors security + performance after deploy
