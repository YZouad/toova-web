-- Bed frame finishes (and dedicated furniture wraps) without overloading bedding columns.

ALTER TABLE public.room_items
  ADD COLUMN IF NOT EXISTS tint_color text,
  ADD COLUMN IF NOT EXISTS finish_texture_path text,
  ADD COLUMN IF NOT EXISTS mattress_color text;

CREATE OR REPLACE FUNCTION public.has_public_room_asset(p_object_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.room_items ri
    JOIN public.rooms r ON r.id = ri.room_id
    JOIN public.profiles p ON p.id = r.user_id
    WHERE r.visibility = 'public'
      AND p.is_public = true
      AND (
        NULLIF(trim(ri.model_url), '') = p_object_path
        OR NULLIF(trim(ri.blanket_texture_path), '') = p_object_path
        OR NULLIF(trim(ri.finish_texture_path), '') = p_object_path
      )
      AND p_object_path !~* '^https?://'
      AND p_object_path !~* '^blob:'
  );
$$;

CREATE OR REPLACE FUNCTION public._grant_share_assets(p_token text, p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  exp timestamptz := now() + interval '1 hour';
BEGIN
  DELETE FROM public.share_asset_grants
  WHERE token = p_token;

  INSERT INTO public.share_asset_grants (object_path, room_id, token, expires_at)
  SELECT DISTINCT path, p_room_id, p_token, exp
  FROM (
    SELECT NULLIF(trim(ri.model_url), '') AS path
    FROM public.room_items ri
    WHERE ri.room_id = p_room_id
    UNION
    SELECT NULLIF(trim(ri.blanket_texture_path), '') AS path
    FROM public.room_items ri
    WHERE ri.room_id = p_room_id
    UNION
    SELECT NULLIF(trim(ri.finish_texture_path), '') AS path
    FROM public.room_items ri
    WHERE ri.room_id = p_room_id
    UNION
    SELECT NULLIF(trim(r.thumbnail_path), '') AS path
    FROM public.rooms r
    WHERE r.id = p_room_id
  ) paths
  WHERE path IS NOT NULL
    AND path !~* '^https?://'
    AND path !~* '^blob:';
END;
$$;

REVOKE ALL ON FUNCTION public._grant_share_assets(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._grant_share_assets(text, uuid) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION private.copy_room_as_fork(
  p_source_id uuid,
  p_uid uuid,
  p_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  room_row public.rooms%ROWTYPE;
  new_id uuid;
  room_count int;
  copy_name text;
  max_rooms constant int := 5;
BEGIN
  SELECT * INTO room_row FROM public.rooms WHERE id = p_source_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'room not found'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT COUNT(*)::int INTO room_count FROM public.rooms WHERE user_id = p_uid;
  IF room_count >= max_rooms AND NOT public.has_unlimited_rooms(p_uid) THEN
    RAISE EXCEPTION 'room limit reached (% rooms)', max_rooms
      USING ERRCODE = 'P0001';
  END IF;

  copy_name := COALESCE(NULLIF(trim(p_name), ''), room_row.name || ' (copy)');

  PERFORM set_config('app.toova_bypass_room_guards', '1', true);

  INSERT INTO public.rooms (
    user_id, name, environment, room_geometry, forked_from, visibility, fork_count
  )
  VALUES (
    p_uid,
    copy_name,
    room_row.environment,
    room_row.room_geometry,
    room_row.id,
    'private',
    0
  )
  RETURNING id INTO new_id;

  INSERT INTO public.room_items (
    room_id, kind, label,
    pos_x, pos_y, pos_z, rotation_y,
    size_w, size_h, size_d,
    bed_leg_height, natural_w, natural_h, natural_d,
    sort_order, model_url,
    bedding_enabled, blanket_color, blanket_texture_path,
    tint_color, finish_texture_path, mattress_color,
    bedding_config,
    emitter, curated_product_id,
    instance_key, hanging_config
  )
  SELECT
    new_id, kind, label,
    pos_x, pos_y, pos_z, rotation_y,
    size_w, size_h, size_d,
    bed_leg_height, natural_w, natural_h, natural_d,
    sort_order, model_url,
    bedding_enabled, blanket_color, blanket_texture_path,
    tint_color, finish_texture_path, mattress_color,
    bedding_config,
    emitter, curated_product_id,
    instance_key, hanging_config
  FROM public.room_items
  WHERE room_id = room_row.id
  ORDER BY sort_order;

  UPDATE public.rooms
  SET fork_count = fork_count + 1
  WHERE id = room_row.id;

  RETURN new_id;
END;
$$;
