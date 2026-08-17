-- Xóa lớp và toàn bộ dữ liệu riêng của lớp trong một giao dịch.
-- Hàm chạy bằng quyền của caller; API backend chỉ gọi bằng service_role.
CREATE OR REPLACE FUNCTION public.delete_class_owned(
  p_class_id UUID,
  p_teacher_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  target_class public.classes%ROWTYPE;
  local_assignment_ids UUID[];
BEGIN
  SELECT *
  INTO target_class
  FROM public.classes
  WHERE id = p_class_id
  FOR UPDATE;

  IF target_class.id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('status', 'not_found');
  END IF;

  IF target_class.teacher_id <> p_teacher_id THEN
    RETURN pg_catalog.jsonb_build_object('status', 'forbidden');
  END IF;

  SELECT COALESCE(pg_catalog.array_agg(id), ARRAY[]::UUID[])
  INTO local_assignment_ids
  FROM public.assignments
  WHERE class_id = p_class_id
    AND is_library IS NOT TRUE;

  -- Bản sao ở lớp khác không được tiếp tục tham chiếu bài cục bộ sắp xóa.
  UPDATE public.assignments
  SET source_assignment_id = NULL
  WHERE source_assignment_id = ANY(local_assignment_ids)
    AND class_id IS DISTINCT FROM p_class_id;

  -- Bao gồm bài nộp mới theo delivery và dữ liệu cũ chỉ có assignment_id.
  DELETE FROM public.submissions
  WHERE assignment_id = ANY(local_assignment_ids)
     OR delivery_id IN (
       SELECT id
       FROM public.assignment_deliveries
       WHERE class_id = p_class_id
     );

  -- Kho bài tập là tài sản độc lập của giáo viên, không xóa cùng lớp.
  UPDATE public.assignments
  SET class_id = NULL
  WHERE class_id = p_class_id
    AND is_library IS TRUE;

  -- Các FK ON DELETE CASCADE dọn enrollment, delivery, recipient,
  -- assignment cục bộ, test case và dữ liệu phụ thuộc còn lại.
  DELETE FROM public.classes
  WHERE id = p_class_id;

  RETURN pg_catalog.jsonb_build_object(
    'status', 'deleted',
    'id', p_class_id
  );
END $$;

REVOKE ALL ON FUNCTION public.delete_class_owned(UUID, UUID)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_class_owned(UUID, UUID) TO service_role;
