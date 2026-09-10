ALTER TABLE public.essay_grading_jobs
  ADD COLUMN IF NOT EXISTS grading_method TEXT NOT NULL DEFAULT 'rubric_v1';

ALTER TABLE public.essay_grading_reports
  ADD COLUMN IF NOT EXISTS grading_method TEXT NOT NULL DEFAULT 'rubric_v1',
  ADD COLUMN IF NOT EXISTS ai_correctness_percentage NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS reviewed_correctness_percentage NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS ai_content_analysis JSONB;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'essay_grading_jobs_method_check') THEN
    ALTER TABLE public.essay_grading_jobs
      ADD CONSTRAINT essay_grading_jobs_method_check
      CHECK (grading_method IN ('rubric_v1','percentage_v2','manual_v1'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'essay_grading_reports_method_check') THEN
    ALTER TABLE public.essay_grading_reports
      ADD CONSTRAINT essay_grading_reports_method_check
      CHECK (grading_method IN ('rubric_v1','percentage_v2','manual_v1'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'essay_grading_reports_ai_percentage_check') THEN
    ALTER TABLE public.essay_grading_reports
      ADD CONSTRAINT essay_grading_reports_ai_percentage_check
      CHECK (ai_correctness_percentage IS NULL OR ai_correctness_percentage BETWEEN 0 AND 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'essay_grading_reports_reviewed_percentage_check') THEN
    ALTER TABLE public.essay_grading_reports
      ADD CONSTRAINT essay_grading_reports_reviewed_percentage_check
      CHECK (reviewed_correctness_percentage IS NULL OR reviewed_correctness_percentage BETWEEN 0 AND 100);
  END IF;
END $$;
