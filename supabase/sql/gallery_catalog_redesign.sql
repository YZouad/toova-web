-- Gallery catalog redesign: categories, created_at, RLS fixes, gallery query,
-- owner update/delete RPCs, and banned-word moderation.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.furniture_catalog
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS thumbnail_path text,
  ADD COLUMN IF NOT EXISTS usdz_path text,
  ADD COLUMN IF NOT EXISTS likes_count bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS downloads_count bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS views_count bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS categories text[] NOT NULL DEFAULT '{}'::text[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'furniture_catalog_visibility_check'
  ) THEN
    ALTER TABLE public.furniture_catalog
      ADD CONSTRAINT furniture_catalog_visibility_check
      CHECK (visibility IN ('private', 'unlisted', 'public'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Preset categories (max 3)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.catalog_valid_categories()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY[
    'seating',
    'tables',
    'beds',
    'storage',
    'desks_workspaces',
    'lighting',
    'rugs',
    'decor_art',
    'plants',
    'electronics',
    'appliances',
    'kitchen',
    'bathroom',
    'outdoor',
    'kids',
    'pets',
    'doors_windows',
    'other'
  ]::text[];
$$;

CREATE OR REPLACE FUNCTION public.normalize_catalog_categories(p_cats text[])
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  allowed text[] := public.catalog_valid_categories();
  out_cats text[] := '{}'::text[];
  c text;
  slug text;
BEGIN
  IF p_cats IS NULL THEN
    RETURN '{}'::text[];
  END IF;
  FOREACH c IN ARRAY p_cats LOOP
    slug := lower(trim(c));
    IF slug = '' THEN
      CONTINUE;
    END IF;
    IF NOT (slug = ANY (allowed)) THEN
      RAISE EXCEPTION 'invalid category' USING ERRCODE = '22023';
    END IF;
    IF NOT (slug = ANY (out_cats)) THEN
      out_cats := array_append(out_cats, slug);
    END IF;
  END LOOP;
  IF cardinality(out_cats) > 3 THEN
    RAISE EXCEPTION 'too many categories' USING ERRCODE = '22023';
  END IF;
  RETURN out_cats;
END;
$$;

CREATE OR REPLACE FUNCTION public.furniture_catalog_categories_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.categories := public.normalize_catalog_categories(NEW.categories);
  IF TG_OP = 'UPDATE'
     AND NEW.categories IS DISTINCT FROM OLD.categories
     AND NEW.is_builtin = false THEN
    -- Categories are set at create time only for user models.
    NEW.categories := OLD.categories;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_furniture_catalog_categories ON public.furniture_catalog;
CREATE TRIGGER trg_furniture_catalog_categories
  BEFORE INSERT OR UPDATE ON public.furniture_catalog
  FOR EACH ROW
  EXECUTE FUNCTION public.furniture_catalog_categories_guard();

-- Map recognizable legacy tags → preset categories (best-effort, max 3).
UPDATE public.furniture_catalog fc
SET categories = (
  SELECT COALESCE(
    (
      SELECT array_agg(slug ORDER BY slug)
      FROM (
        SELECT DISTINCT
          CASE
            WHEN lower(t) IN ('chair', 'seating', 'sofa', 'stool', 'bench') THEN 'seating'
            WHEN lower(t) IN ('table', 'tables', 'coffee table', 'dining') THEN 'tables'
            WHEN lower(t) IN ('bed', 'beds', 'bedroom', 'mattress') THEN 'beds'
            WHEN lower(t) IN ('storage', 'dresser', 'wardrobe', 'cabinet', 'shelf') THEN 'storage'
            WHEN lower(t) IN ('desk', 'office', 'workspace', 'work') THEN 'desks_workspaces'
            WHEN lower(t) IN ('lamp', 'light', 'lighting') THEN 'lighting'
            WHEN lower(t) IN ('rug', 'rugs', 'carpet') THEN 'rugs'
            WHEN lower(t) IN ('decor', 'art', 'poster', 'decoration') THEN 'decor_art'
            WHEN lower(t) IN ('plant', 'plants') THEN 'plants'
            WHEN lower(t) IN ('electronics', 'tv', 'monitor') THEN 'electronics'
            WHEN lower(t) IN ('appliance', 'appliances') THEN 'appliances'
            WHEN lower(t) IN ('kitchen') THEN 'kitchen'
            WHEN lower(t) IN ('bathroom', 'bath') THEN 'bathroom'
            WHEN lower(t) IN ('outdoor', 'patio') THEN 'outdoor'
            WHEN lower(t) IN ('kids', 'child') THEN 'kids'
            WHEN lower(t) IN ('pet', 'pets') THEN 'pets'
            WHEN lower(t) IN ('door', 'window', 'doors', 'windows') THEN 'doors_windows'
            ELSE NULL
          END AS slug
        FROM unnest(COALESCE(fc.tags, '{}'::text[])) AS t
      ) mapped
      WHERE slug IS NOT NULL
      LIMIT 3
    ),
    '{}'::text[]
  )
)
WHERE cardinality(fc.categories) = 0
  AND cardinality(COALESCE(fc.tags, '{}'::text[])) > 0;

-- Seed / sync Toova builtins with categories.
UPDATE public.furniture_catalog SET categories = ARRAY['beds'] WHERE kind = 'bed' AND is_builtin;
UPDATE public.furniture_catalog SET categories = ARRAY['storage'] WHERE kind IN ('dresser', 'bookshelf', 'wardrobe') AND is_builtin;
UPDATE public.furniture_catalog SET categories = ARRAY['desks_workspaces'] WHERE kind = 'desk' AND is_builtin;
UPDATE public.furniture_catalog SET categories = ARRAY['seating'] WHERE kind = 'chair' AND is_builtin;
UPDATE public.furniture_catalog SET categories = ARRAY['storage', 'beds'] WHERE kind = 'nightstand' AND is_builtin;
UPDATE public.furniture_catalog SET categories = ARRAY['lighting'] WHERE kind = 'lamp' AND is_builtin;

INSERT INTO public.furniture_catalog (
  kind, label, width_in, height_in, depth_in, clearance_in, is_builtin, model_url, tags, categories, visibility
) VALUES
  ('lamp', 'Lamp', 10, 22, 10, null, true, null, '{}'::text[], ARRAY['lighting'], 'public'),
  ('bookshelf', 'Bookshelf', 30, 32, 18, null, true, null, '{}'::text[], ARRAY['storage'], 'public')
ON CONFLICT (kind) DO UPDATE
  SET label = EXCLUDED.label,
      width_in = EXCLUDED.width_in,
      height_in = EXCLUDED.height_in,
      depth_in = EXCLUDED.depth_in,
      categories = EXCLUDED.categories,
      is_builtin = true,
      visibility = 'public';

UPDATE public.furniture_catalog
SET visibility = 'public'
WHERE is_builtin = true;

-- ---------------------------------------------------------------------------
-- 3) Banned-word moderation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.catalog_banned_words()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY[
    'fuck','fucker','fucking','shit','bullshit','asshole','bitch','bastard','damn','dammit',
    'cunt','cock','dick','piss','pussy','slut','whore','fag','faggot','dyke','tranny',
    'nigger','nigga','retard','retarded','kike','spic','chink','gook','wetback','rape','rapist'
  ]::text[];
$$;

CREATE OR REPLACE FUNCTION public.normalize_for_profanity(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(regexp_replace(coalesce(p_text, ''), '[^a-z0-9]+', '', 'gi'));
$$;

CREATE OR REPLACE FUNCTION public.contains_banned_words(p_text text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  norm text := public.normalize_for_profanity(p_text);
  w text;
BEGIN
  IF norm IS NULL OR norm = '' THEN
    RETURN false;
  END IF;
  FOREACH w IN ARRAY public.catalog_banned_words() LOOP
    IF position(w IN norm) > 0 THEN
      RETURN true;
    END IF;
  END LOOP;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_catalog_text_clean(p_label text, p_description text, p_tags text[] DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  t text;
BEGIN
  IF public.contains_banned_words(p_label) OR public.contains_banned_words(p_description) THEN
    RAISE EXCEPTION 'Please remove inappropriate language.' USING ERRCODE = '22023';
  END IF;
  IF p_tags IS NOT NULL THEN
    FOREACH t IN ARRAY p_tags LOOP
      IF public.contains_banned_words(t) THEN
        RAISE EXCEPTION 'Please remove inappropriate language.' USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.furniture_catalog_profanity_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_builtin THEN
    RETURN NEW;
  END IF;
  PERFORM public.assert_catalog_text_clean(NEW.label, NEW.description, NEW.tags);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_furniture_catalog_profanity ON public.furniture_catalog;
CREATE TRIGGER trg_furniture_catalog_profanity
  BEFORE INSERT OR UPDATE OF label, description, tags ON public.furniture_catalog
  FOR EACH ROW
  EXECUTE FUNCTION public.furniture_catalog_profanity_guard();

-- ---------------------------------------------------------------------------
-- 4) Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_furniture_catalog_visibility
  ON public.furniture_catalog (visibility)
  WHERE visibility = 'public';

CREATE INDEX IF NOT EXISTS idx_furniture_catalog_created_at
  ON public.furniture_catalog (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_furniture_catalog_likes
  ON public.furniture_catalog (likes_count DESC);

CREATE INDEX IF NOT EXISTS idx_furniture_catalog_downloads
  ON public.furniture_catalog (downloads_count DESC);

CREATE INDEX IF NOT EXISTS idx_furniture_catalog_views
  ON public.furniture_catalog (views_count DESC);

CREATE INDEX IF NOT EXISTS idx_furniture_catalog_user_created
  ON public.furniture_catalog (user_id, created_at DESC)
  WHERE is_builtin = false;

CREATE INDEX IF NOT EXISTS idx_furniture_catalog_categories_gin
  ON public.furniture_catalog USING gin (categories);

CREATE INDEX IF NOT EXISTS idx_furniture_catalog_is_builtin
  ON public.furniture_catalog (is_builtin)
  WHERE is_builtin = true;

-- ---------------------------------------------------------------------------
-- 5) RLS: authenticated can read public (+ own + builtins)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS catalog_select ON public.furniture_catalog;
CREATE POLICY catalog_select ON public.furniture_catalog
  FOR SELECT
  TO authenticated
  USING (
    is_builtin
    OR user_id = (SELECT auth.uid())
    OR visibility = 'public'
  );

DROP POLICY IF EXISTS catalog_select_anon_public ON public.furniture_catalog;
CREATE POLICY catalog_select_anon_public ON public.furniture_catalog
  FOR SELECT
  TO anon
  USING (visibility = 'public' OR is_builtin);

-- Owner update (label/description/visibility only via RPC preferred; allow UPDATE for own rows)
DROP POLICY IF EXISTS catalog_update_owner ON public.furniture_catalog;
CREATE POLICY catalog_update_owner ON public.furniture_catalog
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()) AND is_builtin = false)
  WITH CHECK (user_id = (SELECT auth.uid()) AND is_builtin = false);

DROP POLICY IF EXISTS catalog_delete_owner ON public.furniture_catalog;
CREATE POLICY catalog_delete_owner ON public.furniture_catalog
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()) AND is_builtin = false);

