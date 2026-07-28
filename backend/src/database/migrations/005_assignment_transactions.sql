-- Giao dịch chấm bài an toàn cho cả hệ thống đã từng chạy migration 004.
ALTER TABLE public.submission_results ADD COLUMN IF NOT EXISTS test_name VARCHAR(200);
ALTER TABLE public.submission_results ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT 1;

CREATE OR REPLACE FUNCTION public.enforce_delivery_submission_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  allowed_attempts INTEGER;
  used_attempts INTEGER;
BEGIN
  IF NEW.delivery_id IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.delivery_id::text || NEW.user_id::text, 0)
  );
  SELECT max_submissions INTO allowed_attempts
  FROM public.assignment_deliveries WHERE id = NEW.delivery_id;
  IF allowed_attempts IS NOT NULL THEN
    SELECT COUNT(*) INTO used_attempts
    FROM public.submissions
    WHERE delivery_id = NEW.delivery_id AND user_id = NEW.user_id;
    IF used_attempts >= allowed_attempts THEN
      RAISE EXCEPTION 'Đã đạt số lần nộp tối đa';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_delivery_submission_limit ON public.submissions;
CREATE TRIGGER trg_enforce_delivery_submission_limit
BEFORE INSERT ON public.submissions
FOR EACH ROW EXECUTE FUNCTION public.enforce_delivery_submission_limit();

