# Assignment Library and Targeted Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây Kho bài tập theo Khối 10/11/12/Nâng cao, giao bài cho nhiều lớp hoặc học sinh cụ thể, hỗ trợ nội dung linked/detached và đánh dấu bài nộp cần chấm lại.

**Architecture:** Giữ `assignments` làm nội dung bài, thêm `assignment_deliveries` cho cấu hình từng lớp và `assignment_recipients` cho người nhận cụ thể. Backend tách thành các service có dependency injection để kiểm thử bằng `node:test`; frontend có trang riêng cho giáo viên/học sinh và tái sử dụng các editor hiện tại bằng `delivery_id`.

**Tech Stack:** Node.js ES modules, Express, Supabase/Postgres, `node:test`, React 18, React Router 6, Vite, Tailwind CSS.

## Global Constraints

- Mục **Bài tập** nằm ngay sau **Lớp học** cho cả giáo viên và học sinh.
- Kho giáo viên có đúng bốn nhóm: `grade_10`, `grade_11`, `grade_12`, `advanced`.
- Bài theo khối chỉ giao đúng grade; bài Nâng cao chỉ giao cho lớp có subject trùng type.
- Mỗi lớp có hạn nộp, publish, số lượt nộp và đối tượng nhận độc lập.
- Delivery linked đọc nội dung mới từ bài gốc; delivery detached dùng bản sao riêng.
- Học sinh ngoài recipient không được đọc hoặc nộp qua API.
- Giai đoạn đầu không chạy code phía server; submission được đánh dấu `required` và tự chạy lại khi học sinh mở bài.
- Chấm lại thất bại phải giữ điểm gần nhất.
- Migration không xóa assignment, test case, submission hoặc điểm hiện có.
- Không thêm dependency kiểm thử mới.

---

### Task 1: Migration và luật nghiệp vụ thuần

**Files:**
- Create: `backend/src/database/migrations/004_assignment_library_and_deliveries.sql`
- Create: `backend/src/services/assignmentLibraryRules.js`
- Create: `backend/test/assignmentLibraryRules.test.js`
- Modify: `backend/src/database/schema.sql`

**Interfaces:**
- Produces: `CATEGORY_GRADE: Readonly<Record<string, string>>`
- Produces: `eligibleClassesForAssignment(assignment, classes): Class[]`
- Produces: `validateDeliveryTargets(assignment, deliveries, classesById, studentsByClass): void`
- Produces database tables `assignment_deliveries`, `assignment_recipients`

- [ ] **Step 1: Write failing rule tests**

Create tests covering:

```js
assert.deepEqual(
  eligibleClassesForAssignment(
    { category: 'grade_10', type: 'python' },
    [
      { id: '10a1', grade: '10', subject: 'python' },
      { id: '11a1', grade: '11', subject: 'sql' },
    ]
  ).map((item) => item.id),
  ['10a1']
);
```

Also assert:

- `advanced/python` accepts only `subject=python`;
- selected mode with no student rejects;
- selected student not enrolled in the target class rejects;
- duplicate class IDs reject;
- `all` mode ignores an empty `student_ids` array.

- [ ] **Step 2: Run the rule test and verify RED**

Run:

```powershell
cd backend
npm.cmd test -- test/assignmentLibraryRules.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the pure rules**

Create `assignmentLibraryRules.js` with exact category mapping:

```js
export const CATEGORY_GRADE = Object.freeze({
  grade_10: '10',
  grade_11: '11',
  grade_12: '12',
});

export const eligibleClassesForAssignment = (assignment, classes) =>
  classes.filter((classItem) => assignment.category === 'advanced'
    ? classItem.subject === assignment.type
    : String(classItem.grade) === CATEGORY_GRADE[assignment.category]
      && classItem.subject === assignment.type);
