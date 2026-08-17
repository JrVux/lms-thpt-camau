-- Ứng dụng dùng xác thực riêng tại backend; trình duyệt không truy cập Supabase trực tiếp.
-- Xóa các policy legacy "Allow all" và chỉ cho service-role truy cập dữ liệu nghiệp vụ.
DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'users', 'classes', 'enrollments', 'assignments',
    'test_cases', 'submissions', 'submission_results'
  ]
  LOOP
    EXECUTE pg_catalog.format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      'Allow all',
      table_name
    );
  END LOOP;
END $$;

REVOKE ALL ON TABLE
  public.users,
  public.classes,
  public.enrollments,
  public.assignments,
  public.test_cases,
  public.submissions,
  public.submission_results
FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.users,
  public.classes,
  public.enrollments,
  public.assignments,
  public.test_cases,
  public.submissions,
  public.submission_results
TO service_role;
