CREATE OR REPLACE FUNCTION public.list_missing_essay_grading_submissions(
  p_limit INTEGER DEFAULT 20
) RETURNS TABLE(submission_id UUID)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog
AS $$
  SELECT submission.id
  FROM public.submissions AS submission
  JOIN public.assignments AS assignment ON assignment.id = submission.assignment_id
  WHERE submission.object_key IS NOT NULL
    AND submission.is_latest = TRUE
    AND assignment.submission_type = 'essay'
    AND assignment.ai_grading_enabled = TRUE
    AND NOT EXISTS (
      SELECT 1
      FROM public.essay_grading_jobs AS job
      WHERE job.submission_id = submission.id
    )
  ORDER BY submission.submitted_at, submission.id
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));
$$;

REVOKE ALL ON FUNCTION public.list_missing_essay_grading_submissions(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_missing_essay_grading_submissions(INTEGER)
  TO service_role;
