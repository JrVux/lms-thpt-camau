ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS ai_grading_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS essay_model_answer TEXT,
  ADD COLUMN IF NOT EXISTS essay_rubric JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS show_model_answer_after_publish BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS public.essay_grading_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  delivery_id UUID NOT NULL REFERENCES public.assignment_deliveries(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES public.users(id),
  assignment_content_version INTEGER NOT NULL,
  prompt_version TEXT NOT NULL,
  model_answer_snapshot TEXT NOT NULL,
  rubric_snapshot JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','extracting','grading','awaiting_review','failed','cancelled')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  provider TEXT,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_essay_grading_active_submission
  ON public.essay_grading_jobs(submission_id)
  WHERE status IN ('queued','extracting','grading');
CREATE INDEX IF NOT EXISTS idx_essay_grading_jobs_ready
  ON public.essay_grading_jobs(next_attempt_at, created_at)
  WHERE status IN ('queued','extracting','grading');

CREATE TABLE IF NOT EXISTS public.essay_grading_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID UNIQUE NOT NULL REFERENCES public.essay_grading_jobs(id) ON DELETE CASCADE,
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'ai' CHECK (source IN ('ai','manual')),
  extracted_text TEXT,
  extraction_method TEXT CHECK (extraction_method IN ('pdf_text','docx_text','gemini_vision','mixed')),
  extraction_quality TEXT CHECK (extraction_quality IN ('sufficient','uncertain','empty')),
  extraction_warnings JSONB NOT NULL DEFAULT '[]'::JSONB,
  ai_score NUMERIC,
  ai_criteria_results JSONB,
  ai_overall_feedback TEXT,
  ai_strengths JSONB NOT NULL DEFAULT '[]'::JSONB,
  ai_improvements JSONB NOT NULL DEFAULT '[]'::JSONB,
  reviewed_score NUMERIC,
  reviewed_criteria_results JSONB,
  reviewed_feedback TEXT,
  review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending','approved','rejected')),
  reviewed_by UUID REFERENCES public.users(id),
  reviewed_at TIMESTAMPTZ,
  show_model_answer BOOLEAN NOT NULL DEFAULT FALSE,
  published_by UUID REFERENCES public.users(id),
  published_at TIMESTAMPTZ,
  unpublished_by UUID REFERENCES public.users(id),
  unpublished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_essay_grading_reports_submission
  ON public.essay_grading_reports(submission_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_essay_grading_reports_published
  ON public.essay_grading_reports(submission_id, published_at)
  WHERE published_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.essay_grading_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.essay_grading_jobs(id) ON DELETE CASCADE,
  report_id UUID REFERENCES public.essay_grading_reports(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_id UUID REFERENCES public.users(id),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_essay_grading_events_job
  ON public.essay_grading_events(job_id, created_at DESC);

ALTER TABLE public.essay_grading_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.essay_grading_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.essay_grading_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.essay_grading_jobs, public.essay_grading_reports, public.essay_grading_events
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.essay_grading_jobs, public.essay_grading_reports, public.essay_grading_events
  TO service_role;

CREATE OR REPLACE FUNCTION public.claim_essay_grading_job(
  p_worker_id TEXT,
  p_lease_seconds INTEGER
) RETURNS public.essay_grading_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  claimed public.essay_grading_jobs;
BEGIN
  SELECT * INTO claimed
  FROM public.essay_grading_jobs
  WHERE status IN ('queued','extracting','grading')
    AND next_attempt_at <= pg_catalog.now()
    AND (lease_expires_at IS NULL OR lease_expires_at <= pg_catalog.now())
  ORDER BY next_attempt_at, created_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF claimed.id IS NULL THEN RETURN NULL; END IF;

  UPDATE public.essay_grading_jobs
  SET status = 'extracting',
      attempt_count = attempt_count + 1,
      lease_owner = p_worker_id,
      lease_expires_at = pg_catalog.now() + (p_lease_seconds || ' seconds')::interval,
      updated_at = pg_catalog.now()
  WHERE id = claimed.id
  RETURNING * INTO claimed;
  RETURN claimed;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_essay_grading_job(TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_essay_grading_job(TEXT, INTEGER)
  TO service_role;

CREATE OR REPLACE FUNCTION public.update_assignment_content(
  p_assignment_id UUID,
  p_teacher_id UUID,
  p_updates JSONB,
  p_library_only BOOLEAN DEFAULT FALSE
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  current_assignment public.assignments%ROWTYPE;
BEGIN
  SELECT * INTO current_assignment
  FROM public.assignments
  WHERE id = p_assignment_id
    AND teacher_id = p_teacher_id
    AND (NOT p_library_only OR is_library)
  FOR UPDATE;
  IF current_assignment.id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy bài tập'; END IF;

  UPDATE public.assignments AS assignment SET
    title = CASE WHEN p_updates ? 'title' THEN p_updates->>'title' ELSE assignment.title END,
    description = CASE WHEN p_updates ? 'description' THEN p_updates->>'description' ELSE assignment.description END,
    category = CASE WHEN p_updates ? 'category' THEN p_updates->>'category' ELSE assignment.category END,
    type = CASE WHEN p_updates ? 'type' THEN p_updates->>'type' ELSE assignment.type END,
    topic_id = CASE
      WHEN NOT (p_updates ? 'topic_id') THEN assignment.topic_id
      WHEN p_updates->'topic_id' = 'null'::JSONB THEN NULL
      ELSE (p_updates->>'topic_id')::UUID
    END,
    starter_code = CASE WHEN p_updates ? 'starter_code' THEN p_updates->>'starter_code' ELSE assignment.starter_code END,
    solution_code = CASE WHEN p_updates ? 'solution_code' THEN p_updates->>'solution_code' ELSE assignment.solution_code END,
    setup_sql = CASE WHEN p_updates ? 'setup_sql' THEN p_updates->>'setup_sql' ELSE assignment.setup_sql END,
    test_code = CASE WHEN p_updates ? 'test_code' THEN p_updates->>'test_code' ELSE assignment.test_code END,
    max_score = CASE WHEN p_updates ? 'max_score' THEN (p_updates->>'max_score')::INTEGER ELSE assignment.max_score END,
    due_date = CASE WHEN p_updates ? 'due_date' THEN (p_updates->>'due_date')::TIMESTAMPTZ ELSE assignment.due_date END,
    max_submissions = CASE
      WHEN NOT (p_updates ? 'max_submissions') THEN assignment.max_submissions
      WHEN p_updates->'max_submissions' = 'null'::JSONB THEN NULL
      ELSE (p_updates->>'max_submissions')::INTEGER
    END,
    submission_type = CASE WHEN p_updates ? 'submission_type' THEN p_updates->>'submission_type' ELSE assignment.submission_type END,
    essay_content = CASE WHEN p_updates ? 'essay_content' THEN p_updates->>'essay_content' ELSE assignment.essay_content END,
    allowed_mime_types = CASE WHEN p_updates ? 'allowed_mime_types' THEN ARRAY(SELECT jsonb_array_elements_text(p_updates->'allowed_mime_types')) ELSE assignment.allowed_mime_types END,
    max_file_size_mb = CASE WHEN p_updates ? 'max_file_size_mb' THEN (p_updates->>'max_file_size_mb')::INTEGER ELSE assignment.max_file_size_mb END,
    allow_late_submission = CASE WHEN p_updates ? 'allow_late_submission' THEN (p_updates->>'allow_late_submission')::BOOLEAN ELSE assignment.allow_late_submission END,
    ai_grading_enabled = CASE WHEN p_updates ? 'ai_grading_enabled' THEN (p_updates->>'ai_grading_enabled')::BOOLEAN ELSE assignment.ai_grading_enabled END,
    essay_model_answer = CASE WHEN p_updates ? 'essay_model_answer' THEN p_updates->>'essay_model_answer' ELSE assignment.essay_model_answer END,
    essay_rubric = CASE WHEN p_updates ? 'essay_rubric' THEN p_updates->'essay_rubric' ELSE assignment.essay_rubric END,
    show_model_answer_after_publish = CASE WHEN p_updates ? 'show_model_answer_after_publish' THEN (p_updates->>'show_model_answer_after_publish')::BOOLEAN ELSE assignment.show_model_answer_after_publish END,
    content_version = assignment.content_version + 1,
    updated_at = pg_catalog.now()
  WHERE assignment.id = p_assignment_id;

  UPDATE public.submissions SET regrade_status = 'required', regrade_error = NULL
  WHERE delivery_id IN (
    SELECT id FROM public.assignment_deliveries
    WHERE assignment_id = p_assignment_id
      OR (library_assignment_id = p_assignment_id AND sync_mode = 'linked')
  );

  RETURN (SELECT pg_catalog.to_jsonb(a) FROM public.assignments a WHERE id = p_assignment_id);
END;
$$;
REVOKE ALL ON FUNCTION public.update_assignment_content(UUID, UUID, JSONB, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_assignment_content(UUID, UUID, JSONB, BOOLEAN)
  TO service_role;
