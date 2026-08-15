# AI Student Analysis and Teacher Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép giáo viên tạo tác vụ phân tích AI cho từng học sinh, nhận hai bản nhận xét có dẫn chứng, chỉnh sửa và duyệt hoặc công bố kết quả.

**Architecture:** Express tạo một job bền vững trong Supabase rồi trả về ngay; một worker có khóa lease tổng hợp gói bằng chứng ẩn danh, gọi OpenRouter và fallback Gemini, kiểm tra schema/dẫn chứng rồi lưu report bản nháp. Giao diện hồ sơ năng lực thăm dò trạng thái job và cung cấp màn hình kiểm duyệt, trong khi mọi kiểm tra quyền vẫn nằm ở backend.

**Tech Stack:** Node.js ES modules, Express 4, Supabase/Postgres, React 18, Axios, `node:test`, OpenRouter API, Google Gemini API.

## Global Constraints

- Phân tích từng học sinh theo yêu cầu; mặc định 5 bài gần nhất, tùy chọn 3, 10 hoặc khoảng ngày.
- Ngưỡng khuyến nghị: ít nhất 2 bài nộp và 4 kết quả test; dữ liệu thấp hơn cần `confirm_sparse_data: true`.
- Điểm, mức thành thạo và xu hướng do hệ thống tính; AI không được sửa.
- Không gửi họ tên, tài khoản, email, tên lớp, tên trường, thông tin giáo viên hoặc dữ liệu học sinh khác cho AI.
- Mọi kết luận phải tham chiếu mã bằng chứng tồn tại; thiếu dữ liệu phải nêu rõ, không suy đoán đặc điểm cá nhân.
- OpenRouter mặc định; Gemini chỉ fallback với lỗi nhà cung cấp đủ điều kiện.
- Giáo viên phải duyệt trước khi công bố; nội dung AI gốc không bị ghi đè.
- Không thêm queue service hoặc dependency mới trong phase này; worker dùng Postgres lease và chạy trong tiến trình backend.
- Các tệp chưa theo dõi hiện có của người dùng không thuộc phạm vi và không được stage.

---

## File Structure

### Backend — create

- `backend/src/database/migrations/011_student_ai_analysis.sql`: bảng jobs, reports, audit events, RLS, index và hàm nhận job có lease.
- `backend/src/ai/studentAnalysisSchema.js`: JSON schema và version của kết quả phân tích.
- `backend/src/ai/studentAnalysisPrompt.js`: system/user prompt, repair prompt và danh sách phát biểu cấm.
- `backend/src/ai/studentAnalysisValidator.js`: chuẩn hóa JSON, kiểm tra độ dài và mã dẫn chứng.
- `backend/src/services/studentEvidenceService.js`: quyền sở hữu lớp, chọn submissions, ẩn danh và tạo evidence fingerprint.
- `backend/src/services/studentAnalysisGateway.js`: OpenRouter → repair → Gemini với phân loại lỗi.
- `backend/src/services/studentAnalysisService.js`: tạo/list/get/review/publish/retry job và report.
- `backend/src/services/studentAnalysisWorker.js`: claim lease, xử lý job idempotent và đánh dấu stale.
- `backend/src/controllers/studentAnalysisController.js`: adapter HTTP có thể dependency-inject để test.
- `backend/test/studentEvidenceService.test.js`: kiểm tra chọn dữ liệu, ngưỡng và loại PII.
- `backend/test/studentAnalysisValidator.test.js`: kiểm tra schema, evidence refs và nội dung cấm.
- `backend/test/studentAnalysisGateway.test.js`: kiểm tra repair/fallback/phân loại lỗi.
- `backend/test/studentAnalysisService.test.js`: kiểm tra quyền, chống trùng, review và publish.
- `backend/test/studentAnalysisWorker.test.js`: kiểm tra lease/idempotency/failure.
- `backend/test/studentAnalysisController.test.js`: kiểm tra ánh xạ request đã xác thực.

### Backend — modify

