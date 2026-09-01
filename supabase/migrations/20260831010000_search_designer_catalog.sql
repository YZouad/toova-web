-- Designer command-palette catalog search (fuzzy via pg_trgm).
-- Separate from browse RPC get_gallery_catalog — keeps Library/Gallery contracts unchanged.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Normalized searchable text helper (used by RPC scoring).
CREATE OR REPLACE FUNCTION public.catalog_search_document(
  p_label text,
  p_description text,
  p_categories text[],
  p_tags text[],
  p_kind text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(trim(concat_ws(' ',
    coalesce(p_label, ''),
    coalesce(p_description, ''),
    coalesce(array_to_string(p_categories, ' '), ''),
    coalesce(array_to_string(p_tags, ' '), ''),
    coalesce(p_kind, '')
  )));
$$;

CREATE INDEX IF NOT EXISTS furniture_catalog_label_trgm_idx
  ON public.furniture_catalog
  USING gin (lower(label) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS furniture_catalog_kind_trgm_idx
  ON public.furniture_catalog
  USING gin (lower(kind) gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.search_designer_catalog(
  p_query text,
  p_terms text[] DEFAULT NULL,
  p_limit int DEFAULT 12,
  p_include_mine boolean DEFAULT true
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
  source text,
  relevance double precision
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  lim int := greatest(1, least(coalesce(p_limit, 12), 24));
  q text := nullif(lower(trim(coalesce(p_query, ''))), '');
  uid uuid := (SELECT auth.uid());
  terms text[];
BEGIN
  IF q IS NULL THEN
    RETURN;
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT lower(trim(x))
    FROM unnest(coalesce(p_terms, ARRAY[]::text[])) AS x
    WHERE length(trim(x)) >= 2
  ) INTO terms;
  IF terms IS NULL OR terms = '{}'::text[] THEN
    terms := ARRAY[q];
  END IF;

  RETURN QUERY
  WITH visible AS (
    SELECT
      fc.*,
      CASE
        WHEN fc.is_builtin THEN 'toova'
        WHEN fc.user_id = uid THEN 'mine'
        ELSE 'community'
      END AS src,
      public.catalog_search_document(
        fc.label, fc.description, fc.categories, fc.tags, fc.kind
      ) AS doc,
      public.catalog_hot_score(
        coalesce(fc.likes_count, 0)::bigint,
        coalesce(fc.downloads_count, 0)::bigint,
        coalesce(fc.views_count, 0)::bigint,
        fc.created_at
      ) AS hot
    FROM public.furniture_catalog fc
    LEFT JOIN public.profiles p ON p.id = fc.user_id
    WHERE
      (
        (fc.is_builtin = true AND coalesce(fc.show_in_gallery, true))
        OR (fc.is_builtin = false AND fc.visibility = 'public' AND p.is_public IS TRUE)
        OR (p_include_mine AND uid IS NOT NULL AND fc.is_builtin = false AND fc.user_id = uid)
      )
  ),
  scored AS (
    SELECT
      v.*,
      (
        CASE WHEN v.doc = q THEN 100.0 ELSE 0.0 END
        + CASE WHEN v.doc LIKE q || '%' THEN 60.0 ELSE 0.0 END
        + CASE WHEN v.doc LIKE '%' || q || '%' THEN 40.0 ELSE 0.0 END
        + CASE WHEN lower(v.label) = q THEN 50.0 ELSE 0.0 END
        + CASE WHEN lower(v.label) LIKE q || '%' THEN 30.0 ELSE 0.0 END
        + CASE WHEN lower(v.kind) = q THEN 25.0 ELSE 0.0 END
        + coalesce((
            SELECT max(similarity(v.doc, t)) * 80.0
            FROM unnest(terms) AS t
          ), 0.0)
        + coalesce((
            SELECT max(
              CASE
                WHEN v.doc LIKE '%' || t || '%' THEN 35.0
                ELSE 0.0
              END
            )
            FROM unnest(terms) AS t
          ), 0.0)
      ) AS rel
    FROM visible v
  )
  SELECT
    s.kind,
    s.label,
    s.description,
    s.tags,
    s.categories,
    s.width_in,
    s.height_in,
    s.depth_in,
    s.clearance_in,
    s.model_url,
    s.thumbnail_path,
    s.user_id,
    s.visibility,
    s.is_builtin,
    coalesce(s.likes_count, 0)::bigint,
    coalesce(s.downloads_count, 0)::bigint,
    coalesce(s.views_count, 0)::bigint,
    s.created_at,
    CASE WHEN s.is_builtin THEN NULL ELSE p.handle END,
    CASE WHEN s.is_builtin THEN NULL ELSE p.display_name END,
    EXISTS (
      SELECT 1 FROM public.catalog_likes cl
      WHERE cl.user_id = uid AND cl.model_kind = s.kind
    ),
    s.hot,
    s.src,
    s.rel
  FROM scored s
  LEFT JOIN public.profiles p ON p.id = s.user_id
  WHERE s.rel > 8.0
     OR s.doc % q
     OR EXISTS (
       SELECT 1 FROM unnest(terms) t WHERE s.doc % t OR s.doc LIKE '%' || t || '%'
     )
  ORDER BY
    s.rel DESC,
    CASE WHEN s.src = 'toova' THEN 0 WHEN s.src = 'mine' THEN 1 ELSE 2 END,
    s.hot DESC NULLS LAST,
    s.kind ASC
  LIMIT lim;
END;
$$;

REVOKE ALL ON FUNCTION public.search_designer_catalog(text, text[], int, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_designer_catalog(text, text[], int, boolean)
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
