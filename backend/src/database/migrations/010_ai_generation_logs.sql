CREATE TABLE IF NOT EXISTS ai_generation_logs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 purpose VARCHAR(40) NOT NULL DEFAULT 'assignment_draft', prompt_version VARCHAR(40) NOT NULL,
 provider VARCHAR(30), model VARCHAR(160), status VARCHAR(20) NOT NULL CHECK (status IN ('success','failed')),
 input_tokens INTEGER, output_tokens INTEGER, estimated_cost NUMERIC(12,6), latency_ms INTEGER NOT NULL,
 request_hash VARCHAR(64) NOT NULL, error_code VARCHAR(80), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_generation_logs_teacher_time ON ai_generation_logs(teacher_id, created_at DESC);
ALTER TABLE ai_generation_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ai_generation_logs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_generation_logs TO service_role;

INSERT INTO competencies (framework_version_id, code, name, description, subject, grade)
SELECT f.id, s.code, s.name, s.description, s.subject, s.grade
FROM competency_framework_versions f
CROSS JOIN (VALUES
 ('SQL11.SELECT','Truy vấn SELECT','Chọn đúng cột và dữ liệu cần thiết.','sql','11'),
 ('SQL11.FILTER','Lọc dữ liệu','Dùng WHERE và điều kiện lọc chính xác.','sql','11'),
 ('SQL11.SORT','Sắp xếp dữ liệu','Dùng ORDER BY đúng cột và thứ tự.','sql','11'),
 ('SQL11.JOIN','Kết nối bảng','Kết nối các bảng bằng khóa phù hợp.','sql','11'),
 ('HTML12.STRUCTURE','Cấu trúc HTML','Dùng thẻ HTML ngữ nghĩa và cấu trúc hợp lệ.','html','12'),
 ('HTML12.CSS','Định dạng CSS','Áp dụng selector và thuộc tính CSS phù hợp.','html','12'),
 ('HTML12.ACCESSIBILITY','Khả năng tiếp cận','Dùng alt, label và cấu trúc hỗ trợ người dùng.','html','12'),
 ('HTML12.LAYOUT','Bố cục trang','Tổ chức bố cục rõ ràng và thích ứng.','html','12')
) s(code,name,description,subject,grade)
WHERE f.version=1
ON CONFLICT DO NOTHING;