```

`validateDeliveryTargets` must validate every target before returning, use `Set` for duplicate detection, and throw stable Vietnamese errors.

- [ ] **Step 4: Run rule tests and verify GREEN**

Run `npm.cmd test -- test/assignmentLibraryRules.test.js`.

Expected: all rule tests PASS.

- [ ] **Step 5: Add the idempotent SQL migration**

The migration must:

```sql
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES users(id);
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS category VARCHAR(20);
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS is_library BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS source_assignment_id UUID REFERENCES assignments(id);
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS content_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

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
```

Backfill assignment ownership/category from `classes`, insert one linked delivery per legacy assignment with `ON CONFLICT DO NOTHING`, then update `submissions.delivery_id` by legacy `assignment_id`. Add the six indexes from the design.

- [ ] **Step 6: Update canonical schema**

Mirror all new columns, tables, constraints and indexes in `schema.sql`, preserving the legacy columns during transition.

- [ ] **Step 7: Verify migration structure**

Run:

```powershell
rg -n "assignment_deliveries|assignment_recipients|content_version|regrade_status|ON CONFLICT" backend/src/database/migrations/004_assignment_library_and_deliveries.sql
git diff --check
```

Expected: every required identifier is present and diff check exits 0.

- [ ] **Step 8: Commit**

```powershell
git add backend/src/database/schema.sql backend/src/database/migrations/004_assignment_library_and_deliveries.sql backend/src/services/assignmentLibraryRules.js backend/test/assignmentLibraryRules.test.js
git commit -m "feat: add assignment library delivery schema"
```

---

### Task 2: Kho bài tập backend

**Files:**
- Create: `backend/src/services/assignmentLibraryService.js`
- Create: `backend/src/controllers/assignmentLibraryController.js`
- Create: `backend/test/assignmentLibraryService.test.js`
- Modify: `backend/src/routes/index.js`

**Interfaces:**
- Produces: `createAssignmentLibraryService(supabaseClient)`
- Produces methods:

```js
{
  list({ teacherId, category }),
  create({ teacherId, input }),
  get({ teacherId, assignmentId }),
  update({ teacherId, assignmentId, input }),
  replaceTestCases({ teacherId, assignmentId, testCases })
}
```

- Produces routes:
  - `GET /api/assignment-library`
  - `POST /api/assignment-library`
  - `GET /api/assignment-library/:id`
  - `PATCH /api/assignment-library/:id`
  - `POST /api/assignment-library/:id/test-cases`

- [ ] **Step 1: Write failing service tests**

Use a fluent Supabase fake and assert:

- list filters `teacher_id`, `is_library=true`, category;
- create sets teacher/category/version;
- update cannot change `teacher_id`;
- scoring-field update increments `content_version`;
- title-only update does not mark submissions;
- replacing tests recalculates max score, increments version and marks submissions on linked deliveries `required`.

The version assertions:

```js
assert.deepEqual(
  {
    starter_code: updatePayload.starter_code,
    content_version: updatePayload.content_version,
  },
  {
  starter_code: 'print(2)',
  content_version: 3,
  }
);
assert.match(updatePayload.updated_at, /^\d{4}-\d{2}-\d{2}T/);
```

- [ ] **Step 2: Run tests and verify RED**

Run `npm.cmd test -- test/assignmentLibraryService.test.js`.

Expected: module missing.

- [ ] **Step 3: Implement service factory**

Keep all Supabase calls behind `createAssignmentLibraryService`. Define:

```js
const SCORING_FIELDS = new Set([
  'starter_code', 'setup_sql', 'test_code', 'solution_code', 'max_score',
]);
```

When scoring content or test cases change:

1. increment version;
2. select linked delivery IDs for the assignment;
3. update submissions for those IDs to `{ regrade_status: 'required', regrade_error: null }`.

Use owner filters on every read/update.

- [ ] **Step 4: Run service tests and verify GREEN**

Run `npm.cmd test -- test/assignmentLibraryService.test.js`.

Expected: all PASS.

- [ ] **Step 5: Add controllers and routes**

Controller validation:

```js
const CATEGORIES = ['grade_10', 'grade_11', 'grade_12', 'advanced'];
const TYPES = ['python', 'sql', 'html'];
```

Return `400` for invalid category/type, `404` for missing owned assignment and `201` on create. Register teacher-only routes before `/api/assignments/:id`.

- [ ] **Step 6: Run all backend tests and commit**

Run `npm.cmd test`.

Expected: all backend tests PASS.

Commit:

```powershell
git add backend/src/services/assignmentLibraryService.js backend/src/controllers/assignmentLibraryController.js backend/src/routes/index.js backend/test/assignmentLibraryService.test.js
git commit -m "feat: add teacher assignment library API"
```

---

### Task 3: Giao bài nhiều lớp và detach

**Files:**
- Create: `backend/src/services/assignmentDeliveryService.js`
- Create: `backend/src/controllers/assignmentDeliveryController.js`
- Create: `backend/test/assignmentDeliveryService.test.js`
- Modify: `backend/src/routes/index.js`

**Interfaces:**
- Consumes: `eligibleClassesForAssignment`, `validateDeliveryTargets`
- Produces: `createAssignmentDeliveryService(supabaseClient)`
- Produces methods:

```js
{
  deliver({ teacherId, assignmentId, deliveries }),
  listForTemplate({ teacherId, assignmentId }),
  updateDelivery({ teacherId, deliveryId, input }),
  detach({ teacherId, deliveryId })
}
```

- [ ] **Step 1: Write failing delivery tests**

Test these real behaviors through the service factory:

- validates all target classes before the first insert;
- inserts different due/publish/max settings per class;
- `recipient_mode=all` creates no recipient rows;
- selected mode inserts only enrolled student IDs;
- partial database failure deletes the incomplete delivery;
- duplicate `(library_assignment_id,class_id)` returns a clear conflict;
- detach clones content/test cases, updates only the selected delivery, and rolls back the clone if test copy fails.

- [ ] **Step 2: Run tests and verify RED**

Run `npm.cmd test -- test/assignmentDeliveryService.test.js`.

Expected: module missing.

- [ ] **Step 3: Implement deliver**

Load owned template, all target classes and enrollments in bounded queries. Validate before writes. For each delivery:

```js
{
  library_assignment_id: assignment.id,
  assignment_id: assignment.id,
  class_id: item.class_id,
  teacher_id: teacherId,
  sync_mode: 'linked',
  recipient_mode: item.recipient_mode,
  due_date: item.due_date || null,
  is_published: Boolean(item.is_published),
  max_submissions: item.max_submissions ?? null,
}
```

Return `{ created, failed, failures }`. Clean delivery if recipient insert fails.

- [ ] **Step 4: Implement update and detach**

`updateDelivery` may change only delivery settings and recipients. `detach` clones assignment/test cases with `is_library=false`, `source_assignment_id=library_assignment_id`, updates delivery to cloned `assignment_id`, and deletes the clone on failure.

- [ ] **Step 5: Add controller/routes**

Routes:

- `POST /api/assignment-library/:id/deliver`
- `GET /api/assignment-library/:id/deliveries`
- `PATCH /api/assignment-deliveries/:id`
- `POST /api/assignment-deliveries/:id/detach`

Validate `deliveries` is a non-empty array.

- [ ] **Step 6: Verify and commit**

Run `npm.cmd test`.

Expected: all backend tests PASS.

Commit:

```powershell
git add backend/src/services/assignmentDeliveryService.js backend/src/controllers/assignmentDeliveryController.js backend/src/routes/index.js backend/test/assignmentDeliveryService.test.js
git commit -m "feat: deliver assignments to classes and selected students"
```

---

### Task 4: Quyền học sinh, submit và regrade

**Files:**
- Create: `backend/src/services/studentAssignmentService.js`
- Create: `backend/src/controllers/studentAssignmentController.js`
- Create: `backend/test/studentAssignmentService.test.js`
- Modify: `backend/src/services/submissionService.js`
- Modify: `backend/src/controllers/submissionController.js`
- Modify: `backend/src/routes/index.js`

**Interfaces:**
- Produces: `createStudentAssignmentService(supabaseClient)`
- Produces methods:

```js
{
  listMine({ userId, status }),
  getDelivery({ userId, deliveryId }),
  submit({ userId, deliveryId, code, results }),
  prepareRegrade({ userId, submissionId }),
  completeRegrade({ userId, submissionId, results })
}
```

- [ ] **Step 1: Write failing access tests**

Test:

- enrolled student sees published `all` delivery;
- selected student sees selected delivery;
- unselected classmate cannot list/get/submit;
- draft delivery is hidden;
- status partitions pending/submitted/overdue/regrade;
- max submissions is checked per delivery;
- complete regrade computes new score, version and clears status;
- failed/incomplete results keep old score.

- [ ] **Step 2: Run tests and verify RED**

Run `npm.cmd test -- test/studentAssignmentService.test.js`.

Expected: module missing.

- [ ] **Step 3: Implement recipient-aware queries**

Use one delivery query with class enrollment and recipients. Apply access rule in a pure helper:

```js
const canReceive = (delivery, userId) =>
  delivery.recipient_mode === 'all'
  || delivery.assignment_recipients.some((row) => row.user_id === userId);