- `backend/src/routes/index.js`: thêm API giáo viên cho preview, jobs, reports, review, publish, retry.
- `backend/src/app.js`: khởi động/dừng worker interval có `unref()` và tắt bằng biến môi trường khi test.
- `backend/src/database/schema.sql`: đồng bộ schema mới cho cài đặt sạch.
- `backend/.env.example`: cấu hình interval, lease, giới hạn payload; không thêm khóa thật.

### Frontend — create

- `frontend/src/components/StudentAIAnalysisPanel.jsx`: chọn phạm vi, preview, tiến độ và lịch sử báo cáo.
- `frontend/src/components/StudentAIReportReview.jsx`: hiển thị hai bản, dẫn chứng, chỉnh sửa, duyệt/công bố.
- `frontend/src/utils/studentAnalysis.js`: state labels, polling policy và payload builders thuần.
- `frontend/test/studentAnalysis.test.js`: test utility bằng `node:test`.

### Frontend — modify

- `frontend/src/components/ClassCompetencyDashboard.jsx`: nhúng panel vào modal hồ sơ, tái sử dụng mở bài nộp.

---

### Task 1: Persisted job and report schema

**Files:**
- Create: `backend/src/database/migrations/011_student_ai_analysis.sql`
- Modify: `backend/src/database/schema.sql`
- Test: migration assertions executed against the linked Supabase project after local tests

**Interfaces:**
- Produces: tables `student_analysis_jobs`, `student_analysis_reports`, `student_analysis_events`; RPC `claim_student_analysis_job(p_worker_id text, p_lease_seconds int)`.
- Status values: `queued`, `preparing_evidence`, `analyzing`, `awaiting_review`, `approved_internal`, `published`, `failed`, `rejected`, `stale`, `withdrawn`.

- [ ] **Step 1: Write the migration with exact constraints**

```sql
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
```

Add reports with `ai_teacher_report jsonb NOT NULL`, `ai_student_report jsonb NOT NULL`, nullable edited equivalents, `schema_version`, reviewer/publisher timestamps, and a unique `job_id`. Add event rows with `event_type`, actor, and metadata that excludes full evidence/prompt text.

- [ ] **Step 2: Add RLS and service-role grants**

```sql
ALTER TABLE student_analysis_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_analysis_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_analysis_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON student_analysis_jobs, student_analysis_reports, student_analysis_events FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON student_analysis_jobs, student_analysis_reports, student_analysis_events TO service_role;
```

- [ ] **Step 3: Add atomic claim RPC**

Use `FOR UPDATE SKIP LOCKED` to select one due queued job or one expired leased job, set `preparing_evidence`, increment attempts, assign owner/expiry, and return the row. Revoke execute from public/anon/authenticated and grant service role only.

- [ ] **Step 4: Mirror the migration in clean-install schema**

Append the same tables, indexes, RLS and grants to `backend/src/database/schema.sql`; keep the RPC only in the numbered migration if the existing clean-install file does not define functions.

- [ ] **Step 5: Verify SQL text and commit**

Run: `rg -n "student_analysis_jobs|SKIP LOCKED|ENABLE ROW LEVEL SECURITY|uq_student_analysis_active" backend/src/database/migrations/011_student_ai_analysis.sql backend/src/database/schema.sql`

Expected: both schema files contain tables/RLS; migration contains lease RPC and partial unique index.

```bash
git add backend/src/database/migrations/011_student_ai_analysis.sql backend/src/database/schema.sql
git commit -m "feat: add persisted student analysis jobs"
```

### Task 2: Evidence selection, anonymization, and fingerprint

**Files:**
- Create: `backend/src/services/studentEvidenceService.js`
- Create: `backend/test/studentEvidenceService.test.js`

**Interfaces:**
- Produces: `createStudentEvidenceService(db)`.
- Method: `preview({ teacherId, classId, studentId, scope }) -> { counts, sparse, submissions }` where preview does not return code.
- Method: `buildBundle({ teacherId, classId, studentId, scope, confirmSparseData }) -> { bundle, counts, fingerprint }`.
- Scope union: `{ mode: 'latest', limit: 3|5|10 }` or `{ mode: 'dates', from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }`.

- [ ] **Step 1: Write failing unit tests using a chainable fake Supabase client**

