-- Khung năng lực, ánh xạ bài/test, bằng chứng và ảnh chụp mức thành thạo.
CREATE TABLE IF NOT EXISTS competency_framework_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version INTEGER NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('draft', 'active', 'retired')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS competencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_version_id UUID NOT NULL REFERENCES competency_framework_versions(id),
  code VARCHAR(80) NOT NULL,
  name VARCHAR(160) NOT NULL,
  description TEXT NOT NULL,
  subject VARCHAR(20) NOT NULL CHECK (subject IN ('python', 'sql', 'html')),
  grade VARCHAR(2) NOT NULL CHECK (grade IN ('10', '11', '12')),
  parent_id UUID REFERENCES competencies(id),
  owner_teacher_id UUID REFERENCES users(id) ON DELETE CASCADE,
  source_competency_id UUID REFERENCES competencies(id),
  prerequisite_ids UUID[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS assignment_competency_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  test_case_id UUID REFERENCES test_cases(id) ON DELETE CASCADE,
  competency_id UUID NOT NULL REFERENCES competencies(id),
  difficulty SMALLINT NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
  weight NUMERIC(6,3) NOT NULL CHECK (weight > 0 AND weight <= 10),
  status VARCHAR(20) NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'approved', 'rejected')),
  proposed_by VARCHAR(20) NOT NULL DEFAULT 'teacher'
    CHECK (proposed_by IN ('teacher', 'ai')),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mastery_config_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version INTEGER NOT NULL UNIQUE,
  config JSONB NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('draft', 'active', 'retired')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS competency_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  competency_id UUID NOT NULL REFERENCES competencies(id),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  submission_result_id UUID NOT NULL REFERENCES submission_results(id) ON DELETE CASCADE,
  passed BOOLEAN NOT NULL,
  score_ratio NUMERIC(6,5) NOT NULL CHECK (score_ratio BETWEEN 0 AND 1),
  difficulty SMALLINT NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
  weight NUMERIC(6,3) NOT NULL CHECK (weight > 0 AND weight <= 10),
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(submission_result_id, competency_id)
);

CREATE TABLE IF NOT EXISTS student_competency_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  competency_id UUID NOT NULL REFERENCES competencies(id),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  mastery_config_version_id UUID NOT NULL REFERENCES mastery_config_versions(id),
  mastery SMALLINT NOT NULL CHECK (mastery BETWEEN 0 AND 100),
  confidence SMALLINT NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  label VARCHAR(30) NOT NULL,
  trend VARCHAR(20) NOT NULL CHECK (trend IN ('improving', 'stable', 'declining', 'insufficient')),
  evidence_count INTEGER NOT NULL CHECK (evidence_count >= 0),
  assignment_count INTEGER NOT NULL CHECK (assignment_count >= 0),
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, competency_id, class_id, mastery_config_version_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_global_competency_code
  ON competencies(framework_version_id, code)
  WHERE owner_teacher_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_teacher_competency_code
  ON competencies(framework_version_id, owner_teacher_id, code)
  WHERE owner_teacher_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mapping_assignment_status
  ON assignment_competency_mappings(assignment_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mapping_assignment_skill
  ON assignment_competency_mappings(assignment_id, competency_id)
  WHERE test_case_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mapping_test_skill
  ON assignment_competency_mappings(assignment_id, test_case_id, competency_id)
  WHERE test_case_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_competency_evidence_student_skill_time
  ON competency_evidence(student_id, competency_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshot_class_student
  ON student_competency_snapshots(class_id, student_id, calculated_at DESC);

ALTER TABLE competency_framework_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE competencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_competency_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE mastery_config_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE competency_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_competency_snapshots ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON competency_framework_versions FROM anon, authenticated;
REVOKE ALL ON competencies FROM anon, authenticated;
REVOKE ALL ON assignment_competency_mappings FROM anon, authenticated;
REVOKE ALL ON mastery_config_versions FROM anon, authenticated;
REVOKE ALL ON competency_evidence FROM anon, authenticated;
REVOKE ALL ON student_competency_snapshots FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON competency_framework_versions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON competencies TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON assignment_competency_mappings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON mastery_config_versions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON competency_evidence TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON student_competency_snapshots TO service_role;

INSERT INTO competency_framework_versions (version, name, status)
VALUES (1, 'GDPT 2018 - Tin học THPT', 'active')
ON CONFLICT (version) DO NOTHING;

INSERT INTO mastery_config_versions (version, config, status)
VALUES (1, '{"recentHalfLifeDays":45,"confidenceEvidenceTarget":6,"confidenceAssignmentTarget":3,"lowConfidenceThreshold":40}', 'active')
ON CONFLICT (version) DO NOTHING;

INSERT INTO competencies (framework_version_id, code, name, description, subject, grade)
SELECT framework.id, seed.code, seed.name, seed.description, 'python', '10'
FROM competency_framework_versions AS framework
CROSS JOIN (VALUES
  ('PY10.IO', 'Nhập và xuất dữ liệu', 'Đọc dữ liệu đầu vào và trình bày kết quả đúng định dạng.'),
  ('PY10.DATA', 'Biến và kiểu dữ liệu', 'Sử dụng biến, biểu thức và kiểu dữ liệu phù hợp.'),
  ('PY10.COND', 'Cấu trúc rẽ nhánh', 'Xây dựng điều kiện và lựa chọn nhánh xử lý đúng.'),
  ('PY10.LOOP', 'Cấu trúc lặp', 'Sử dụng vòng lặp đúng điều kiện dừng và phạm vi dữ liệu.'),
  ('PY10.STRING', 'Xử lý chuỗi', 'Truy cập, biến đổi và phân tích dữ liệu chuỗi.'),
  ('PY10.LIST', 'Xử lý danh sách', 'Lưu trữ, duyệt và biến đổi tập hợp dữ liệu bằng danh sách.'),
  ('PY10.FUNC', 'Hàm', 'Chia bài toán thành hàm có tham số và kết quả rõ ràng.'),
  ('PY10.DECOMP', 'Phân rã bài toán', 'Tách bài toán thành các bước hoặc mô-đun có trách nhiệm rõ ràng.')
) AS seed(code, name, description)
WHERE framework.version = 1
ON CONFLICT DO NOTHING;
