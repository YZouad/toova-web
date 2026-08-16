-- Restore SECURITY DEFINER on get_gallery_catalog.
-- The multi-category filter migration left it as SECURITY INVOKER, which breaks
-- community gallery for anon (no SELECT on profiles) and for authenticated users
-- (RLS only allows reading your own profile, so other creators' models vanish).
-- Public profile fields must be read through DEFINER RPCs — see profiles_and_copies.sql.

ALTER FUNCTION public.get_gallery_catalog(text, text, text, text, int, int)
  SECURITY DEFINER;

-- Keep execute grants explicit for Data API roles.
REVOKE ALL ON FUNCTION public.get_gallery_catalog(text, text, text, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_gallery_catalog(text, text, text, text, int, int)
  TO anon, authenticated;