Cover: teacher must own class; student must be enrolled; latest limit is enforced; date range is inclusive; preview omits `code`, email and names; bundle uses `STUDENT_01`; each result receives `E01...`; fewer than 2 submissions or 4 test results throws `SPARSE_EVIDENCE_CONFIRMATION_REQUIRED` unless confirmed; fingerprint changes when a selected submission/result changes.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `cd backend; node --test test/studentEvidenceService.test.js`

Expected: FAIL because `studentEvidenceService.js` does not exist.

- [ ] **Step 3: Implement scope validation and deterministic selection**

```js
export const normalizeAnalysisScope = (scope = {}) => {
  if (scope.mode === 'dates') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(scope.from ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(scope.to ?? '') || scope.from > scope.to) {
      throw Object.assign(new Error('Khoảng ngày không hợp lệ.'), { code: 'INVALID_ANALYSIS_SCOPE' });
    }
    return { mode: 'dates', from: scope.from, to: scope.to };
  }
  const limit = Number(scope.limit ?? 5);
  if (![3, 5, 10].includes(limit)) throw Object.assign(new Error('Số bài không hợp lệ.'), { code: 'INVALID_ANALYSIS_SCOPE' });
  return { mode: 'latest', limit };
};
```

- [ ] **Step 4: Implement bundle projection and fingerprint**

Create evidence records containing only assignment id/title/type/description, submitted timestamp, code, system score/mastery/trend, competency code/name, test expected/actual/error and generated evidence id. Hash the normalized scope plus selected submission/result ids and timestamps with SHA-256. Never select email/username/full_name in the bundle query.

- [ ] **Step 5: Run tests and commit**

Run: `cd backend; node --test test/studentEvidenceService.test.js`

Expected: all evidence tests PASS.

```bash
git add backend/src/services/studentEvidenceService.js backend/test/studentEvidenceService.test.js
git commit -m "feat: build anonymized student evidence bundles"
```

### Task 3: Analysis schema, prompt, and local validator

**Files:**
- Create: `backend/src/ai/studentAnalysisSchema.js`
- Create: `backend/src/ai/studentAnalysisPrompt.js`
- Create: `backend/src/ai/studentAnalysisValidator.js`
- Create: `backend/test/studentAnalysisValidator.test.js`

**Interfaces:**
- Produces: `STUDENT_ANALYSIS_SCHEMA`, `STUDENT_ANALYSIS_SCHEMA_VERSION = '1.0'`, `STUDENT_ANALYSIS_PROMPT_VERSION = '1.0'`.
- Produces: `buildStudentAnalysisPrompt(bundle)` and `buildStudentAnalysisRepairPrompt({ bundle, invalidOutput, issues })`.
- Produces: `validateStudentAnalysis(value, allowedEvidenceIds) -> { teacher_report, student_report }`.

- [ ] **Step 1: Write failing validator tests**

Use a valid fixture with teacher summary, 2 strengths, 2 reinforcement areas, common errors, trends, insufficient evidence, 2 goals and warnings; student report has doing well, practice, two-week goals and steps. Assert rejection for unknown `E99`, missing refs on a conclusion, more than 4 strengths, empty required text, PII fields, and phrases matching banned trait/attitude claims.

- [ ] **Step 2: Run focused tests to verify red state**

Run: `cd backend; node --test test/studentAnalysisValidator.test.js`

Expected: FAIL because schema/validator modules do not exist.

- [ ] **Step 3: Define the strict schema**

Every evidence-bearing item has `{ text: string, evidence_refs: string[], confidence: 'low'|'medium'|'high' }`. Set array min/max explicitly and `additionalProperties: false` at every object level. Keep student-facing output free of internal warnings and confidence fields.

- [ ] **Step 4: Implement prompt safety instructions**

Prompt must say: use only supplied evidence; never infer attitude/intelligence/personality/circumstance; do not change numeric mastery; cite refs; use “Chưa đủ dữ liệu để kết luận” when necessary; return JSON only. Repair prompt includes validation issues and invalid JSON but not any PII.

- [ ] **Step 5: Implement validator and tests**

Parse string/object input, normalize whitespace, enforce lengths/counts, recursively collect refs, require all refs in `allowedEvidenceIds`, reject keys or text resembling email/username/full name labels, and reject configured Vietnamese/English trait claims.

