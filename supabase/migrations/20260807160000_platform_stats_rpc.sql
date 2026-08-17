-- Public aggregate counts for marketing timeline (profiles + community rooms).
CREATE OR REPLACE FUNCTION public.get_platform_stats()
RETURNS TABLE (profile_count bigint, community_room_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    (SELECT count(*) FROM public.profiles),
    (SELECT count(*) FROM public.rooms r
     JOIN public.profiles p ON p.id = r.user_id
     WHERE r.visibility = 'public' AND p.is_public = true);
$$;

REVOKE ALL ON FUNCTION public.get_platform_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_stats() TO anon, authenticated;

COMMENT ON FUNCTION public.get_platform_stats() IS
  'Public aggregate counts for marketing timeline (profiles + community rooms).';
