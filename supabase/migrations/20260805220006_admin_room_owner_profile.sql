-- Admin rooms rollup: include owner profile name/handle + updated_at for sorting.

DROP FUNCTION IF EXISTS public.get_admin_room_item_counts();

CREATE OR REPLACE FUNCTION public.get_admin_room_item_counts()
RETURNS TABLE (
  room_id uuid,
  room_name text,
  item_count bigint,
  owner_user_id uuid,
  owner_handle text,
  owner_display_name text,
  updated_at timestamptz
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
    r.id AS room_id,
    r.name AS room_name,
    COUNT(ri.id)::bigint AS item_count,
    r.user_id AS owner_user_id,
    p.handle AS owner_handle,
    p.display_name AS owner_display_name,
    r.updated_at AS updated_at
  FROM public.rooms AS r
  LEFT JOIN public.room_items AS ri ON ri.room_id = r.id
  LEFT JOIN public.profiles AS p ON p.id = r.user_id
  GROUP BY r.id, r.name, r.user_id, p.handle, p.display_name, r.updated_at
  ORDER BY item_count DESC, r.name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_room_item_counts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_room_item_counts() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_admin_room_item_counts() TO authenticated;

COMMENT ON FUNCTION public.get_admin_room_item_counts() IS
  'Admin-only: rooms with placed item totals, owner profile, and updated_at.';