CREATE OR REPLACE FUNCTION public.replace_assignment_tests(
  p_assignment_id UUID, p_teacher_id UUID, p_test_cases JSONB
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  current_assignment public.assignments%ROWTYPE;
  next_score INTEGER;
BEGIN
  SELECT * INTO current_assignment FROM public.assignments
  WHERE id = p_assignment_id AND teacher_id = p_teacher_id FOR UPDATE;
  IF current_assignment.id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy bài tập'; END IF;
  UPDATE public.submission_results AS result
  SET test_name = COALESCE(result.test_name, test_case.test_name),
    points = test_case.points, test_case_id = NULL
  FROM public.test_cases AS test_case
  WHERE result.test_case_id = test_case.id AND test_case.assignment_id = p_assignment_id;
  DELETE FROM public.test_cases WHERE assignment_id = p_assignment_id;
  INSERT INTO public.test_cases (
    assignment_id, input_data, expected_output, test_name, points, order_index
  )
  SELECT p_assignment_id, COALESCE(item->>'input_data', ''), item->>'expected_output',
    item->>'test_name', COALESCE((item->>'points')::INTEGER, 1),
    COALESCE((item->>'order_index')::INTEGER, ordinal - 1)
  FROM pg_catalog.jsonb_array_elements(COALESCE(p_test_cases, '[]'::JSONB))
    WITH ORDINALITY AS valueset(item, ordinal);
  SELECT COALESCE(SUM(points), 0) INTO next_score
  FROM public.test_cases WHERE assignment_id = p_assignment_id;
  UPDATE public.assignments SET max_score = next_score,
    content_version = content_version + 1, updated_at = pg_catalog.now()
  WHERE id = p_assignment_id;
  UPDATE public.submissions SET regrade_status = 'required', regrade_error = NULL
  WHERE delivery_id IN (
    SELECT id FROM public.assignment_deliveries
    WHERE assignment_id = p_assignment_id
      OR (library_assignment_id = p_assignment_id AND sync_mode = 'linked')
  );
  RETURN (SELECT pg_catalog.to_jsonb(a) FROM public.assignments a WHERE id = p_assignment_id);
END $$;

CREATE OR REPLACE FUNCTION public.update_assignment_content(
  p_assignment_id UUID, p_teacher_id UUID, p_updates JSONB, p_library_only BOOLEAN DEFAULT FALSE
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  current_assignment public.assignments%ROWTYPE;
BEGIN
  SELECT * INTO current_assignment FROM public.assignments
  WHERE id = p_assignment_id AND teacher_id = p_teacher_id
    AND (NOT p_library_only OR is_library) FOR UPDATE;
  IF current_assignment.id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy bài tập'; END IF;

  UPDATE public.assignments AS assignment SET
    title = CASE WHEN p_updates ? 'title' THEN p_updates->>'title' ELSE assignment.title END,
    description = CASE WHEN p_updates ? 'description' THEN p_updates->>'description' ELSE assignment.description END,
    category = CASE WHEN p_updates ? 'category' THEN p_updates->>'category' ELSE assignment.category END,
    type = CASE WHEN p_updates ? 'type' THEN p_updates->>'type' ELSE assignment.type END,
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
END $$;

CREATE OR REPLACE FUNCTION public.create_submission_with_results(
  p_user_id UUID, p_assignment_id UUID, p_delivery_id UUID, p_code TEXT,
  p_score INTEGER, p_max_score INTEGER, p_content_version INTEGER, p_results JSONB
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  delivery public.assignment_deliveries%ROWTYPE;
  assignment public.assignments%ROWTYPE;
  created public.submissions%ROWTYPE;
BEGIN
  SELECT * INTO delivery FROM public.assignment_deliveries
  WHERE id = p_delivery_id FOR UPDATE;
  SELECT * INTO assignment FROM public.assignments
  WHERE id = p_assignment_id FOR UPDATE;
  IF delivery.id IS NULL OR assignment.id IS NULL
    OR delivery.assignment_id <> assignment.id
    OR NOT delivery.is_published
    OR (delivery.due_date IS NOT NULL AND delivery.due_date < pg_catalog.now())
    OR assignment.content_version <> p_content_version
    OR NOT EXISTS (
      SELECT 1 FROM public.enrollments
      WHERE class_id = delivery.class_id AND user_id = p_user_id
    )
    OR (delivery.recipient_mode = 'selected' AND NOT EXISTS (
      SELECT 1 FROM public.assignment_recipients
      WHERE delivery_id = delivery.id AND user_id = p_user_id
    ))
  THEN RAISE EXCEPTION 'Bài giao đã thay đổi hoặc học sinh không còn quyền nộp'; END IF;

  INSERT INTO public.submissions (
    user_id, assignment_id, delivery_id, code, score, max_score,
    graded_content_version, regrade_status
  ) VALUES (
    p_user_id, p_assignment_id, p_delivery_id, p_code, p_score, p_max_score,
    p_content_version, 'current'
  ) RETURNING * INTO created;
  INSERT INTO public.submission_results (
    submission_id, test_case_id, test_name, points, passed, actual_output, error_message
  )
  SELECT created.id, NULLIF(item->>'test_case_id', '')::UUID,
    item->>'test_name', COALESCE((item->>'points')::INTEGER, 1),
    COALESCE((item->>'passed')::BOOLEAN, FALSE),
    COALESCE(item->>'actual_output', ''), COALESCE(item->>'error_message', '')
  FROM pg_catalog.jsonb_array_elements(COALESCE(p_results, '[]'::JSONB)) AS valueset(item);
  RETURN pg_catalog.to_jsonb(created);
END $$;

CREATE OR REPLACE FUNCTION public.complete_submission_regrade(
  p_submission_id UUID, p_user_id UUID, p_score INTEGER, p_max_score INTEGER,
  p_content_version INTEGER, p_results JSONB
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE
  current_submission public.submissions%ROWTYPE;
  delivery public.assignment_deliveries%ROWTYPE;
  assignment public.assignments%ROWTYPE;
  updated public.submissions%ROWTYPE;
BEGIN
  SELECT * INTO current_submission FROM public.submissions
  WHERE id = p_submission_id AND user_id = p_user_id
    AND regrade_status IN ('required', 'failed') FOR UPDATE;
  IF current_submission.id IS NULL THEN RAISE EXCEPTION 'Bài nộp không cần chấm lại'; END IF;
  SELECT * INTO delivery FROM public.assignment_deliveries
  WHERE id = current_submission.delivery_id FOR UPDATE;
  SELECT * INTO assignment FROM public.assignments
  WHERE id = delivery.assignment_id FOR UPDATE;
  IF delivery.id IS NULL OR assignment.id IS NULL
    OR assignment.content_version <> p_content_version
    OR NOT delivery.is_published
    OR NOT EXISTS (
      SELECT 1 FROM public.enrollments
      WHERE class_id = delivery.class_id AND user_id = p_user_id
    )
    OR (delivery.recipient_mode = 'selected' AND NOT EXISTS (
      SELECT 1 FROM public.assignment_recipients
      WHERE delivery_id = delivery.id AND user_id = p_user_id
    ))
  THEN RAISE EXCEPTION 'Bài giao đã thay đổi hoặc học sinh không còn quyền chấm lại'; END IF;

  DELETE FROM public.submission_results WHERE submission_id = p_submission_id;
  INSERT INTO public.submission_results (
    submission_id, test_case_id, test_name, points, passed, actual_output, error_message
  )
  SELECT p_submission_id, NULLIF(item->>'test_case_id', '')::UUID,
    item->>'test_name', COALESCE((item->>'points')::INTEGER, 1),
    COALESCE((item->>'passed')::BOOLEAN, FALSE),
    COALESCE(item->>'actual_output', ''), COALESCE(item->>'error_message', '')
  FROM pg_catalog.jsonb_array_elements(COALESCE(p_results, '[]'::JSONB)) AS valueset(item);
  UPDATE public.submissions SET score = p_score, max_score = p_max_score,
    graded_content_version = p_content_version, regrade_status = 'current', regrade_error = NULL
  WHERE id = p_submission_id RETURNING * INTO updated;
  RETURN pg_catalog.to_jsonb(updated);
END $$;

REVOKE ALL ON FUNCTION public.enforce_delivery_submission_limit() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_assignment_tests(UUID, UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_assignment_content(UUID, UUID, JSONB, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_submission_with_results(
  UUID, UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER, JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_submission_regrade(
  UUID, UUID, INTEGER, INTEGER, INTEGER, JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_submission_with_results(
  UUID, UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER, JSONB
) TO service_role;
GRANT EXECUTE ON FUNCTION public.replace_assignment_tests(UUID, UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_assignment_content(UUID, UUID, JSONB, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_submission_regrade(
  UUID, UUID, INTEGER, INTEGER, INTEGER, JSONB
) TO service_role;
