-- Index cho users
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Index cho classes
CREATE INDEX IF NOT EXISTS idx_classes_teacher_id ON classes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_classes_grade ON classes(grade);

-- Index cho enrollments
CREATE INDEX IF NOT EXISTS idx_enrollments_user_id ON enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_class_id ON enrollments(class_id);

-- Index cho assignments
CREATE INDEX IF NOT EXISTS idx_assignments_class_id ON assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_assignments_class_published ON assignments(class_id, is_published);
CREATE INDEX IF NOT EXISTS idx_assignments_is_published ON assignments(is_published);

-- Index cho test_cases
CREATE INDEX IF NOT EXISTS idx_test_cases_assignment_id ON test_cases(assignment_id);

-- Index cho submissions (query chính: top rank, gradebook, lịch sử nộp bài)
CREATE INDEX IF NOT EXISTS idx_submissions_user_id ON submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_assignment_id ON submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_user_assignment ON submissions(user_id, assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_assignment_submitted ON submissions(assignment_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_user_submitted ON submissions(user_id, submitted_at DESC);

-- Index cho submission_results
CREATE INDEX IF NOT EXISTS idx_submission_results_submission_id ON submission_results(submission_id);
CREATE INDEX IF NOT EXISTS idx_submission_results_test_case_id ON submission_results(test_case_id);
