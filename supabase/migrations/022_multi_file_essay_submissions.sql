CREATE TABLE IF NOT EXISTS public.submission_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 100),
  mime_type TEXT NOT NULL,
  file_size BIGINT NOT NULL CHECK (file_size > 0),
  sort_order SMALLINT NOT NULL CHECK (sort_order BETWEEN 0 AND 4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (submission_id, sort_order)
);

CREATE TABLE IF NOT EXISTS public.submission_upload_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES public.assignment_deliveries(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'uploading'
    CHECK (status IN ('uploading', 'confirming', 'confirmed', 'cancelled', 'expired', 'cleanup_pending')),
  expected_file_count SMALLINT NOT NULL CHECK (expected_file_count BETWEEN 1 AND 5),
  expires_at TIMESTAMPTZ NOT NULL,
  confirmed_submission_id UUID REFERENCES public.submissions(id) ON DELETE SET NULL,
  cleanup_reason TEXT
    CHECK (cleanup_reason IN ('cancelled', 'expired', 'upload_failed', 'confirm_failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.submission_upload_session_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.submission_upload_sessions(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 100),
  mime_type TEXT NOT NULL,
  declared_size BIGINT NOT NULL CHECK (declared_size > 0),
  file_size BIGINT CHECK (file_size > 0),
  sort_order SMALLINT NOT NULL CHECK (sort_order BETWEEN 0 AND 4),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'uploaded', 'cleanup_pending', 'cleaned')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, sort_order),
  UNIQUE (session_id, file_name)
);

CREATE INDEX IF NOT EXISTS idx_submission_files_submission_order
  ON public.submission_files(submission_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_submission_upload_sessions_cleanup
  ON public.submission_upload_sessions(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_submission_upload_session_files_status
  ON public.submission_upload_session_files(session_id, status, sort_order);

ALTER TABLE public.submission_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_upload_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_upload_session_files ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.submission_files FROM anon, authenticated;
REVOKE ALL ON TABLE public.submission_upload_sessions FROM anon, authenticated;
REVOKE ALL ON TABLE public.submission_upload_session_files FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.submission_files TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.submission_upload_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.submission_upload_session_files TO service_role;

CREATE OR REPLACE FUNCTION public.confirm_multi_file_submission(
  p_session_id UUID,
  p_user_id UUID,
  p_assignment_id UUID,
  p_max_score NUMERIC,
  p_is_late BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_session public.submission_upload_sessions%ROWTYPE;
  v_delivery public.assignment_deliveries%ROWTYPE;
  v_first_file public.submission_upload_session_files%ROWTYPE;
  v_submission public.submissions%ROWTYPE;
  v_uploaded_count INTEGER;
  v_total_count INTEGER;
  v_submission_count INTEGER;
BEGIN
  SELECT * INTO v_session
  FROM public.submission_upload_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'UPLOAD_SESSION_NOT_FOUND';
  END IF;
  IF v_session.user_id <> p_user_id THEN
    RAISE EXCEPTION 'UPLOAD_SESSION_FORBIDDEN';
  END IF;

  IF v_session.status = 'confirmed' AND v_session.confirmed_submission_id IS NOT NULL THEN
    SELECT * INTO v_submission
    FROM public.submissions
    WHERE id = v_session.confirmed_submission_id;
    RETURN jsonb_build_object('submission', to_jsonb(v_submission), 'created', FALSE);
  END IF;

  IF v_session.status <> 'uploading' THEN
    RAISE EXCEPTION 'UPLOAD_SESSION_INVALID_STATE';
  END IF;
  IF v_session.expires_at <= NOW() THEN
    RAISE EXCEPTION 'UPLOAD_SESSION_EXPIRED';
  END IF;

  SELECT * INTO v_delivery
  FROM public.assignment_deliveries
  WHERE id = v_session.delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DELIVERY_NOT_FOUND';
  END IF;
  IF p_assignment_id IS DISTINCT FROM v_delivery.assignment_id
     AND p_assignment_id IS DISTINCT FROM v_delivery.library_assignment_id THEN
    RAISE EXCEPTION 'ASSIGNMENT_MISMATCH';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_session.delivery_id::TEXT || ':' || p_user_id::TEXT, 0)
  );

  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'uploaded')
  INTO v_total_count, v_uploaded_count
  FROM public.submission_upload_session_files
  WHERE session_id = p_session_id;

  IF v_total_count <> v_session.expected_file_count
     OR v_uploaded_count <> v_session.expected_file_count
     OR v_uploaded_count NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'UPLOAD_SESSION_INCOMPLETE';
  END IF;

  IF v_delivery.max_submissions IS NOT NULL THEN
    SELECT COUNT(*) INTO v_submission_count
    FROM public.submissions
    WHERE delivery_id = v_session.delivery_id
      AND user_id = p_user_id
      AND object_key IS NOT NULL;
    IF v_submission_count >= v_delivery.max_submissions THEN
      RAISE EXCEPTION 'MAX_SUBMISSIONS_EXCEEDED';
    END IF;
  END IF;

  UPDATE public.submission_upload_sessions
  SET status = 'confirming', updated_at = NOW()
  WHERE id = p_session_id;

  SELECT * INTO v_first_file
  FROM public.submission_upload_session_files
  WHERE session_id = p_session_id AND status = 'uploaded'
  ORDER BY sort_order
  LIMIT 1;

  UPDATE public.submissions
  SET is_latest = FALSE
  WHERE delivery_id = v_session.delivery_id
    AND user_id = p_user_id
    AND object_key IS NOT NULL
    AND is_latest = TRUE;

  INSERT INTO public.submissions (
    delivery_id, user_id, assignment_id, object_key, file_name, mime_type,
    file_size, is_late, is_latest, status, max_score
  ) VALUES (
    v_session.delivery_id, p_user_id, p_assignment_id, v_first_file.object_key,
    v_first_file.file_name, v_first_file.mime_type, v_first_file.file_size,
    COALESCE(p_is_late, FALSE), TRUE, 'submitted', ROUND(COALESCE(p_max_score, 0))::INTEGER
  )
  RETURNING * INTO v_submission;

  INSERT INTO public.submission_files (
    submission_id, object_key, file_name, mime_type, file_size, sort_order
  )
  SELECT v_submission.id, object_key, file_name, mime_type, file_size, sort_order
  FROM public.submission_upload_session_files
  WHERE session_id = p_session_id AND status = 'uploaded'
  ORDER BY sort_order;

  UPDATE public.submission_upload_sessions
  SET status = 'confirmed', confirmed_submission_id = v_submission.id,
      cleanup_reason = NULL, updated_at = NOW()
  WHERE id = p_session_id;

  RETURN jsonb_build_object('submission', to_jsonb(v_submission), 'created', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_multi_file_submission(UUID, UUID, UUID, NUMERIC, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_multi_file_submission(UUID, UUID, UUID, NUMERIC, BOOLEAN)
  TO service_role;
