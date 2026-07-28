-- Kho bài tập, cấu hình giao theo lớp và chấm lại theo phiên bản.
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES users(id);
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS category VARCHAR(20);
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS is_library BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS source_assignment_id UUID REFERENCES assignments(id);
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS content_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assignments_category_check'
  ) THEN
    ALTER TABLE assignments
      ADD CONSTRAINT assignments_category_check
      CHECK (category IN ('grade_10', 'grade_11', 'grade_12', 'advanced'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS assignment_deliveries (
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

CREATE TABLE IF NOT EXISTS assignment_recipients (
  delivery_id UUID NOT NULL REFERENCES assignment_deliveries(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (delivery_id, user_id)
);

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS delivery_id UUID
  REFERENCES assignment_deliveries(id) ON DELETE CASCADE;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS graded_content_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS regrade_status VARCHAR(20) NOT NULL DEFAULT 'current'
  CHECK (regrade_status IN ('current', 'required', 'running', 'failed'));
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS regrade_error TEXT;

-- Giữ nguyên dữ liệu cũ và biến mỗi bài theo lớp thành một bài trong kho có delivery linked.
UPDATE assignments AS assignment
SET
  teacher_id = class_item.teacher_id,
  category = CASE class_item.grade
    WHEN '10' THEN 'grade_10'
    WHEN '11' THEN 'grade_11'
    WHEN '12' THEN 'grade_12'
  END,
  updated_at = COALESCE(assignment.updated_at, assignment.created_at, NOW())
FROM classes AS class_item
WHERE assignment.class_id = class_item.id
  AND (assignment.teacher_id IS NULL OR assignment.category IS NULL);

INSERT INTO assignment_deliveries (
  library_assignment_id,
  assignment_id,
  class_id,
  teacher_id,
  sync_mode,
  recipient_mode,
  due_date,
  is_published,
  max_submissions,
  created_at,
  updated_at
)
SELECT
  assignment.id,
  assignment.id,
  assignment.class_id,
  assignment.teacher_id,
  'linked',
  'all',
  assignment.due_date,
  assignment.is_published,
  assignment.max_submissions,
  assignment.created_at,
  COALESCE(assignment.updated_at, assignment.created_at, NOW())
FROM assignments AS assignment
WHERE assignment.class_id IS NOT NULL
  AND assignment.teacher_id IS NOT NULL
ON CONFLICT (library_assignment_id, class_id) DO NOTHING;

UPDATE submissions AS submission
SET
  delivery_id = delivery.id,
  graded_content_version = assignment.content_version,
  regrade_status = 'current'
FROM assignment_deliveries AS delivery
JOIN assignments AS assignment ON assignment.id = delivery.assignment_id
WHERE submission.assignment_id = delivery.assignment_id
  AND submission.delivery_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_assignments_teacher_category_updated
  ON assignments(teacher_id, category, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_assignment_deliveries_class_published
  ON assignment_deliveries(class_id, is_published);
CREATE UNIQUE INDEX IF NOT EXISTS idx_assignment_deliveries_library_class
  ON assignment_deliveries(library_assignment_id, class_id);
CREATE INDEX IF NOT EXISTS idx_assignment_deliveries_assignment_sync
  ON assignment_deliveries(assignment_id, sync_mode);
CREATE INDEX IF NOT EXISTS idx_assignment_recipients_user_delivery
  ON assignment_recipients(user_id, delivery_id);
CREATE INDEX IF NOT EXISTS idx_submissions_delivery_user_submitted
  ON submissions(delivery_id, user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_regrade_delivery
  ON submissions(regrade_status, delivery_id);

-- Hai bảng mới chỉ được truy cập qua backend dùng service role.
ALTER TABLE assignment_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_recipients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON assignment_deliveries FROM anon, authenticated;
REVOKE ALL ON assignment_recipients FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON assignment_deliveries TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON assignment_recipients TO service_role;