GRANT UPDATE, DELETE ON TABLE public.furniture_catalog TO authenticated;

-- ---------------------------------------------------------------------------
-- 6) Hot score helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.catalog_hot_score(
  p_likes bigint,
  p_downloads bigint,
  p_views bigint,
  p_created_at timestamptz
)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (
    coalesce(p_likes, 0)::double precision * 4.0
    + coalesce(p_downloads, 0)::double precision * 3.0
    + coalesce(p_views, 0)::double precision * 0.1
  ) / power(
    greatest(1.0, extract(epoch from (now() - coalesce(p_created_at, now()))) / 86400.0 + 2.0),
    1.2
  );
$$;

-- ---------------------------------------------------------------------------
-- 7) Gallery browse RPC
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 8) Owner update / delete RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_catalog_model(
  p_kind text,
  p_label text DEFAULT NULL,
  p_description text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := (SELECT auth.uid());
  next_label text;
  next_desc text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT
    CASE WHEN p_label IS NULL THEN fc.label ELSE trim(p_label) END,
    CASE WHEN p_description IS NULL THEN fc.description ELSE nullif(trim(p_description), '') END
  INTO next_label, next_desc
  FROM public.furniture_catalog fc
  WHERE fc.kind = p_kind AND fc.user_id = uid AND fc.is_builtin = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF next_label IS NULL OR char_length(next_label) < 1 OR char_length(next_label) > 80 THEN
    RAISE EXCEPTION 'invalid label' USING ERRCODE = '22023';
  END IF;
  IF next_desc IS NOT NULL AND char_length(next_desc) > 500 THEN
    RAISE EXCEPTION 'invalid description' USING ERRCODE = '22023';
  END IF;

  PERFORM public.assert_catalog_text_clean(next_label, next_desc, NULL);

  UPDATE public.furniture_catalog
  SET label = next_label,
      description = next_desc
  WHERE kind = p_kind AND user_id = uid AND is_builtin = false;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_catalog_model(p_kind text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := (SELECT auth.uid());
  row_model text;
  row_thumb text;
  row_sil text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT model_url, thumbnail_path, silhouette_path
  INTO row_model, row_thumb, row_sil
  FROM public.furniture_catalog
  WHERE kind = p_kind AND user_id = uid AND is_builtin = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.furniture_catalog
  WHERE kind = p_kind AND user_id = uid AND is_builtin = false;

  RETURN jsonb_build_object(
    'model_url', row_model,
    'thumbnail_path', row_thumb,
    'silhouette_path', row_sil
  );
END;
$$;

-- Tighten set_catalog_visibility: public requires public profile
CREATE OR REPLACE FUNCTION public.set_catalog_visibility(p_kind text, p_visibility text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := (SELECT auth.uid());
  profile_public boolean;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_visibility IS NULL OR p_visibility NOT IN ('private', 'unlisted', 'public') THEN
    RAISE EXCEPTION 'invalid visibility' USING ERRCODE = '22023';
  END IF;

  IF p_visibility = 'public' THEN
    SELECT is_public INTO profile_public FROM public.profiles WHERE id = uid;
    IF coalesce(profile_public, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'Make your profile public before listing models in the gallery.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.furniture_catalog
  SET visibility = p_visibility
  WHERE kind = p_kind
    AND user_id = uid
    AND is_builtin = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_catalog_model(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_catalog_model(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_catalog_model(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_catalog_model(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_catalog_visibility(text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 9) Profile page: include public models
-- ---------------------------------------------------------------------------
-- Extend get_profile_page if it exists — wrap safely.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_profile_page'
  ) THEN
    -- Redefined below outside DO if needed; marker only.
    NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_profile_catalog_models(p_handle text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := (SELECT auth.uid());
  target public.profiles%ROWTYPE;
  is_owner boolean;
  result jsonb;
BEGIN
  SELECT * INTO target
  FROM public.profiles
  WHERE lower(handle) = lower(p_handle)
     OR id IN (
       SELECT profile_id FROM public.profile_handle_aliases
       WHERE lower(handle) = lower(p_handle)
     )
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  is_owner := (uid IS NOT NULL AND uid = target.id);

  IF NOT is_owner AND NOT target.is_public THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.created_at DESC), '[]'::jsonb)
  INTO result
  FROM (
    SELECT
      fc.kind,
      fc.label,
      fc.description,
      fc.categories,
      fc.tags,
      fc.width_in,
      fc.height_in,
      fc.depth_in,
      fc.thumbnail_path,
      fc.model_url,
      fc.visibility,
      fc.likes_count,
      fc.downloads_count,
      fc.views_count,
      fc.created_at
    FROM public.furniture_catalog fc
    WHERE fc.user_id = target.id
      AND fc.is_builtin = false
      AND (is_owner OR fc.visibility = 'public')
    ORDER BY fc.created_at DESC
    LIMIT 100
  ) x;

  RETURN jsonb_build_object(
    'is_owner', is_owner,
    'models', result
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_profile_catalog_models(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profile_catalog_models(text) TO anon, authenticated;

COMMIT;
