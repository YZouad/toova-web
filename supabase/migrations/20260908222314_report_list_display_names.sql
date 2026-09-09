-- Include model / room labels and profile names on admin report rows.

CREATE OR REPLACE FUNCTION public.admin_list_content_reports(
  p_status text DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  rows jsonb;
  total bigint;
BEGIN
  IF uid IS NULL OR NOT public.is_admin(uid) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO total
  FROM public.content_reports cr
  WHERE (p_status IS NULL OR cr.status = p_status)
    AND (p_reason IS NULL OR cr.reason = p_reason);

  SELECT coalesce(jsonb_agg(row_data ORDER BY sort_priority, created_at DESC), '[]'::jsonb)
  INTO rows
  FROM (
    SELECT
      jsonb_build_object(
        'id', cr.id,
        'created_at', cr.created_at,
        'reporter_id', cr.reporter_id,
        'reporter_email', cr.reporter_email,
        'reporter_handle', reporter.handle,
        'reporter_display_name', reporter.display_name,
        'target_type', cr.target_type,
        'target_id', cr.target_id,
        'target_label', coalesce(
          nullif(btrim(cr.evidence->>'label'), ''),
          nullif(btrim(cr.evidence->>'name'), ''),
          nullif(btrim(cr.evidence->>'display_name'), ''),
          CASE
            WHEN nullif(btrim(cr.evidence->>'handle'), '') IS NOT NULL
              THEN '@' || btrim(cr.evidence->>'handle')
            ELSE NULL
          END,
          fc.label,
          rm.name,
          CASE
            WHEN cr.target_type IN ('profile', 'avatar') THEN coalesce(
              CASE WHEN owner.handle IS NOT NULL THEN '@' || owner.handle END,
              owner.display_name
            )
            ELSE NULL
          END
        ),
        'target_owner_id', cr.target_owner_id,
        'owner_handle', owner.handle,
        'owner_display_name', owner.display_name,
        'reason', cr.reason,
        'details', cr.details,
        'status', cr.status,
        'evidence', cr.evidence,
        'reviewed_by', cr.reviewed_by,
        'reviewed_at', cr.reviewed_at,
        'resolution_note', cr.resolution_note,
        'ncmec_report_id', cr.ncmec_report_id,
        'ncmec_reported_at', cr.ncmec_reported_at,
        'preserve_until', cr.preserve_until
      ) AS row_data,
      CASE WHEN cr.reason IN ('csam', 'sexual_content') THEN 0 ELSE 1 END AS sort_priority,
      cr.created_at
    FROM public.content_reports cr
    LEFT JOIN public.profiles reporter ON reporter.id = cr.reporter_id
    LEFT JOIN public.profiles owner ON owner.id = cr.target_owner_id
    LEFT JOIN public.furniture_catalog fc
      ON cr.target_type = 'catalog_model' AND fc.kind = cr.target_id
    LEFT JOIN public.rooms rm
      ON cr.target_type = 'room'
     AND rm.id::text = cr.target_id
    WHERE (p_status IS NULL OR cr.status = p_status)
      AND (p_reason IS NULL OR cr.reason = p_reason)
    ORDER BY sort_priority, cr.created_at DESC
    LIMIT greatest(1, least(coalesce(p_limit, 50), 200))
    OFFSET greatest(0, coalesce(p_offset, 0))
  ) sub;

  RETURN jsonb_build_object('total', total, 'reports', rows);
END;
$$;

NOTIFY pgrst, 'reload schema';
