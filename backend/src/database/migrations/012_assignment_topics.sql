-- Chủ đề bài tập: mỗi giáo viên một danh sách chủ đề riêng theo từng khối.
-- Giúp sắp xếp Kho bài tập gọn gàng theo chủ đề khi soạn và giao bài cho lớp.
CREATE TABLE IF NOT EXISTS assignment_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category VARCHAR(20) NOT NULL
    CHECK (category IN ('grade_10', 'grade_11', 'grade_12', 'advanced')),
  name VARCHAR(100) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (teacher_id, category, name)
);

ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS topic_id UUID REFERENCES assignment_topics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_assignment_topics_teacher_category
  ON assignment_topics(teacher_id, category, sort_order, name);
CREATE INDEX IF NOT EXISTS idx_assignments_teacher_topic
  ON assignments(teacher_id, topic_id);

ALTER TABLE assignment_topics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON assignment_topics FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON assignment_topics TO service_role;

-- Mở rộng RPC cập nhật nội dung dùng chung để đồng bộ chủ đề khi giao dịch
-- ghi bài chạy qua đường content-and-regrade (thay đổi điểm/mã nguồn).
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

REVOKE ALL ON FUNCTION public.update_assignment_content(UUID, UUID, JSONB, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_assignment_content(UUID, UUID, JSONB, BOOLEAN)
  TO service_role;
