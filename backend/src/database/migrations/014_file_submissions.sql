ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS submission_type TEXT NOT NULL DEFAULT 'autograde',
  ADD COLUMN IF NOT EXISTS essay_content TEXT,
  ADD COLUMN IF NOT EXISTS allowed_mime_types TEXT[] NOT NULL DEFAULT ARRAY[
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg', 'image/png', 'image/webp'
  ],
  ADD COLUMN IF NOT EXISTS max_file_size_mb INTEGER NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS allow_late_submission BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_assignments_submission_type'
  ) THEN
    ALTER TABLE public.assignments
      ADD CONSTRAINT check_assignments_submission_type
      CHECK (submission_type IN ('autograde', 'practice_file', 'essay'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_assignments_max_file_size_mb'
  ) THEN
    ALTER TABLE public.assignments
      ADD CONSTRAINT check_assignments_max_file_size_mb
      CHECK (max_file_size_mb BETWEEN 1 AND 100);
  END IF;
END $$;

ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS object_key TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS file_size BIGINT,
  ADD COLUMN IF NOT EXISTS is_late BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_latest BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS feedback TEXT,
  ADD COLUMN IF NOT EXISTS graded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS graded_by UUID REFERENCES public.users(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_file_object_key
  ON public.submissions(object_key) WHERE object_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_latest_file_delivery_user
  ON public.submissions(delivery_id, user_id)
  WHERE object_key IS NOT NULL AND is_latest = TRUE;
CREATE INDEX IF NOT EXISTS idx_submissions_file_roster
  ON public.submissions(delivery_id, is_latest, submitted_at DESC)
  WHERE object_key IS NOT NULL;

CREATE OR REPLACE FUNCTION mark_previous_file_submissions_not_latest()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.object_key IS NOT NULL THEN
    UPDATE public.submissions
    SET is_latest = FALSE
    WHERE delivery_id = NEW.delivery_id
      AND user_id = NEW.user_id
      AND object_key IS NOT NULL
      AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mark_previous_file_submissions ON public.submissions;
CREATE TRIGGER trg_mark_previous_file_submissions
  AFTER INSERT ON public.submissions
  FOR EACH ROW EXECUTE FUNCTION mark_previous_file_submissions_not_latest();

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
  -- Lock row for concurrency safety
  PERFORM 1 FROM public.assignment_deliveries WHERE id = p_delivery_id FOR SHARE;

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
  RETURNING s.id, s.delivery_id, s.user_id, s.object_key, s.file_name, s.mime_type,
            s.file_size, s.submitted_at, s.is_late, s.is_latest, s.score, s.feedback,
            s.graded_at, s.graded_by
  INTO v_inserted;

  RETURN QUERY SELECT v_inserted.id, v_inserted.delivery_id, v_inserted.user_id,
                      v_inserted.object_key, v_inserted.file_name, v_inserted.mime_type,
                      v_inserted.file_size, v_inserted.submitted_at, v_inserted.is_late,
                      v_inserted.is_latest, v_inserted.score, v_inserted.feedback,
                      v_inserted.graded_at, v_inserted.graded_by;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
