-- Featured gallery rooms + weekly theme for habit / social engagement.

CREATE TABLE IF NOT EXISTS public.gallery_featured_rooms (
  room_id uuid PRIMARY KEY REFERENCES public.rooms (id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gallery_weekly_themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  body text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gallery_weekly_themes_range_chk CHECK (ends_at > starts_at)
);

ALTER TABLE public.gallery_featured_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_weekly_themes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gallery_featured_rooms_read ON public.gallery_featured_rooms;
CREATE POLICY gallery_featured_rooms_read ON public.gallery_featured_rooms
  FOR SELECT TO anon, authenticated
  USING (
    starts_at <= now()
    AND (ends_at IS NULL OR ends_at > now())
  );

DROP POLICY IF EXISTS gallery_weekly_themes_read ON public.gallery_weekly_themes;
CREATE POLICY gallery_weekly_themes_read ON public.gallery_weekly_themes
  FOR SELECT TO anon, authenticated
  USING (starts_at <= now() AND ends_at > now());

GRANT SELECT ON public.gallery_featured_rooms TO anon, authenticated;
GRANT SELECT ON public.gallery_weekly_themes TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_gallery_home(
  p_room_limit int DEFAULT 12,
  p_model_limit int DEFAULT 12
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rlim int := greatest(1, least(coalesce(p_room_limit, 12), 24));
  mlim int := greatest(1, least(coalesce(p_model_limit, 12), 24));
  result jsonb := '{}'::jsonb;
  theme jsonb;
BEGIN
  SELECT to_jsonb(t) INTO theme
  FROM public.gallery_weekly_themes AS t
  WHERE t.starts_at <= now()
    AND t.ends_at > now()
  ORDER BY t.starts_at DESC
  LIMIT 1;

  result := result || jsonb_build_object(
    'weekly_theme', theme,
    'rooms_featured',
    COALESCE((
      SELECT jsonb_agg(to_jsonb(x) - 'total_count')
      FROM (
        SELECT gr.*
        FROM public.gallery_featured_rooms AS f
        JOIN LATERAL (
          SELECT *
          FROM public.get_gallery_rooms('newest', NULL, 200, 0) AS g
          WHERE g.room_id = f.room_id
          LIMIT 1
        ) AS gr ON true
        WHERE f.starts_at <= now()
          AND (f.ends_at IS NULL OR f.ends_at > now())
        ORDER BY f.sort_order ASC, gr.published_at DESC NULLS LAST
        LIMIT rlim
      ) AS x
    ), '[]'::jsonb),
    'rooms_hot',
    COALESCE((
      SELECT jsonb_agg(to_jsonb(x) - 'total_count')
      FROM public.get_gallery_rooms('hot', NULL, rlim, 0) x
    ), '[]'::jsonb),
    'rooms_likes',
    COALESCE((
      SELECT jsonb_agg(to_jsonb(x) - 'total_count')
      FROM public.get_gallery_rooms('likes', NULL, rlim, 0) x
    ), '[]'::jsonb),
    'models_hot',
    COALESCE((
      SELECT jsonb_agg(to_jsonb(x) - 'total_count')
      FROM public.get_gallery_catalog('community', 'hot', NULL, NULL, mlim, 0) x
    ), '[]'::jsonb),
    'models_likes',
    COALESCE((
      SELECT jsonb_agg(to_jsonb(x) - 'total_count')
      FROM public.get_gallery_catalog('community', 'likes', NULL, NULL, mlim, 0) x
    ), '[]'::jsonb)
  );

  RETURN result;
END;
$$;

INSERT INTO public.gallery_weekly_themes (slug, title, body, starts_at, ends_at)
VALUES (
  'small-dorm-big-storage-' || to_char(now(), 'IYYY-IW'),
  'Small dorm, big storage',
  'Design a compact room that still has a place for everything. Publish your take and remix others.',
  date_trunc('week', now()),
  date_trunc('week', now()) + interval '7 days'
)
ON CONFLICT (slug) DO NOTHING;