Run: `cd backend; node --test test/studentAnalysisValidator.test.js`

Expected: all validator tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/ai/studentAnalysisSchema.js backend/src/ai/studentAnalysisPrompt.js backend/src/ai/studentAnalysisValidator.js backend/test/studentAnalysisValidator.test.js
git commit -m "feat: validate evidence-grounded student analysis"
```

### Task 4: OpenRouter-first analysis gateway

**Files:**
- Create: `backend/src/services/studentAnalysisGateway.js`
- Create: `backend/test/studentAnalysisGateway.test.js`
- Reuse: `backend/src/ai/providers/openRouterProvider.js`
- Reuse: `backend/src/ai/providers/geminiProvider.js`

**Interfaces:**
- Produces: `createStudentAnalysisGateway({ openRouter, gemini, timeoutMs })`.
- Method: `generate(bundle) -> { analysis, provider, model, usage, fallback_used }`.
- Error codes: `AI_CONFIGURATION_ERROR`, `AI_PROVIDER_ERROR`, `AI_ANALYSIS_INVALID`.

- [ ] **Step 1: Write gateway tests**

Assert call order: valid OpenRouter stops immediately; invalid OpenRouter gets one OpenRouter repair; provider/timeout/429/5xx or still-invalid repair falls back to Gemini; 400/401/403 and invalid local bundle do not fallback; Gemini invalid result throws safe final error.

- [ ] **Step 2: Verify tests fail**

Run: `cd backend; node --test test/studentAnalysisGateway.test.js`

Expected: FAIL because gateway does not exist.

- [ ] **Step 3: Implement explicit fallback classifier**

```js
export const isFallbackEligible = (error) =>
  error?.code === 'AI_PROVIDER_ERROR' ||
  error?.code === 'AI_ANALYSIS_INVALID' ||
  error?.status === 408 || error?.status === 429 || error?.status >= 500;
