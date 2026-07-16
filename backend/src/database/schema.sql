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
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Test cases cho autograding
CREATE TABLE test_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID REFERENCES assignments(id) ON DELETE CASCADE,
  input_data TEXT,
  expected_output TEXT NOT NULL,
  test_name VARCHAR(100),
  points INTEGER DEFAULT 1,
  order_index INTEGER DEFAULT 0
);

-- 6. Bài nộp của học sinh
CREATE TABLE submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  assignment_id UUID REFERENCES assignments(id),
  code TEXT,
  score INTEGER DEFAULT 0,
  max_score INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'submitted',
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Kết quả từng test case
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
