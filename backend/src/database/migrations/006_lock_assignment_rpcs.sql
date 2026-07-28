-- Supabase có thể tự cấp EXECUTE cho các role API khi tạo function.
-- Chỉ backend service-role được phép gọi các RPC ghi dữ liệu này.
REVOKE ALL ON FUNCTION public.replace_assignment_tests(UUID, UUID, JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_assignment_content(UUID, UUID, JSONB, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_submission_with_results(
  UUID, UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER, JSONB
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_submission_regrade(
  UUID, UUID, INTEGER, INTEGER, INTEGER, JSONB
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.replace_assignment_tests(UUID, UUID, JSONB)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.update_assignment_content(UUID, UUID, JSONB, BOOLEAN)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.create_submission_with_results(
  UUID, UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER, JSONB
) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_submission_regrade(
  UUID, UUID, INTEGER, INTEGER, INTEGER, JSONB
) TO service_role;
