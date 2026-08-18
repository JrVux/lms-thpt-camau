-- Xóa bài tập an toàn trong một giao dịch.
-- Hàm chạy bằng quyền của caller; API backend chỉ gọi bằng service_role.
-- - p_library_only = true : xóa bài trong Kho kèm mọi bản giao cho lớp và bài nộp.
-- - p_library_only = false: xóa bài giao cho một lớp (bản sao + delivery + bài nộp), giữ bài gốc trong Kho.
CREATE OR REPLACE FUNCTION public.delete_assignment_owned(
  p_assignment_id UUID,
  p_teacher_id UUID,
  p_library_only BOOLEAN DEFAULT FALSE
) RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  target public.assignments%ROWTYPE;
  copy_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  SELECT *
  INTO target
  FROM public.assignments
  WHERE id = p_assignment_id
    AND teacher_id = p_teacher_id
    AND (NOT p_library_only OR is_library)
  FOR UPDATE;

  IF target.id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('status', 'not_found');
  END IF;

  IF p_library_only THEN
    -- Các bản sao độc lập ở lớp được tạo từ bài gốc này.
    SELECT COALESCE(pg_catalog.array_agg(assignment_id), ARRAY[]::UUID[])
    INTO copy_ids
    FROM public.assignment_deliveries
    WHERE library_assignment_id = p_assignment_id;

    -- Bài nộp của bài gốc và của mọi bản sao ở lớp (kể cả bài nộp theo delivery).
    DELETE FROM public.submissions
    WHERE assignment_id = p_assignment_id
       OR assignment_id = ANY(copy_ids)
       OR delivery_id IN (
         SELECT id FROM public.assignment_deliveries
         WHERE library_assignment_id = p_assignment_id
       );

    -- Ngắt tham chiếu nguồn từ mọi bản sao (có thể nằm ở nơi khác).
    UPDATE public.assignments
    SET source_assignment_id = NULL
    WHERE source_assignment_id = p_assignment_id
       OR source_assignment_id = ANY(copy_ids);

    -- Xóa bản sao ở lớp; FK ON DELETE CASCADE dọn delivery, recipient,
    -- test case, competency evidence và dữ liệu phụ thuộc còn lại.
    DELETE FROM public.assignments WHERE id = ANY(copy_ids);
  ELSE
    -- Bài giao cho lớp: xóa bài nộp (theo bài hoặc theo delivery) trước.
    DELETE FROM public.submissions
    WHERE assignment_id = p_assignment_id
       OR delivery_id IN (
         SELECT id FROM public.assignment_deliveries WHERE assignment_id = p_assignment_id
       );

    UPDATE public.assignments
    SET source_assignment_id = NULL
    WHERE source_assignment_id = p_assignment_id;
  END IF;

  -- Xóa chính bài tập; FK ON DELETE CASCADE dọn test case, delivery,
  -- competency mapping và evidence còn lại.
  DELETE FROM public.assignments WHERE id = p_assignment_id;

  RETURN pg_catalog.jsonb_build_object(
    'status', 'deleted',
    'id', p_assignment_id,
    'copies', pg_catalog.array_length(copy_ids, 1)
  );
END $$;

REVOKE ALL ON FUNCTION public.delete_assignment_owned(UUID, UUID, BOOLEAN)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_assignment_owned(UUID, UUID, BOOLEAN)
TO service_role;
