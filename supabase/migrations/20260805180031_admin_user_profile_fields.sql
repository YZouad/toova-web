-- Admin users rollup: include profile handle + display_name next to user id.

DROP FUNCTION IF EXISTS public.get_admin_user_item_totals();

CREATE OR REPLACE FUNCTION public.get_admin_user_item_totals()
RETURNS TABLE (
  user_id uuid,
  handle text,
  display_name text,
  room_count bigint,
  total_item_placements bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.admins AS a
    WHERE a.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not authorized'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    r.user_id AS user_id,
    p.handle AS handle,
    p.display_name AS display_name,
    COUNT(DISTINCT r.id)::bigint AS room_count,
    COUNT(ri.id)::bigint AS total_item_placements
  FROM public.rooms AS r
  LEFT JOIN public.room_items AS ri ON ri.room_id = r.id
  LEFT JOIN public.profiles AS p ON p.id = r.user_id
  GROUP BY r.user_id, p.handle, p.display_name
  ORDER BY total_item_placements DESC, room_count DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_user_item_totals() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_user_item_totals() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_admin_user_item_totals() TO authenticated;

COMMENT ON FUNCTION public.get_admin_user_item_totals() IS
  'Admin-only: per auth user — room count, placements, profile handle and display name.';
