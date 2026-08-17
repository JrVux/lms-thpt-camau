CREATE TABLE student_analysis_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES users(id),
  scope jsonb NOT NULL,
  evidence_fingerprint text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','preparing_evidence','analyzing','awaiting_review','approved_internal','published','failed','rejected','stale','withdrawn')),
  attempt_count int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_owner text,
  lease_expires_at timestamptz,
  provider text,
  model text,
  input_tokens int,
  output_tokens int,
  latency_ms int,
  prompt_version text,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE UNIQUE INDEX uq_student_analysis_active
  ON student_analysis_jobs(class_id, student_id)
  WHERE status IN ('queued','preparing_evidence','analyzing');

CREATE TABLE student_analysis_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES student_analysis_jobs(id) ON DELETE CASCADE,
  schema_version text NOT NULL,
  ai_teacher_report jsonb NOT NULL,
  ai_student_report jsonb NOT NULL,
  edited_teacher_report jsonb,
  edited_student_report jsonb,
  review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','approved_internal','published','rejected')),
  review_decision text,
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_student_analysis_report_job
  ON student_analysis_reports(job_id);

CREATE TABLE student_analysis_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES student_analysis_jobs(id) ON DELETE CASCADE,
  report_id uuid REFERENCES student_analysis_reports(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_id uuid REFERENCES users(id),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_student_analysis_job_class_student
  ON student_analysis_jobs(class_id, student_id, created_at DESC);
CREATE INDEX idx_student_analysis_report_job_created
  ON student_analysis_reports(job_id, created_at DESC);
CREATE INDEX idx_student_analysis_event_job
  ON student_analysis_events(job_id, created_at DESC);

ALTER TABLE student_analysis_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_analysis_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_analysis_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON student_analysis_jobs, student_analysis_reports, student_analysis_events FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON student_analysis_jobs, student_analysis_reports, student_analysis_events TO service_role;

CREATE OR REPLACE FUNCTION claim_student_analysis_job(p_worker_id text, p_lease_seconds int)
RETURNS student_analysis_jobs AS $$
DECLARE
  claimed student_analysis_jobs;
BEGIN
  SELECT * INTO claimed
  FROM student_analysis_jobs
  WHERE status IN ('queued', 'preparing_evidence', 'analyzing')
    AND next_attempt_at <= now()
    AND (lease_expires_at IS NULL OR lease_expires_at <= now())
  ORDER BY next_attempt_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF claimed.id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE student_analysis_jobs
  SET status = 'preparing_evidence',
      attempt_count = attempt_count + 1,
      lease_owner = p_worker_id,
      lease_expires_at = now() + (p_lease_seconds || ' seconds')::interval,
      updated_at = now()
  WHERE id = claimed.id
  RETURNING * INTO claimed;

  RETURN claimed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION claim_student_analysis_job(text, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_student_analysis_job(text, int) TO service_role;