```

Never return `solution_code` to students.

- [ ] **Step 4: Implement submit/regrade compatibility**

Move scoring calculation into:

```js
export const scoreResults = (testCases, results) => ({
  score,
  maxScore,
  rows,
});
```

New submissions store both `delivery_id` and `assignment_id`. `prepareRegrade` returns saved code plus current tests only when `regrade_status` is `required` or `failed`. `completeRegrade` updates score/results/version only after all expected test results are supplied.

- [ ] **Step 5: Register APIs**

- `GET /api/my-assignments`
- `GET /api/assignment-deliveries/:id`
- `POST /api/assignment-deliveries/:id/submit`
- `GET /api/submissions/:id/regrade`
- `POST /api/submissions/:id/regrade`

Keep legacy submit/detail endpoints during migration.

- [ ] **Step 6: Run backend tests and commit**

Run `npm.cmd test`.

Expected: all backend tests PASS.

Commit:

```powershell
git add backend/src/services/studentAssignmentService.js backend/src/controllers/studentAssignmentController.js backend/src/services/submissionService.js backend/src/controllers/submissionController.js backend/src/routes/index.js backend/test/studentAssignmentService.test.js
git commit -m "feat: enforce assignment recipients and regrade status"
```

---

### Task 5: Điều hướng và Kho bài tập giáo viên

**Files:**
- Create: `frontend/src/pages/AssignmentLibrary.jsx`
- Create: `frontend/src/utils/assignmentLibrary.js`
- Create: `frontend/test/assignmentLibrary.test.js`
- Modify: `frontend/src/components/Layout.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/pages/CreateAssignment.jsx`

**Interfaces:**
- Produces: `categoryForGrade(grade): string`
- Produces: `eligibleTargetClasses(assignment, classes): Class[]`
- Route: `/assignments`
- Routes: `/assignments/new`, `/assignments/:assignmentId/edit`

- [ ] **Step 1: Write failing frontend utility tests**

Test category mapping, advanced subject filtering, grade filtering and immutable input arrays.

- [ ] **Step 2: Run and verify RED**

Run `npm.cmd test -- test/assignmentLibrary.test.js`.

Expected: module missing.

- [ ] **Step 3: Implement utilities and verify GREEN**

Implement exact category mapping and filter parity with backend. Run `npm.cmd test`.

- [ ] **Step 4: Add navigation and routes**

Add `{ label: 'Bài tập', path: '/assignments' }` immediately after class menu for both roles. Teacher route renders `AssignmentLibrary`; student route will be wired in Task 7 via a role-aware page.

- [ ] **Step 5: Build AssignmentLibrary**

The page must:

- render tabs with stable keys `grade_10`, `grade_11`, `grade_12`, `advanced`;
- fetch `/api/assignment-library?category=${activeCategory}`;
- show title/type/max score/version/delivery count;
- provide Create, Edit, Deliver, View deliveries actions;
- use loading, empty and error states from existing components.

- [ ] **Step 6: Adapt CreateAssignment**

Add library mode based on route. In library mode send `category`, omit `class_id`, and use new library endpoints. Keep legacy class routes working until Task 8.

- [ ] **Step 7: Test/build and commit**

Run:

```powershell
cd frontend
npm.cmd test
npm.cmd run build
```

Expected: tests PASS and build exits 0.

Commit:

```powershell
git add frontend/src/pages/AssignmentLibrary.jsx frontend/src/utils/assignmentLibrary.js frontend/test/assignmentLibrary.test.js frontend/src/components/Layout.jsx frontend/src/App.jsx frontend/src/pages/CreateAssignment.jsx
git commit -m "feat: add teacher assignment library interface"
```

---

### Task 6: Cửa sổ giao bài và quản lý delivery

**Files:**
- Create: `frontend/src/components/AssignmentDeliveryModal.jsx`
- Create: `frontend/src/components/AssignmentDeliveryList.jsx`
- Create: `frontend/src/utils/deliveryForm.js`
- Create: `frontend/test/deliveryForm.test.js`
- Modify: `frontend/src/pages/AssignmentLibrary.jsx`

**Interfaces:**
- Produces: `buildDeliveryPayload(classSelections): { deliveries: DeliveryInput[] }`
- Produces component props:

```js
AssignmentDeliveryModal({
  assignment,
  classes,
  open,
  onClose,
  onDelivered,
})
```

- [ ] **Step 1: Write failing payload tests**

Assert different class configurations remain independent and selected student IDs are deduplicated. Assert selected mode without students throws.

- [ ] **Step 2: Run RED, implement utility, run GREEN**

Run `npm.cmd test -- test/deliveryForm.test.js`, implement `deliveryForm.js`, rerun.

- [ ] **Step 3: Implement modal**

Fetch eligible classes once. For expanded class rows fetch `/api/classes/:id/students`. Each class row owns:

```js
{
  selected: false,
  recipient_mode: 'all',
  student_ids: [],
  due_date: '',
  is_published: false,
  max_submissions: null,
}
```

Provide search, select-all students, per-class errors and aggregate submission result.

- [ ] **Step 4: Implement delivery list**

Show class, recipient summary, due date, publish, sync mode and actions Edit/Detach. Require confirmation before detach because future source updates stop applying.

- [ ] **Step 5: Verify and commit**

Run frontend tests/build.

Commit:

```powershell
git add frontend/src/components/AssignmentDeliveryModal.jsx frontend/src/components/AssignmentDeliveryList.jsx frontend/src/utils/deliveryForm.js frontend/test/deliveryForm.test.js frontend/src/pages/AssignmentLibrary.jsx
git commit -m "feat: add multi-class targeted assignment delivery UI"
```

---

### Task 7: Trang Bài tập học sinh và chấm lại khi mở

**Files:**
- Create: `frontend/src/pages/MyAssignments.jsx`
- Create: `frontend/src/utils/studentAssignmentStatus.js`
- Create: `frontend/test/studentAssignmentStatus.test.js`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/pages/CodingEditor.jsx`
- Modify: `frontend/src/pages/SqlEditor.jsx`
- Modify: `frontend/src/pages/HtmlEditor.jsx`
- Modify: `frontend/src/pages/PythonPractice.jsx`
- Modify: `frontend/src/pages/SQLPractice.jsx`
- Modify: `frontend/src/pages/HTMLPractice.jsx`

