-- Checklist adds KPI: count consent-gated events instead of user_shopping_list inserts
-- (room rebuilds after checklist sync would inflate row counts).

DO $$
DECLARE
  def text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'analytics_admin_dashboard';

  IF def IS NOT NULL THEN
    def := replace(
      def,
      '(SELECT count(*) FROM public.user_shopping_list WHERE created_at >= v_from AND created_at < v_to)',
      '(SELECT count(*) FROM public.analytics_events WHERE name = ''checklist_item_added'' AND occurred_at >= v_from AND occurred_at < v_to)'
    );
    def := replace(
      def,
      '(SELECT count(*) FROM public.user_shopping_list WHERE created_at >= v_prev_from AND created_at < v_prev_to)',
      '(SELECT count(*) FROM public.analytics_events WHERE name = ''checklist_item_added'' AND occurred_at >= v_prev_from AND occurred_at < v_prev_to)'
    );
    EXECUTE def;
  END IF;
END $$;

DO $$
DECLARE
  def text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'analytics_user_summary';

  IF def IS NOT NULL THEN
    def := replace(
      def,
      '''checklist_adds'', (SELECT count(*) FROM public.user_shopping_list WHERE user_id = p_user_id AND created_at >= v_from AND created_at < v_to)',
      '''checklist_adds'', (SELECT count(*) FROM public.analytics_events WHERE user_id = p_user_id AND name = ''checklist_item_added'' AND occurred_at >= v_from AND occurred_at < v_to)'
    );
    EXECUTE def;
  END IF;
END $$;