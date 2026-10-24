-- Terms/Privacy 2026-10-24. Apply together with the web + iOS release that
-- ships these versions: older clients send the previous version and would be
-- unable to accept. Keep in sync with src/legal/documents.ts and toova-ios
-- LegalVersions.

BEGIN;

CREATE OR REPLACE FUNCTION public.current_terms_version()
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$ SELECT '2026-10-24'::text $$;

CREATE OR REPLACE FUNCTION public.current_privacy_version()
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$ SELECT '2026-10-24'::text $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
