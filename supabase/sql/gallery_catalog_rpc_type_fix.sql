-- Fix get_gallery_catalog return types: engagement counters are integer in prod.

CREATE OR REPLACE FUNCTION public.get_gallery_catalog(
  p_source text DEFAULT 'community',
  p_sort text DEFAULT 'hot',
  p_category text DEFAULT NULL,
  p_query text DEFAULT NULL,
  p_limit int DEFAULT 48,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  kind text,
  label text,
  description text,
  tags text[],
  categories text[],
  width_in numeric,
  height_in numeric,
  depth_in numeric,
  clearance_in numeric,
  model_url text,
  thumbnail_path text,
  user_id uuid,
  visibility text,
  is_builtin boolean,
  likes_count bigint,
  downloads_count bigint,
  views_count bigint,
  created_at timestamptz,
  creator_handle text,
  creator_display_name text,
  liked_by_me boolean,
  hot_score double precision,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  lim int := greatest(1, least(coalesce(p_limit, 48), 100));
  off int := greatest(0, coalesce(p_offset, 0));
  src text := lower(coalesce(p_source, 'community'));
  srt text := lower(coalesce(p_sort, 'hot'));
  cat text := nullif(lower(trim(coalesce(p_category, ''))), '');
  q text := nullif(lower(trim(coalesce(p_query, ''))), '');
  uid uuid := (SELECT auth.uid());
BEGIN
  IF src NOT IN ('community', 'toova', 'mine') THEN
    RAISE EXCEPTION 'invalid source' USING ERRCODE = '22023';
  END IF;
  IF src = 'mine' AND uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF srt NOT IN ('hot', 'downloads', 'likes', 'views', 'newest') THEN
    RAISE EXCEPTION 'invalid sort' USING ERRCODE = '22023';
  END IF;
  IF cat IS NOT NULL AND NOT (cat = ANY (public.catalog_valid_categories())) THEN
    RAISE EXCEPTION 'invalid category' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      fc.kind,
      fc.label,
      fc.description,
      fc.tags,
      fc.categories,
      fc.width_in,
      fc.height_in,
      fc.depth_in,
      fc.clearance_in,
      fc.model_url,
      fc.thumbnail_path,
      fc.user_id,
      fc.visibility,
      fc.is_builtin,
      coalesce(fc.likes_count, 0)::bigint AS likes_count,
      coalesce(fc.downloads_count, 0)::bigint AS downloads_count,
      coalesce(fc.views_count, 0)::bigint AS views_count,
      fc.created_at,
      CASE
        WHEN fc.is_builtin THEN NULL
        ELSE p.handle
      END AS creator_handle,
      CASE
        WHEN fc.is_builtin THEN NULL
        ELSE p.display_name
      END AS creator_display_name,
      EXISTS (
        SELECT 1 FROM public.catalog_likes cl
        WHERE cl.user_id = uid AND cl.model_kind = fc.kind
      ) AS liked_by_me,
      public.catalog_hot_score(
        coalesce(fc.likes_count, 0)::bigint,
        coalesce(fc.downloads_count, 0)::bigint,
        coalesce(fc.views_count, 0)::bigint,
        fc.created_at
      ) AS hot_score
    FROM public.furniture_catalog fc
    LEFT JOIN public.profiles p ON p.id = fc.user_id
    WHERE
      (
        (src = 'community' AND fc.is_builtin = false AND fc.visibility = 'public'
          AND p.is_public IS TRUE)
        OR (src = 'toova' AND fc.is_builtin = true)
        OR (src = 'mine' AND fc.is_builtin = false AND fc.user_id = uid)
      )
      AND (cat IS NULL OR cat = ANY (fc.categories))
      AND (
        q IS NULL
        OR lower(fc.label) LIKE '%' || q || '%'
        OR lower(coalesce(fc.description, '')) LIKE '%' || q || '%'
        OR EXISTS (SELECT 1 FROM unnest(fc.categories) c WHERE c LIKE '%' || q || '%')
        OR EXISTS (SELECT 1 FROM unnest(fc.tags) t WHERE lower(t) LIKE '%' || q || '%')
        OR (p.handle IS NOT NULL AND lower(p.handle) LIKE '%' || q || '%')
        OR (p.display_name IS NOT NULL AND lower(p.display_name) LIKE '%' || q || '%')
      )
  ),
  counted AS (
    SELECT b.*, count(*) OVER ()::bigint AS total_count
    FROM base b
  )
  SELECT
    c.kind, c.label, c.description, c.tags, c.categories,
    c.width_in, c.height_in, c.depth_in, c.clearance_in,
    c.model_url, c.thumbnail_path, c.user_id, c.visibility, c.is_builtin,
    c.likes_count, c.downloads_count, c.views_count, c.created_at,
    c.creator_handle, c.creator_display_name, c.liked_by_me, c.hot_score, c.total_count
  FROM counted c
  ORDER BY
    CASE WHEN srt = 'hot' THEN c.hot_score END DESC NULLS LAST,
    CASE WHEN srt = 'downloads' THEN c.downloads_count END DESC NULLS LAST,
    CASE WHEN srt = 'likes' THEN c.likes_count END DESC NULLS LAST,
    CASE WHEN srt = 'views' THEN c.views_count END DESC NULLS LAST,
    CASE WHEN srt = 'newest' OR src = 'mine' THEN c.created_at END DESC NULLS LAST,
    c.created_at DESC,
    c.kind ASC
  LIMIT lim OFFSET off;
END;
$$;

REVOKE ALL ON FUNCTION public.get_gallery_catalog(text, text, text, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_gallery_catalog(text, text, text, text, int, int) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
