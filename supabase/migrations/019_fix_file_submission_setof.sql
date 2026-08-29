-- Drop old function signature and recreate returning SETOF public.submissions
DROP FUNCTION IF EXISTS create_file_submission(UUID, UUID, TEXT, TEXT, TEXT, BIGINT, BOOLEAN);

CREATE OR REPLACE FUNCTION create_file_submission(
  p_delivery_id UUID,
  p_user_id UUID,
  p_object_key TEXT,
  p_file_name TEXT,
  p_mime_type TEXT,
  p_file_size BIGINT,
  p_is_late BOOLEAN
)
RETURNS SETOF public.submissions AS $$
BEGIN
  -- Lock row for concurrency safety
  PERFORM 1 FROM public.assignment_deliveries ad WHERE ad.id = p_delivery_id FOR SHARE;

  RETURN QUERY
  SELECT s.*
  FROM public.submissions s
  WHERE s.object_key = p_object_key;

  IF FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  INSERT INTO public.submissions (
    delivery_id, user_id, object_key, file_name, mime_type, file_size, is_late, is_latest, status
  ) VALUES (
    p_delivery_id, p_user_id, p_object_key, p_file_name, p_mime_type, p_file_size, p_is_late, TRUE, 'submitted'
  )
  RETURNING *;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
