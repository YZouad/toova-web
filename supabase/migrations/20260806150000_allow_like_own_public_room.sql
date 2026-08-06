-- Allow liking any public room (including your own) so engagement works
-- when a creator is testing or when a profile has few outside viewers.

CREATE OR REPLACE FUNCTION public.toggle_room_like(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := (SELECT auth.uid());
  liked boolean;
  cnt bigint;
  target record;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT r.id, r.user_id, r.visibility, p.is_public
  INTO target
  FROM public.rooms r
  JOIN public.profiles p ON p.id = r.user_id
  WHERE r.id = p_room_id;

  IF target.id IS NULL
     OR target.visibility <> 'public'
     OR target.is_public IS NOT TRUE THEN
    RAISE EXCEPTION 'not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM set_config('app.toova_bypass_room_guards', '1', true);

  IF EXISTS (
    SELECT 1 FROM public.room_likes rl
    WHERE rl.user_id = uid AND rl.room_id = p_room_id
  ) THEN
    DELETE FROM public.room_likes
    WHERE user_id = uid AND room_id = p_room_id;
    liked := false;
  ELSE
    INSERT INTO public.room_likes (user_id, room_id) VALUES (uid, p_room_id);
    liked := true;
  END IF;

  SELECT count(*)::bigint INTO cnt
  FROM public.room_likes
  WHERE room_id = p_room_id;

  UPDATE public.rooms
  SET likes_count = cnt
  WHERE id = p_room_id;

  RETURN jsonb_build_object('liked', liked, 'likes_count', cnt);
END;
$$;

NOTIFY pgrst, 'reload schema';