**Interfaces:**
- Produces: `assignmentStatus(delivery, latestSubmission, now): 'pending'|'submitted'|'overdue'|'regrade'`
- Produces: `runPendingRegrade({ submission, assignment, runner }): Promise<RegradeResult>`

- [ ] **Step 1: Write failing status tests**

Use fixed ISO timestamps and assert precedence: `regrade` before submitted, overdue only when incomplete, pending otherwise.

- [ ] **Step 2: Run RED, implement status utility, run GREEN**

Run `npm.cmd test -- test/studentAssignmentStatus.test.js`; implement and rerun.

- [ ] **Step 3: Build MyAssignments**

Fetch `/api/my-assignments` once. Render tabs Cần làm/Đã nộp/Quá hạn/Cần chấm lại with counts, class name, due date, score and correct editor link by type.

- [ ] **Step 4: Adapt editor entry**

All editors accept `deliveryId` route param and fetch delivery detail. Submission posts to delivery endpoint. Preserve old assignment route support until Task 8.

- [ ] **Step 5: Add browser regrade flow**

When detail returns a submission with `regrade_status=required`:

1. fetch `/api/submissions/:id/regrade`;
2. run saved code through the same existing Python/SQL/HTML runner;
3. post complete results;
4. show “Đã chấm lại” or a retryable error;
5. never clear the old displayed score until success.

