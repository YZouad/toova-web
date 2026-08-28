-- Curated Toova gallery order + hide checklist-only decor from Add furniture panel.

ALTER TABLE public.furniture_catalog
  ADD COLUMN IF NOT EXISTS gallery_sort_order int NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS show_in_gallery boolean NOT NULL DEFAULT true;

-- Wall shelf builtin (procedural mesh, same pattern as bookshelf).
INSERT INTO public.furniture_catalog (
  kind, label, description, width_in, height_in, depth_in, clearance_in,
  is_builtin, model_url, tags, categories, visibility, gallery_sort_order, show_in_gallery
) VALUES (
  'shelf',
  'Wall Shelf',
  'Floating wall shelf — board parallel to the floor.',
  36, 1.5, 10, null,
  true,
  null,
  '{}'::text[],
  ARRAY['storage', 'decor_art'],
  'public',
  50,
  true
)
ON CONFLICT (kind) DO UPDATE
SET label = EXCLUDED.label,
    description = EXCLUDED.description,
    width_in = EXCLUDED.width_in,
    height_in = EXCLUDED.height_in,
    depth_in = EXCLUDED.depth_in,
    categories = EXCLUDED.categories,
    is_builtin = true,
    visibility = 'public',
    gallery_sort_order = EXCLUDED.gallery_sort_order,
    show_in_gallery = EXCLUDED.show_in_gallery;

-- Default Toova tab order (lower = earlier).
UPDATE public.furniture_catalog SET gallery_sort_order = 10 WHERE kind = 'bed';
UPDATE public.furniture_catalog SET gallery_sort_order = 20 WHERE kind = 'desk';
UPDATE public.furniture_catalog SET gallery_sort_order = 30 WHERE kind = 'wardrobe';
UPDATE public.furniture_catalog SET gallery_sort_order = 40 WHERE kind = 'bookshelf';
UPDATE public.furniture_catalog SET gallery_sort_order = 50 WHERE kind = 'shelf';
UPDATE public.furniture_catalog SET gallery_sort_order = 60 WHERE kind = 'dresser';
UPDATE public.furniture_catalog SET gallery_sort_order = 70 WHERE kind = 'nightstand';
UPDATE public.furniture_catalog SET gallery_sort_order = 80 WHERE kind = 'chair';
UPDATE public.furniture_catalog SET gallery_sort_order = 90 WHERE kind = 'checklist-rug';
UPDATE public.furniture_catalog SET gallery_sort_order = 100 WHERE kind = 'lamp';
UPDATE public.furniture_catalog SET gallery_sort_order = 110 WHERE kind = 'checklist-whiteboard';
UPDATE public.furniture_catalog SET gallery_sort_order = 120 WHERE kind = 'checklist-mirror';
UPDATE public.furniture_catalog SET gallery_sort_order = 130 WHERE kind = 'custom-b3e82c83-e133-4b68-924e-ee948af325a1';
UPDATE public.furniture_catalog SET gallery_sort_order = 140 WHERE kind = 'custom-a9ba5bb3-0823-4602-bbea-0d46003f7321';
UPDATE public.furniture_catalog SET gallery_sort_order = 150 WHERE kind = 'custom-b2cc0083-4871-4e53-83d2-3707b272d0e4';
UPDATE public.furniture_catalog SET gallery_sort_order = 160 WHERE kind = 'custom-8b3a400e-8e56-4164-85cb-101e8877407a';
UPDATE public.furniture_catalog SET gallery_sort_order = 170 WHERE kind = 'custom-ff4f0d39-dadc-4edb-8ee3-3e79931216df';
UPDATE public.furniture_catalog SET gallery_sort_order = 180 WHERE kind = 'custom-7b30b614-241d-4dcc-9579-3b2bd23d5e2b';
UPDATE public.furniture_catalog SET gallery_sort_order = 190 WHERE kind = 'custom-301e5ecc-5088-410c-a67f-4b2ddf0f47b1';
UPDATE public.furniture_catalog SET gallery_sort_order = 200 WHERE kind = 'custom-e1044642-6ab8-44bd-bed9-2b24ffa0f19f';
UPDATE public.furniture_catalog SET gallery_sort_order = 210 WHERE kind = 'custom-2eafc893-f4b4-4820-984c-3b2b7bc39542';
UPDATE public.furniture_catalog SET gallery_sort_order = 220 WHERE kind = 'custom-02f04c51-341b-44de-a21d-75fea10170bb';
UPDATE public.furniture_catalog SET gallery_sort_order = 230 WHERE kind = 'custom-077f40e2-5cae-4092-aa9f-90356f60d792';
UPDATE public.furniture_catalog SET gallery_sort_order = 240 WHERE kind = 'custom-5ebf26ea-3377-4915-a51b-f4ffa7b4d261';
UPDATE public.furniture_catalog SET gallery_sort_order = 250 WHERE kind = 'custom-14886253-e6ec-4391-acea-e16168ec4f02';
UPDATE public.furniture_catalog SET gallery_sort_order = 260 WHERE kind = 'custom-8df0edfe-6df7-4bc5-969e-ebe23ece09fe';
UPDATE public.furniture_catalog SET gallery_sort_order = 270 WHERE kind = 'custom-fb5463d1-5342-4b5b-9901-c25b0e3fa626';
UPDATE public.furniture_catalog SET gallery_sort_order = 280 WHERE kind = 'custom-de1467cc-3768-4ef5-bd42-06fa7ad6aab1';
UPDATE public.furniture_catalog SET gallery_sort_order = 290 WHERE kind = 'custom-860cae28-61df-4465-a29e-1a4b67900810';
UPDATE public.furniture_catalog SET gallery_sort_order = 300 WHERE kind = 'custom-947b5264-541a-4920-8da1-644a9906468b';
UPDATE public.furniture_catalog SET gallery_sort_order = 310 WHERE kind = 'custom-e3595c92-d82f-4b73-b24c-bfbc2e8c4938';
UPDATE public.furniture_catalog SET gallery_sort_order = 320 WHERE kind = 'checklist-clock2';
UPDATE public.furniture_catalog SET gallery_sort_order = 330 WHERE kind = 'checklist-woodenclock';
UPDATE public.furniture_catalog SET gallery_sort_order = 340 WHERE kind = 'checklist-closetclothorganizer';
UPDATE public.furniture_catalog SET gallery_sort_order = 350 WHERE kind = 'custom-c7b751d6-e84e-49f3-b9e9-8010e10a989a';
-- Extras after Monitor
UPDATE public.furniture_catalog SET gallery_sort_order = 400 WHERE kind = 'checklist-largemirror';
UPDATE public.furniture_catalog SET gallery_sort_order = 410 WHERE kind = 'checklist-wallmirror';
UPDATE public.furniture_catalog SET gallery_sort_order = 420 WHERE kind = 'checklist-pan1';
UPDATE public.furniture_catalog SET gallery_sort_order = 430 WHERE kind = 'custom-a899f146-fd9b-4b28-8206-c7fe029575bb';

