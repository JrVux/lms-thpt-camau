-- Fix PL/pgSQL parameter ambiguity in create_file_submission function
CREATE OR REPLACE FUNCTION create_file_submission(
  p_delivery_id UUID,
  p_user_id UUID,
  p_object_key TEXT,
  p_file_name TEXT,
  p_mime_type TEXT,
  p_file_size BIGINT,
  p_is_late BOOLEAN
)
RETURNS TABLE (
  id UUID,
  delivery_id UUID,
  user_id UUID,
  object_key TEXT,
  file_name TEXT,
  mime_type TEXT,
  file_size BIGINT,
  submitted_at TIMESTAMPTZ,
  is_late BOOLEAN,
  is_latest BOOLEAN,
  score NUMERIC,
  feedback TEXT,
  graded_at TIMESTAMPTZ,
  graded_by UUID
) AS $$
DECLARE
  v_existing RECORD;
  v_inserted RECORD;
BEGIN
  -- Lock row for concurrency safety with explicit alias ad.id
  PERFORM 1 FROM public.assignment_deliveries ad WHERE ad.id = p_delivery_id FOR SHARE;

  SELECT s.id, s.delivery_id, s.user_id, s.object_key, s.file_name, s.mime_type,
         s.file_size, s.submitted_at, s.is_late, s.is_latest, s.score, s.feedback,
         s.graded_at, s.graded_by
  INTO v_existing
  FROM public.submissions s
  WHERE s.object_key = p_object_key;

  IF FOUND THEN
    RETURN QUERY SELECT v_existing.id, v_existing.delivery_id, v_existing.user_id,
                        v_existing.object_key, v_existing.file_name, v_existing.mime_type,
                        v_existing.file_size, v_existing.submitted_at, v_existing.is_late,
                        v_existing.is_latest, v_existing.score, v_existing.feedback,
                        v_existing.graded_at, v_existing.graded_by;
    RETURN;
  END IF;

  INSERT INTO public.submissions (
    delivery_id, user_id, object_key, file_name, mime_type, file_size, is_late, is_latest, status
  ) VALUES (
    p_delivery_id, p_user_id, p_object_key, p_file_name, p_mime_type, p_file_size, p_is_late, TRUE, 'submitted'
  )
  RETURNING submissions.id, submissions.delivery_id, submissions.user_id, submissions.object_key, submissions.file_name, submissions.mime_type,
            submissions.file_size, submissions.submitted_at, submissions.is_late, submissions.is_latest, submissions.score, submissions.feedback,
            submissions.graded_at, submissions.graded_by
  INTO v_inserted;

  RETURN QUERY SELECT v_inserted.id, v_inserted.delivery_id, v_inserted.user_id,
                      v_inserted.object_key, v_inserted.file_name, v_inserted.mime_type,
                      v_inserted.file_size, v_inserted.submitted_at, v_inserted.is_late,
                      v_inserted.is_latest, v_inserted.score, v_inserted.feedback,
                      v_inserted.graded_at, v_inserted.graded_by;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