- [ ] **Step 6: Verify and commit**

Run frontend tests and production build.

Commit:

```powershell
git add frontend/src/pages/MyAssignments.jsx frontend/src/utils/studentAssignmentStatus.js frontend/test/studentAssignmentStatus.test.js frontend/src/App.jsx frontend/src/pages/CodingEditor.jsx frontend/src/pages/SqlEditor.jsx frontend/src/pages/HtmlEditor.jsx frontend/src/pages/PythonPractice.jsx frontend/src/pages/SQLPractice.jsx frontend/src/pages/HTMLPractice.jsx
git commit -m "feat: add student assignment inbox and browser regrade"
```

---

### Task 8: Chuyển luồng lớp học, bảng điểm và thống kê sang delivery

**Files:**
- Modify: `backend/src/services/assignmentService.js`
- Modify: `backend/src/services/submissionService.js`
- Modify: `backend/src/services/statsService.js`
- Modify: `backend/src/services/topRankService.js`
- Modify: `frontend/src/pages/ClassDetail.jsx`
- Modify: `frontend/src/pages/Dashboard.jsx`
- Create: `backend/test/deliveryCompatibility.test.js`

**Interfaces:**
- Preserves existing class assignment list and gradebook response shapes.
- Changes identifiers returned to UI to include both `assignment_id` and `delivery_id`.