-- Hide from Add furniture gallery (still placeable from checklist).
UPDATE public.furniture_catalog SET show_in_gallery = false WHERE kind IN (
  'checklist-leaves',
  'checklist-desklamp',
  'checklist-fairlylights1',
  'checklist-led1',
  'checklist-smallmirror',
  'checklist-tallshelflamp',
  'checklist-talllamp1',
  'custom-fff23e14-b208-49b9-80e5-0c520df7976d'
);

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
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  lim int := greatest(1, least(coalesce(p_limit, 48), 100));
  off int := greatest(0, coalesce(p_offset, 0));
  src text := lower(coalesce(p_source, 'community'));
  srt text := lower(coalesce(p_sort, 'hot'));
  cats text[];
  q text := nullif(lower(trim(coalesce(p_query, ''))), '');
  uid uuid := (SELECT auth.uid());
  curated boolean := src = 'toova' AND srt = 'hot';
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

  SELECT ARRAY(
    SELECT DISTINCT lower(trim(x))
    FROM unnest(string_to_array(coalesce(p_category, ''), ',')) AS x
    WHERE nullif(trim(x), '') IS NOT NULL
  ) INTO cats;
  IF cats = '{}'::text[] THEN
    cats := NULL;
  END IF;
  IF cats IS NOT NULL AND EXISTS (
    SELECT 1 FROM unnest(cats) c
    WHERE NOT (c = ANY (public.catalog_valid_categories()))
  ) THEN
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
      fc.gallery_sort_order,
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
      AND (src = 'mine' OR fc.show_in_gallery)
      AND (cats IS NULL OR fc.categories @> cats)
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
    CASE WHEN curated THEN c.gallery_sort_order END ASC,
    CASE WHEN curated THEN c.kind END ASC,
    CASE WHEN NOT curated AND srt = 'hot' THEN c.hot_score END DESC NULLS LAST,
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
GRANT EXECUTE ON FUNCTION public.get_gallery_catalog(text, text, text, text, int, int)
  TO anon, authenticated;

CREATE OR REPLACE FUNCTION private.room_preview_items(p_room_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', ri.id,
        'kind', ri.kind,
        'pos_x', ri.pos_x,
        'pos_y', ri.pos_y,
        'pos_z', ri.pos_z,
        'rotation_y', ri.rotation_y,
        'size_w', ri.size_w,
        'size_h', ri.size_h,
        'size_d', ri.size_d,
        'model_url', ri.model_url,
        'silhouette_path', fc.silhouette_path
      )
      ORDER BY ri.sort_order
    ),
    '[]'::jsonb
  )
  FROM public.room_items ri
  LEFT JOIN public.furniture_catalog fc
    ON ri.kind = 'imported'
   AND NULLIF(trim(ri.model_url), '') IS NOT NULL
   AND NULLIF(trim(fc.model_url), '') = NULLIF(trim(ri.model_url), '')
  WHERE ri.room_id = p_room_id
    AND ri.kind IN (
      'bed', 'dresser', 'bookshelf', 'shelf', 'wardrobe', 'desk', 'chair', 'nightstand', 'lamp', 'imported'
    );
$$;

REVOKE ALL ON FUNCTION private.room_preview_items(uuid) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
