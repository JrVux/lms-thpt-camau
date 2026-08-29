-- 1. Bảng người dùng
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) CHECK (role IN ('teacher', 'student')) DEFAULT 'student',
  full_name VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Bảng lớp học
CREATE TABLE classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  grade VARCHAR(10) CHECK (grade IN ('10', '11', '12')),
  subject VARCHAR(20) CHECK (subject IN ('python', 'sql', 'html')),
  class_code VARCHAR(10) UNIQUE NOT NULL,
  teacher_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Học sinh trong lớp
CREATE TABLE enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, class_id)
);

-- 4. Bài tập
CREATE TABLE assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES users(id),
  category VARCHAR(20) CHECK (category IN ('grade_10', 'grade_11', 'grade_12', 'advanced')),
  is_library BOOLEAN NOT NULL DEFAULT TRUE,
  source_assignment_id UUID REFERENCES assignments(id),
  content_version INTEGER NOT NULL DEFAULT 1,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  type VARCHAR(20) CHECK (type IN ('python', 'sql', 'html')),
  starter_code TEXT,
  solution_code TEXT,
  setup_sql TEXT,
  test_code TEXT,
  due_date TIMESTAMPTZ,
  is_published BOOLEAN DEFAULT false,
  max_score INTEGER DEFAULT 0,
  max_submissions INTEGER DEFAULT NULL,
  submission_type TEXT NOT NULL DEFAULT 'autograde' CHECK (submission_type IN ('autograde', 'practice_file', 'essay')),
  essay_content TEXT,
  allowed_mime_types TEXT[] NOT NULL DEFAULT ARRAY[
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg', 'image/png', 'image/webp'
  ],
  max_file_size_mb INTEGER NOT NULL DEFAULT 25 CHECK (max_file_size_mb BETWEEN 1 AND 100),
  allow_late_submission BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE assignments
  ADD CONSTRAINT assignments_teacher_required_for_new_rows
  CHECK (teacher_id IS NOT NULL) NOT VALID;
ALTER TABLE assignments
  ADD CONSTRAINT assignments_category_required_for_new_rows
  CHECK (category IS NOT NULL) NOT VALID;

-- 4b. Chủ đề bài tập: mỗi giáo viên một danh sách riêng theo từng khối
CREATE TABLE assignment_topics (
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
  ADD COLUMN topic_id UUID REFERENCES assignment_topics(id) ON DELETE SET NULL;

CREATE INDEX idx_assignment_topics_teacher_category
  ON assignment_topics(teacher_id, category, sort_order, name);
CREATE INDEX idx_assignments_teacher_topic
  ON assignments(teacher_id, topic_id);

ALTER TABLE assignment_topics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON assignment_topics FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON assignment_topics TO service_role;

-- 5. Cấu hình giao bài theo từng lớp
CREATE TABLE assignment_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  library_assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES users(id),
  sync_mode VARCHAR(20) NOT NULL DEFAULT 'linked'
    CHECK (sync_mode IN ('linked', 'detached')),
  recipient_mode VARCHAR(20) NOT NULL DEFAULT 'all'
    CHECK (recipient_mode IN ('all', 'selected')),
  due_date TIMESTAMPTZ,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  max_submissions INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(library_assignment_id, class_id)
);

ALTER TABLE assignment_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON assignment_deliveries FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON assignment_deliveries TO service_role;

-- 6. Học sinh cụ thể nhận bài
CREATE TABLE assignment_recipients (
  delivery_id UUID NOT NULL REFERENCES assignment_deliveries(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (delivery_id, user_id)
);

ALTER TABLE assignment_recipients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON assignment_recipients FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON assignment_recipients TO service_role;

-- 7. Test cases cho autograding
CREATE TABLE test_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID REFERENCES assignments(id) ON DELETE CASCADE,
  input_data TEXT,
  expected_output TEXT NOT NULL,
  test_name VARCHAR(100),
  points INTEGER DEFAULT 1,
  order_index INTEGER DEFAULT 0
);