- [ ] **Step 1: Write failing compatibility tests**

Test:

- class assignment list is sourced from deliveries;
- teacher sees draft deliveries, student sees only authorized published deliveries;
- gradebook columns are deliveries;
- stats count deliveries, not detached content rows;
- top rank aggregates submissions by delivery without double counting.

- [ ] **Step 2: Run tests and verify RED**

Run `npm.cmd test -- test/deliveryCompatibility.test.js`.

Expected: current services query `assignments.class_id` and tests fail.

- [ ] **Step 3: Update backend compatibility queries**

Replace class-scoped assignment reads with:

```text
assignment_deliveries
  -> assignments via assignment_id
  -> assignment_recipients for selected access
```

Return flattened display fields plus `delivery_id`, `assignment_id`, delivery settings and sync mode.

- [ ] **Step 4: Update ClassDetail**

The class Bài tập tab becomes a delivery view. “Thêm bài tập” navigates to `/assignments` with the class preselected. Edit delivery settings and detach from this tab; content edit navigates to the library or detached content editor.

- [ ] **Step 5: Optimize Dashboard**

Replace the student N+1 assignment/submission calls with one `/api/my-assignments` request and aggregate counts by class in memory.

- [ ] **Step 6: Verify and commit**

Run backend tests, frontend tests and frontend build.

Commit:

```powershell
git add backend/src/services/assignmentService.js backend/src/services/submissionService.js backend/src/services/statsService.js backend/src/services/topRankService.js backend/test/deliveryCompatibility.test.js frontend/src/pages/ClassDetail.jsx frontend/src/pages/Dashboard.jsx
git commit -m "refactor: use deliveries across classes and gradebooks"
```

---

### Task 9: Migration verification, security audit and production readiness

**Files:**
- Modify if required by verification: only files already introduced above.

- [ ] **Step 1: Run full automated verification**

```powershell
cd backend
npm.cmd test
cd ..\frontend
npm.cmd test
npm.cmd run build
```

Expected: zero failing tests; Vite exits 0.

- [ ] **Step 2: Review authorization paths**

Search:

```powershell
rg -n "assignment_deliveries|assignment_recipients|delivery_id" backend/src
```

For every student GET/submit/regrade path, confirm enrollment + recipient + publish checks happen server-side. Add a regression test before fixing any gap.

- [ ] **Step 3: Verify migration on a disposable Supabase branch/project**

Run migration `004` twice. Query:

```sql
SELECT COUNT(*) FROM assignments;
SELECT COUNT(*) FROM test_cases;
SELECT COUNT(*) FROM submissions;
SELECT COUNT(*) FROM assignment_deliveries;
SELECT COUNT(*) FROM submissions WHERE delivery_id IS NULL;
```

Expected: source counts unchanged, one delivery per legacy assignment, zero legacy submissions without delivery, second migration creates no duplicates.

- [ ] **Step 4: Manual role flows**

Verify with one teacher, two same-grade classes and three students:

1. create a grade assignment and an advanced assignment;
2. deliver to one whole class and two selected students in another;
3. confirm unselected student cannot see/direct-open the delivery;
4. edit linked test case and confirm submissions become Cần chấm lại;
5. open as selected student and confirm browser regrade clears status;
6. detach one delivery, edit source, confirm detached content stays unchanged;
7. verify gradebook/export/top-rank remain correct.

- [ ] **Step 5: Inspect final branch**

```powershell
git diff origin/main --check
git status --short
git log --oneline origin/main..HEAD
```

Expected: clean worktree and only planned commits.

- [ ] **Step 6: Request code review and report deploy prerequisites**

Report test counts, migration evidence, manual flow evidence and the requirement to run migration `004` before backend deployment. Do not deploy database or production without explicit approval at action time.
