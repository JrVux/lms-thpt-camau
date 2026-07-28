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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE assignments
  ADD CONSTRAINT assignments_teacher_required_for_new_rows
  CHECK (teacher_id IS NOT NULL) NOT VALID;
ALTER TABLE assignments
  ADD CONSTRAINT assignments_category_required_for_new_rows
  CHECK (category IS NOT NULL) NOT VALID;

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
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

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