-- 8. Bài nộp của học sinh
CREATE TABLE submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  assignment_id UUID REFERENCES assignments(id),
  delivery_id UUID REFERENCES assignment_deliveries(id) ON DELETE CASCADE,
  code TEXT,
  score INTEGER DEFAULT 0,
  max_score INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'submitted',
  graded_content_version INTEGER NOT NULL DEFAULT 1,
  regrade_status VARCHAR(20) NOT NULL DEFAULT 'current'
    CHECK (regrade_status IN ('current', 'required', 'running', 'failed')),
  regrade_error TEXT,
  object_key TEXT,
  file_name TEXT,
  mime_type TEXT,
  file_size BIGINT,
  is_late BOOLEAN NOT NULL DEFAULT FALSE,
  is_latest BOOLEAN NOT NULL DEFAULT TRUE,
  feedback TEXT,
  graded_at TIMESTAMPTZ,
  graded_by UUID REFERENCES users(id),
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_file_object_key
  ON submissions(object_key) WHERE object_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_latest_file_delivery_user
  ON submissions(delivery_id, user_id)
  WHERE object_key IS NOT NULL AND is_latest = TRUE;
CREATE INDEX IF NOT EXISTS idx_submissions_file_roster
  ON submissions(delivery_id, is_latest, submitted_at DESC)
  WHERE object_key IS NOT NULL;

CREATE OR REPLACE FUNCTION mark_previous_file_submissions_not_latest()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.object_key IS NOT NULL THEN
    UPDATE public.submissions
    SET is_latest = FALSE
    WHERE delivery_id = NEW.delivery_id
      AND user_id = NEW.user_id
      AND object_key IS NOT NULL
      AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mark_previous_file_submissions ON public.submissions;
CREATE TRIGGER trg_mark_previous_file_submissions
  AFTER INSERT ON public.submissions
  FOR EACH ROW EXECUTE FUNCTION mark_previous_file_submissions_not_latest();

CREATE OR REPLACE FUNCTION create_file_submission(
  p_delivery_id UUID,
  p_user_id UUID,
  p_object_key TEXT,
  p_file_name TEXT,
  p_mime_type TEXT,
  p_file_size BIGINT,
  p_is_late BOOLEAN
)
RETURNS TABLE (
  id UUID,
  delivery_id UUID,
  user_id UUID,
  object_key TEXT,
  file_name TEXT,
  mime_type TEXT,
  file_size BIGINT,
  submitted_at TIMESTAMPTZ,
  is_late BOOLEAN,
  is_latest BOOLEAN,
  score NUMERIC,
  feedback TEXT,
  graded_at TIMESTAMPTZ,
  graded_by UUID
) AS $$
DECLARE
  v_existing RECORD;
  v_inserted RECORD;
BEGIN
  PERFORM 1 FROM public.assignment_deliveries WHERE id = p_delivery_id FOR SHARE;

  SELECT s.id, s.delivery_id, s.user_id, s.object_key, s.file_name, s.mime_type,
         s.file_size, s.submitted_at, s.is_late, s.is_latest, s.score, s.feedback,
         s.graded_at, s.graded_by
  INTO v_existing
  FROM public.submissions s
  WHERE s.object_key = p_object_key;

  IF FOUND THEN
    RETURN QUERY SELECT v_existing.id, v_existing.delivery_id, v_existing.user_id,
                        v_existing.object_key, v_existing.file_name, v_existing.mime_type,
                        v_existing.file_size, v_existing.submitted_at, v_existing.is_late,
                        v_existing.is_latest, v_existing.score, v_existing.feedback,
                        v_existing.graded_at, v_existing.graded_by;
    RETURN;
  END IF;

  INSERT INTO public.submissions (
    delivery_id, user_id, object_key, file_name, mime_type, file_size, is_late, is_latest, status
  ) VALUES (
    p_delivery_id, p_user_id, p_object_key, p_file_name, p_mime_type, p_file_size, p_is_late, TRUE, 'submitted'
  )
  RETURNING s.id, s.delivery_id, s.user_id, s.object_key, s.file_name, s.mime_type,
            s.file_size, s.submitted_at, s.is_late, s.is_latest, s.score, s.feedback,
            s.graded_at, s.graded_by
  INTO v_inserted;

  RETURN QUERY SELECT v_inserted.id, v_inserted.delivery_id, v_inserted.user_id,
                      v_inserted.object_key, v_inserted.file_name, v_inserted.mime_type,
                      v_inserted.file_size, v_inserted.submitted_at, v_inserted.is_late,
                      v_inserted.is_latest, v_inserted.score, v_inserted.feedback,
                      v_inserted.graded_at, v_inserted.graded_by;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Kết quả từng test case
CREATE TABLE submission_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE,
  test_case_id UUID REFERENCES test_cases(id),
  test_name VARCHAR(200),
  points INTEGER DEFAULT 1,
  passed BOOLEAN DEFAULT false,
  actual_output TEXT,
  error_message TEXT
);

