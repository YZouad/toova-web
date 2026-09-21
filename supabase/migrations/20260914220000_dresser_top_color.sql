-- Independent dresser top color, separate from the furniture base tint.

ALTER TABLE public.room_items
  ADD COLUMN IF NOT EXISTS top_color text;

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
    tint_color, finish_texture_path, mattress_color, top_color,
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
    tint_color, finish_texture_path, mattress_color, top_color,
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
