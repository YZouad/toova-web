-- Admin portal: inventory stats, room rollups, and user placement totals.
-- Prerequisites: public.admins, public.furniture_catalog, public.rooms, public.room_items.
-- Catalog metrics are read from furniture_catalog (likes_count, downloads_count, views_count).
-- Run in Dashboard → SQL Editor.

BEGIN;

-- Catalog engagement columns (harmless no-op if already present).
ALTER TABLE public.furniture_catalog
  ADD COLUMN IF NOT EXISTS likes_count bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS downloads_count bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS views_count bigint NOT NULL DEFAULT 0;

-- Let signed-in users read only their own admin row.
ALTER TABLE IF EXISTS public.admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admins_self_lookup ON public.admins;

CREATE POLICY admins_self_lookup ON public.admins
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

GRANT SELECT ON TABLE public.admins TO authenticated;

-- Postgres rejects CREATE OR REPLACE when the OUT-parameter / return row type changes (SQLSTATE 42P13). Drop admin RPCs before redefining their RETURNS shape.
DROP FUNCTION IF EXISTS public.get_admin_inventory_stats();
DROP FUNCTION IF EXISTS public.get_admin_room_item_counts();
DROP FUNCTION IF EXISTS public.get_admin_user_item_totals();
DROP FUNCTION IF EXISTS public.get_admin_bundle_suggestions(integer);

CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admins AS a
    WHERE a.user_id = uid
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.get_admin_inventory_stats()
RETURNS TABLE (
  kind text,
  label text,
  tags text[],
  description text,
  in_room_count bigint,
  distinct_room_count bigint,
  likes_count bigint,
  downloads_count bigint,
  views_count bigint
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
    fc.kind AS kind,
    fc.label AS label,
    COALESCE(fc.tags, '{}'::text[]) AS tags,
    fc.description AS description,
    COALESCE(ri.cnt, 0::bigint)::bigint AS in_room_count,
    COALESCE(dr.cnt, 0::bigint)::bigint AS distinct_room_count,
    COALESCE(fc.likes_count, 0::bigint)::bigint AS likes_count,
    COALESCE(fc.downloads_count, 0::bigint)::bigint AS downloads_count,
    COALESCE(fc.views_count, 0::bigint)::bigint AS views_count
  FROM public.furniture_catalog AS fc
  LEFT JOIN (
    SELECT ri2.kind AS kind,
           COUNT(*)::bigint AS cnt
    FROM public.room_items AS ri2
    GROUP BY ri2.kind
  ) AS ri ON ri.kind = fc.kind
  LEFT JOIN (
    SELECT ri3.kind AS kind,
           COUNT(DISTINCT ri3.room_id)::bigint AS cnt
    FROM public.room_items AS ri3
    GROUP BY ri3.kind
  ) AS dr ON dr.kind = fc.kind
  ORDER BY COALESCE(fc.likes_count, 0::bigint) DESC NULLS LAST, fc.label ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_inventory_stats() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_admin_inventory_stats() TO authenticated;

-- Pair-wise kinds that co-occur in the same room (read-only bundle hints for admins).
CREATE OR REPLACE FUNCTION public.get_admin_bundle_suggestions(p_min_room_cooccurrences int DEFAULT 2)
RETURNS TABLE (
  kind_a text,
  kind_b text,
  label_a text,
  label_b text,
  room_cooccurrence_count bigint
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
  WITH rk AS (
    SELECT DISTINCT ri.room_id, ri.kind
    FROM public.room_items AS ri
  ),
  pair_rows AS (
    SELECT a.room_id,
           a.kind AS kind_a,
           b.kind AS kind_b
    FROM rk AS a
    JOIN rk AS b ON b.room_id = a.room_id AND b.kind > a.kind
  ),
  agg AS (
    SELECT pr.kind_a,
           pr.kind_b,
           COUNT(*)::bigint AS room_cooccurrence_count
    FROM pair_rows AS pr
    GROUP BY pr.kind_a, pr.kind_b
    HAVING COUNT(*) >= p_min_room_cooccurrences
  )
  SELECT
    ag.kind_a,
    ag.kind_b,
    COALESCE(fca.label, ag.kind_a) AS label_a,
    COALESCE(fcb.label, ag.kind_b) AS label_b,
    ag.room_cooccurrence_count
  FROM agg AS ag
  LEFT JOIN public.furniture_catalog AS fca ON fca.kind = ag.kind_a
  LEFT JOIN public.furniture_catalog AS fcb ON fcb.kind = ag.kind_b
  ORDER BY ag.room_cooccurrence_count DESC, ag.kind_a ASC, ag.kind_b ASC
  LIMIT 100;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_bundle_suggestions(integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_admin_bundle_suggestions(integer) TO authenticated;

-- Per-room: how many placed items live in each room (+ owner).
CREATE OR REPLACE FUNCTION public.get_admin_room_item_counts()
RETURNS TABLE (
  room_id uuid,
  room_name text,
  item_count bigint,
  owner_user_id uuid
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
    r.user_id AS owner_user_id
  FROM public.rooms AS r
  LEFT JOIN public.room_items AS ri ON ri.room_id = r.id
  GROUP BY r.id, r.name, r.user_id
  ORDER BY item_count DESC, r.name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_room_item_counts() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_admin_room_item_counts() TO authenticated;

-- Per-account: distinct rooms owned and total placed items across all their rooms.
CREATE OR REPLACE FUNCTION public.get_admin_user_item_totals()
RETURNS TABLE (
  user_id uuid,
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
    COUNT(DISTINCT r.id)::bigint AS room_count,
    COUNT(ri.id)::bigint AS total_item_placements
  FROM public.rooms AS r
  LEFT JOIN public.room_items AS ri ON ri.room_id = r.id
  GROUP BY r.user_id
  ORDER BY total_item_placements DESC, room_count DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_user_item_totals() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_admin_user_item_totals() TO authenticated;

COMMENT ON FUNCTION public.is_admin(uuid) IS
  'Returns true iff uid appears in public.admins. SECURITY DEFINER; not granted to callers by default.';
COMMENT ON FUNCTION public.get_admin_inventory_stats() IS
  'Admin-only: catalog row + placement count + distinct rooms with item + catalog likes/downloads/views.';
COMMENT ON FUNCTION public.get_admin_bundle_suggestions(integer) IS
  'Admin-only: pair kinds that co-occur in at least p_min_room_cooccurrences rooms (max 100 rows).';
COMMENT ON FUNCTION public.get_admin_room_item_counts() IS
  'Admin-only: rooms with placed item totals and owning user.';
COMMENT ON FUNCTION public.get_admin_user_item_totals() IS
  'Admin-only: per auth user — room count and total placements across rooms.';

COMMIT;