CREATE INDEX idx_assignments_teacher_category_updated
  ON assignments(teacher_id, category, updated_at DESC);
CREATE INDEX idx_assignment_deliveries_class_published
  ON assignment_deliveries(class_id, is_published);
CREATE UNIQUE INDEX idx_assignment_deliveries_library_class
  ON assignment_deliveries(library_assignment_id, class_id);
CREATE INDEX idx_assignment_deliveries_assignment_sync
  ON assignment_deliveries(assignment_id, sync_mode);
CREATE INDEX idx_assignment_recipients_user_delivery
  ON assignment_recipients(user_id, delivery_id);
CREATE INDEX idx_submissions_delivery_user_submitted
  ON submissions(delivery_id, user_id, submitted_at DESC);
CREATE INDEX idx_submissions_regrade_delivery
  ON submissions(regrade_status, delivery_id);

-- 10. Nền tảng phân tích năng lực (tương đương migration 009)
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

-- Nhật ký gọi AI chỉ lưu metadata, không lưu prompt hoặc mã lời giải.
CREATE TABLE IF NOT EXISTS ai_generation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose VARCHAR(40) NOT NULL DEFAULT 'assignment_draft',
  prompt_version VARCHAR(40) NOT NULL,
  provider VARCHAR(30), model VARCHAR(160),
  status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed')),
  input_tokens INTEGER, output_tokens INTEGER,
  estimated_cost NUMERIC(12,6), latency_ms INTEGER NOT NULL,
  request_hash VARCHAR(64) NOT NULL, error_code VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
CREATE TABLE student_analysis_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES users(id),
  scope jsonb NOT NULL,
  evidence_fingerprint text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','preparing_evidence','analyzing','awaiting_review','approved_internal','published','failed','rejected','stale','withdrawn')),
  attempt_count int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_owner text,
  lease_expires_at timestamptz,
  provider text,
  model text,
  input_tokens int,
  output_tokens int,
  latency_ms int,
  prompt_version text,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE UNIQUE INDEX uq_student_analysis_active
  ON student_analysis_jobs(class_id, student_id)
  WHERE status IN ('queued','preparing_evidence','analyzing');

CREATE TABLE student_analysis_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES student_analysis_jobs(id) ON DELETE CASCADE,
  schema_version text NOT NULL,
  ai_teacher_report jsonb NOT NULL,
  ai_student_report jsonb NOT NULL,
  edited_teacher_report jsonb,
  edited_student_report jsonb,
  review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','approved_internal','published','rejected')),
  review_decision text,
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_student_analysis_report_job
  ON student_analysis_reports(job_id);

CREATE TABLE student_analysis_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES student_analysis_jobs(id) ON DELETE CASCADE,
  report_id uuid REFERENCES student_analysis_reports(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_id uuid REFERENCES users(id),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_student_analysis_job_class_student
  ON student_analysis_jobs(class_id, student_id, created_at DESC);
CREATE INDEX idx_student_analysis_report_job_created
  ON student_analysis_reports(job_id, created_at DESC);
CREATE INDEX idx_student_analysis_event_job
  ON student_analysis_events(job_id, created_at DESC);

ALTER TABLE student_analysis_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_analysis_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_analysis_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON student_analysis_jobs, student_analysis_reports, student_analysis_events FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON student_analysis_jobs, student_analysis_reports, student_analysis_events TO service_role;

CREATE OR REPLACE FUNCTION claim_student_analysis_job(p_worker_id text, p_lease_seconds int)
RETURNS student_analysis_jobs AS $$
DECLARE
  claimed student_analysis_jobs;
BEGIN
  SELECT * INTO claimed
  FROM student_analysis_jobs
  WHERE status IN ('queued', 'preparing_evidence', 'analyzing')
    AND next_attempt_at <= now()
    AND (lease_expires_at IS NULL OR lease_expires_at <= now())
  ORDER BY next_attempt_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF claimed.id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE student_analysis_jobs
  SET status = 'preparing_evidence',
      attempt_count = attempt_count + 1,
      lease_owner = p_worker_id,
      lease_expires_at = now() + (p_lease_seconds || ' seconds')::interval,
      updated_at = now()
  WHERE id = claimed.id
  RETURNING * INTO claimed;

  RETURN claimed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION claim_student_analysis_job(text, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_student_analysis_job(text, int) TO service_role;