```

Do not reuse `generateAssignment`; reuse only providers' `generateStructured` contract. Apply timeout with `AbortController`, schema sanitization remains inside each provider.

- [ ] **Step 4: Run tests and commit**

Run: `cd backend; node --test test/studentAnalysisGateway.test.js test/aiGateway.test.js`

Expected: both analysis and existing assignment gateway tests PASS.

```bash
git add backend/src/services/studentAnalysisGateway.js backend/test/studentAnalysisGateway.test.js
git commit -m "feat: add resilient student analysis gateway"
```

### Task 5: Job lifecycle and teacher review service

**Files:**
- Create: `backend/src/services/studentAnalysisService.js`
- Create: `backend/test/studentAnalysisService.test.js`

**Interfaces:**
- Produces: `createStudentAnalysisService({ db, evidenceService })`.
- Methods: `preview`, `createJob`, `listReports`, `getJob`, `getReport`, `reviewReport`, `publishReport`, `retryJob`.
- Review input: `{ teacher_report, student_report, decision: 'approved_internal'|'published'|'rejected', instruction?: string }`.

- [ ] **Step 1: Write service tests**

Test ownership/enrollment delegation, scope normalization, sparse confirmation, reuse of awaiting/approved report with same fingerprint, DB unique-conflict mapped to `ANALYSIS_ALREADY_RUNNING`, edited report stored separately, publish requires reviewed content, rejected retry creates a new job linked through an event, and list/get never returns another class's records.

- [ ] **Step 2: Run focused tests to confirm failure**

Run: `cd backend; node --test test/studentAnalysisService.test.js`

Expected: FAIL because service does not exist.

- [ ] **Step 3: Implement lifecycle transaction boundaries**

Create job only after evidence preview/confirmation. On review, update report edited fields and job status, then append event. Keep `ai_*` fields immutable. Map database code `23505` from the partial unique index to HTTP-safe domain error.

- [ ] **Step 4: Run service tests and commit**

Run: `cd backend; node --test test/studentAnalysisService.test.js`

Expected: all lifecycle tests PASS.

```bash
git add backend/src/services/studentAnalysisService.js backend/test/studentAnalysisService.test.js
git commit -m "feat: manage student analysis review lifecycle"
```

### Task 6: Lease worker and application wiring

**Files:**
- Create: `backend/src/services/studentAnalysisWorker.js`
- Create: `backend/test/studentAnalysisWorker.test.js`
- Modify: `backend/src/app.js`
- Modify: `backend/.env.example`

**Interfaces:**
- Produces: `createStudentAnalysisWorker({ db, evidenceService, gateway, workerId, leaseSeconds, maxAttempts, now })`.
- Methods: `runOnce() -> { claimed: boolean, jobId?: string, status?: string }`; `start({ intervalMs }) -> stop()`.

- [ ] **Step 1: Write worker tests**

Assert no-op when claim RPC returns no job; success advances preparing → analyzing → awaiting_review and inserts one report; same job does not insert a second report; sparse/invalid input fails without provider call; retryable provider error schedules exponential backoff until max attempts; terminal failure stores only safe error code; expired lease may be reclaimed.

- [ ] **Step 2: Verify red state**

Run: `cd backend; node --test test/studentAnalysisWorker.test.js`

Expected: FAIL because worker does not exist.

- [ ] **Step 3: Implement one-job worker**

Use RPC claim, rebuild evidence from stored scope, update fingerprint, mark analyzing, call gateway, upsert report on `job_id`, set awaiting_review and metrics. Backoff formula is `min(60_000 * 2 ** (attempt_count - 1), 900_000)` milliseconds.

- [ ] **Step 4: Wire worker lifecycle**

In `app.js`, start only when `AI_ANALYSIS_WORKER_ENABLED !== 'false'` and required AI config exists. Call `.unref()` on interval and stop on `SIGTERM`/`SIGINT`. Set defaults in `.env.example`:

```dotenv
AI_ANALYSIS_WORKER_ENABLED=true
AI_ANALYSIS_POLL_MS=5000
AI_ANALYSIS_LEASE_SECONDS=120
AI_ANALYSIS_MAX_ATTEMPTS=3
AI_ANALYSIS_MAX_CODE_CHARS=30000
```

- [ ] **Step 5: Run worker and regression tests, then commit**

Run: `cd backend; $env:AI_ANALYSIS_WORKER_ENABLED='false'; node --test test/studentAnalysisWorker.test.js test/aiGateway.test.js test/aiAssignmentService.test.js`

Expected: all selected tests PASS and process exits without a hanging timer.

```bash
git add backend/src/services/studentAnalysisWorker.js backend/test/studentAnalysisWorker.test.js backend/src/app.js backend/.env.example
git commit -m "feat: process student analysis jobs with leases"
```

### Task 7: Teacher analysis HTTP API

**Files:**
- Create: `backend/src/controllers/studentAnalysisController.js`
- Create: `backend/test/studentAnalysisController.test.js`
- Modify: `backend/src/routes/index.js`

**Interfaces:**
- Routes:
  - `POST /api/classes/:id/students/:studentId/ai-analysis/preview`
  - `POST /api/classes/:id/students/:studentId/ai-analysis/jobs`
  - `GET /api/classes/:id/students/:studentId/ai-analysis/jobs/:jobId`
  - `GET /api/classes/:id/students/:studentId/ai-analysis/reports`
  - `GET /api/classes/:id/students/:studentId/ai-analysis/reports/:reportId`
  - `PATCH /api/classes/:id/students/:studentId/ai-analysis/reports/:reportId/review`
  - `POST /api/classes/:id/students/:studentId/ai-analysis/jobs/:jobId/retry`

- [ ] **Step 1: Write controller mapping tests**

Assert `req.user.id` is always teacherId; class/student/job/report params are forwarded; create returns HTTP 202; validation/service errors call `next`; response never includes internal lease fields.

- [ ] **Step 2: Run test and confirm failure**

Run: `cd backend; node --test test/studentAnalysisController.test.js`

Expected: FAIL because controller does not exist.

- [ ] **Step 3: Implement injectable controller**

Follow `createCompetencyController(service)` pattern. Export factory for tests and a production instance composed from Supabase, evidence service and analysis service.

- [ ] **Step 4: Add authenticated teacher routes and validation**

Validate latest limits with `isIn([3,5,10])`, dates as ISO date, booleans for sparse confirmation, UUID params via `param(...).isUUID()`, review decision enum, and cap optional regeneration instruction at 2000 characters. Keep these routes before generic assignment routes.

- [ ] **Step 5: Run backend suite and commit**

Run: `cd backend; $env:AI_ANALYSIS_WORKER_ENABLED='false'; npm test`

Expected: all backend tests PASS with zero failures.

```bash
git add backend/src/controllers/studentAnalysisController.js backend/test/studentAnalysisController.test.js backend/src/routes/index.js
git commit -m "feat: expose teacher student-analysis API"
```

### Task 8: Frontend utilities and analysis panel

**Files:**
- Create: `frontend/src/utils/studentAnalysis.js`
- Create: `frontend/test/studentAnalysis.test.js`
- Create: `frontend/src/components/StudentAIAnalysisPanel.jsx`
- Modify: `frontend/src/components/ClassCompetencyDashboard.jsx`

**Interfaces:**
- Produces utilities: `buildScopePayload`, `analysisStatusLabel`, `shouldPollAnalysis`, `effectiveTeacherReport`, `effectiveStudentReport`.
- Panel props: `{ classId, studentId, onOpenSubmission }`.

- [ ] **Step 1: Write failing utility tests**

Test default/latest/date payloads, only active statuses poll, edited report wins over AI report, and Vietnamese labels exist for every status.

- [ ] **Step 2: Run focused frontend test and confirm failure**

Run: `cd frontend; node --test test/studentAnalysis.test.js`

Expected: FAIL because utility module does not exist.

- [ ] **Step 3: Implement pure utilities**

```js
export const ACTIVE_ANALYSIS_STATUSES = new Set(['queued', 'preparing_evidence', 'analyzing']);
export const shouldPollAnalysis = (status) => ACTIVE_ANALYSIS_STATUSES.has(status);
export const effectiveTeacherReport = (report) => report?.edited_teacher_report ?? report?.ai_teacher_report ?? null;
export const effectiveStudentReport = (report) => report?.edited_student_report ?? report?.ai_student_report ?? null;
```

- [ ] **Step 4: Implement panel behavior**

Render scope selector, preview counts, sparse warning confirmation, create button, status card and report history. Poll active job every 3 seconds; stop on unmount or terminal state. Disable duplicate submits. Show sanitized server message only. Pass report selection into review component in Task 9.

- [ ] **Step 5: Integrate into competency modal**

Place panel after current skill cards and before evidence list. Pass existing `openSubmission` callback so evidence links reuse the teacher-authorized submission endpoint.

- [ ] **Step 6: Run utility tests and build, then commit**

Run: `cd frontend; npm test`

Expected: all frontend unit tests PASS.

Run: `cd frontend; npm run build`

Expected: Vite build exits 0.

```bash
git add frontend/src/utils/studentAnalysis.js frontend/test/studentAnalysis.test.js frontend/src/components/StudentAIAnalysisPanel.jsx frontend/src/components/ClassCompetencyDashboard.jsx
git commit -m "feat: add teacher student-analysis panel"
```

### Task 9: Evidence-linked teacher review editor

**Files:**
- Create: `frontend/src/components/StudentAIReportReview.jsx`
- Modify: `frontend/src/components/StudentAIAnalysisPanel.jsx`
- Modify: `frontend/src/utils/studentAnalysis.js`
- Modify: `frontend/test/studentAnalysis.test.js`

**Interfaces:**
- Review props: `{ report, evidence, onOpenSubmission, onSaved }`.
- Emits exact API review body: `{ teacher_report, student_report, decision, instruction? }`.

- [ ] **Step 1: Extend utility tests for immutable edit cloning**

Add `createEditableReport(report)` tests proving nested arrays are cloned and edits do not mutate `ai_teacher_report`/`ai_student_report`.

- [ ] **Step 2: Run focused test to confirm failure**

Run: `cd frontend; node --test test/studentAnalysis.test.js`

Expected: FAIL because `createEditableReport` is absent.

- [ ] **Step 3: Implement review UI**

Provide tabs “Dành cho giáo viên” and “Dành cho học sinh”; editable text fields for each structured item; evidence chips resolving only known evidence refs; chip click calls `onOpenSubmission(evidence.submission_id)`; visible uncertainty warnings; buttons “Lưu nội bộ”, “Duyệt và công bố”, “Từ chối và phân tích lại”. Require regeneration instruction only for rejection.

- [ ] **Step 4: Preserve original AI content**

Initialize edits from effective report with a deep clone. Never assign to the report prop. After save, reload the report/history through `onSaved` and display reviewer timestamp/status.

- [ ] **Step 5: Run frontend verification and commit**

Run: `cd frontend; npm test`

Expected: all frontend tests PASS.

Run: `cd frontend; npm run build`

Expected: Vite build exits 0 without unresolved imports.

```bash
git add frontend/src/components/StudentAIReportReview.jsx frontend/src/components/StudentAIAnalysisPanel.jsx frontend/src/utils/studentAnalysis.js frontend/test/studentAnalysis.test.js
git commit -m "feat: review evidence-linked AI student reports"
```

### Task 10: Stale reports, migration verification, and end-to-end regression

**Files:**
- Modify: `backend/src/services/submissionService.js`
- Modify: `backend/test/studentAnalysisService.test.js`
- Modify: `README.md`
- Create: `backend/scripts/smoke-student-analysis.mjs`

**Interfaces:**
- Produces: `markStudentReportsStale({ db, classId, studentId, submittedAt })` called after a successful submission transaction.
- Smoke script accepts IDs only through environment variables and never prints student code or API keys.

- [ ] **Step 1: Write failing stale-transition test**

Given a published/approved report whose evidence cutoff predates a new submission, assert status becomes `stale`; awaiting/current jobs and reports from other class/student pairs remain unchanged.

- [ ] **Step 2: Run focused test and confirm failure**

Run: `cd backend; node --test test/studentAnalysisService.test.js --test-name-pattern="stale"`

Expected: FAIL because stale marker is not called.

- [ ] **Step 3: Implement stale marker after successful submission**

Call the helper only after the submission and results exist. Failure to mark stale should be logged safely and must not roll back or reject the student's successful submission.

- [ ] **Step 4: Add safe smoke script and documentation**

Document environment variables, worker states, fallback behavior, Gemini key requirement, teacher review rule and troubleshooting. Smoke script should create/observe a job for explicit `SMOKE_CLASS_ID` and `SMOKE_STUDENT_ID`, print only job id/status/provider, and exit nonzero on failure.

- [ ] **Step 5: Apply migration and verify database policy**

Apply `011_student_ai_analysis.sql` to the configured Supabase project. Query metadata to confirm all three tables have RLS enabled, anon/authenticated lack direct grants, service role has required access, partial active-job index exists, and claim RPC is not executable by public roles.

- [ ] **Step 6: Run full fresh verification**

Run: `cd backend; $env:AI_ANALYSIS_WORKER_ENABLED='false'; npm test`

Expected: zero backend failures.

Run: `cd frontend; npm test`

Expected: zero frontend failures.

Run: `cd frontend; npm run build`

Expected: build exits 0.

Run the smoke script once with OpenRouter. Test Gemini fallback only after a valid Gemini key is configured; otherwise record it as an external configuration blocker without exposing key data.

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/submissionService.js backend/test/studentAnalysisService.test.js backend/scripts/smoke-student-analysis.mjs README.md
git commit -m "docs: verify AI student analysis workflow"
```

---

## Definition of Done for Plan A

- A teacher can preview evidence and create exactly one active analysis job per student/class.
- The worker completes after page navigation and produces validated, evidence-linked teacher/student drafts.
- OpenRouter is primary; eligible failures fall back to Gemini without exposing secrets.
- A teacher can edit, approve internally, publish, reject/retry, and inspect history.
- A new submission marks older approved/published reports stale without deleting them.
- No direct student-facing endpoint is added in this plan; that is Plan B.
- No personalized learning-plan tables or activity assignment behavior is added in this plan; that is Plan C.
- Backend tests, frontend tests, frontend build, SQL security checks and OpenRouter smoke test pass with fresh evidence.
