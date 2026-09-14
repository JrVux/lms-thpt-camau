# Multi-file Essay Submissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép học sinh nộp một bộ 1-5 file cho mỗi lần nộp bài tự luận, giữ lịch sử theo bộ, cho giáo viên chấm một điểm chung và cho AI đọc toàn bộ file theo thứ tự.

**Architecture:** Giữ `submissions` làm bản ghi cha và thêm `submission_files` làm danh sách file chính thức. Một phiên upload private nhận từng file tuần tự, chỉ tạo submission bằng RPC nguyên tử sau khi đủ file; worker dọn file tạm xử lý các phiên hủy/hết hạn. Backend chuẩn hóa submission cũ thành mảng một file, còn AI trích xuất từng file rồi chấm một lần trên nội dung đã ghép.

**Tech Stack:** PostgreSQL/Supabase migrations and RPC, Node.js 22, Express 4, Supabase JS, private Cloudflare R2 with AWS SigV4, React 18, Vite 6, Axios, Tailwind CSS, Gemini essay worker, Node test runner.

## Global Constraints

- Chỉ bật nhiều file cho `submission_type = 'essay'`; bài `practice_file` tiếp tục một file.
- Mỗi lần nộp có từ 1 đến 5 file; `max_file_size_mb` áp dụng cho từng file.
- Upload file tuần tự; nếu một file lỗi thì không tạo submission và phải dọn toàn bộ file đã upload của phiên.
- Nộp lại thay thế toàn bộ bộ file mới nhưng giữ các bộ cũ trong lịch sử.
- `max_submissions` đếm submission đã xác nhận, không đếm file hay phiên upload tạm.
- Một submission có đúng một điểm, một nhận xét, một trạng thái công bố và tối đa một AI job cho mỗi lần confirm idempotent.
- Không trả `object_key`, khóa R2, URL nội bộ hoặc credential cho client/log/export.
- Migration chỉ bổ sung; không drop, backfill hoặc sửa submission lịch sử.
- Production migration, secret/configuration changes và Render deployment cần một phê duyệt riêng sau khi local verification hoàn tất.

---

## File Structure

- `backend/src/database/migrations/017_multi_file_essay_submissions.sql`: schema/RPC mirror cho backend.
- `supabase/migrations/022_multi_file_essay_submissions.sql`: migration deployable có nội dung nghiệp vụ giống migration backend.
- `backend/src/database/schema.sql`: snapshot cài đặt mới của ba bảng và quyền RLS.
- `backend/src/services/submissionFiles.js`: chuẩn hóa child files, fallback legacy và safe projection.
- `backend/src/services/submissionUploadSessionService.js`: tạo phiên, upload một file, confirm, cancel và cleanup một phiên.
- `backend/src/services/submissionUploadCleanupWorker.js`: thu hồi phiên hết hạn và retry `cleanup_pending`.
- `backend/src/services/r2Service.js`: thêm signed `DeleteObject` và helper xóa private object.
- `backend/src/services/fileSubmissionService.js`: ghép dữ liệu child files vào student/teacher views, download và export.
- `backend/src/controllers/fileSubmissionController.js`: HTTP adapters cho session/upload/confirm/cancel/file download.
- `backend/src/routes/index.js`: route Express và raw-body parser riêng cho một file.
- `backend/src/services/submissionFileReader.js`: đọc một danh sách file theo thứ tự và trả kết quả từng file.
- `backend/src/services/essayGradingGateway.js`: trích xuất vision từng file và chấm một lần trên text ghép.
- `backend/src/ai/providers/geminiEssayProvider.js`: request Gemini JSON cho extraction và grading.
- `backend/src/ai/essayFileExtraction.js`: schema/prompt/validator cho extraction một file.
- `backend/src/services/essayGradingWorker.js`: tải child files, ghép nội dung, cảnh báo theo file và fail an toàn.
- `frontend/src/utils/fileSubmission.js`: validation/merge/remove/reorder tối đa 5 file và export tên file.
- `frontend/src/services/fileSubmissionUploads.js`: client API cho create/upload/confirm/cancel.
- `frontend/src/components/FileDropzone.jsx`: bộ chọn danh sách file và progress từng file.
- `frontend/src/components/FilePreview.jsx`: xem/tải một child file cụ thể.
- `frontend/src/pages/FileSubmissionDetail.jsx`: luồng nộp tuần tự và lịch sử theo bộ.
- `frontend/src/pages/FileSubmissionManager.jsx`: danh sách file của submission và một form chấm chung.
- `docs/file-submission-deployment-checklist.md`: migration/config/probe/rollback cho release sau này.

---

### Task 1: Add the append-only database contract

**Files:**
- Create: `backend/src/database/migrations/017_multi_file_essay_submissions.sql`
- Create: `supabase/migrations/022_multi_file_essay_submissions.sql`
- Modify: `backend/src/database/schema.sql`
- Create: `backend/test/multiFileSubmissionMigration.test.js`

**Interfaces:**
- Consumes: existing `submissions`, `assignment_deliveries`, `users` and `create_file_submission` compatibility columns.
- Produces: tables `submission_files`, `submission_upload_sessions`, `submission_upload_session_files`; RPC `confirm_multi_file_submission(UUID, UUID, UUID, NUMERIC, BOOLEAN) RETURNS JSONB`.

- [ ] **Step 1: Write the failing migration contract test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const paths = [
  new URL('../src/database/migrations/017_multi_file_essay_submissions.sql', import.meta.url),
  new URL('../../supabase/migrations/022_multi_file_essay_submissions.sql', import.meta.url),
];

test('multi-file migrations are identical, additive and private', async () => {
  const [backendSql, supabaseSql] = await Promise.all(paths.map((url) => readFile(url, 'utf8')));
  assert.equal(backendSql, supabaseSql);
  assert.doesNotMatch(backendSql, /DROP\s+(TABLE|COLUMN)/i);
  for (const name of ['submission_files', 'submission_upload_sessions', 'submission_upload_session_files']) {
    assert.match(backendSql, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${name}`, 'i'));
    assert.match(backendSql, new RegExp(`ALTER TABLE public\\.${name} ENABLE ROW LEVEL SECURITY`, 'i'));
    assert.match(backendSql, new RegExp(`REVOKE ALL ON TABLE public\\.${name} FROM anon, authenticated`, 'i'));
  }
  assert.match(backendSql, /sort_order BETWEEN 0 AND 4/i);
  assert.match(backendSql, /expected_file_count BETWEEN 1 AND 5/i);
  assert.match(backendSql, /confirm_multi_file_submission/i);
  assert.match(backendSql, /pg_advisory_xact_lock/i);
  assert.match(backendSql, /confirmed_submission_id/i);
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm test --prefix backend -- --test-name-pattern="multi-file migrations"`

Expected: FAIL with `ENOENT` because migration `017`/`022` do not exist.

- [ ] **Step 3: Create both migrations with the exact table contract**

Use UUID defaults already present in the project and create these constraints exactly:

```sql
CREATE TABLE IF NOT EXISTS public.submission_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 100),
  mime_type TEXT NOT NULL,
  file_size BIGINT NOT NULL CHECK (file_size > 0),
  sort_order SMALLINT NOT NULL CHECK (sort_order BETWEEN 0 AND 4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (submission_id, sort_order)
);

CREATE TABLE IF NOT EXISTS public.submission_upload_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES public.assignment_deliveries(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading','confirming','confirmed','cancelled','expired','cleanup_pending')),
  expected_file_count SMALLINT NOT NULL CHECK (expected_file_count BETWEEN 1 AND 5),
  expires_at TIMESTAMPTZ NOT NULL,
  confirmed_submission_id UUID REFERENCES public.submissions(id) ON DELETE SET NULL,
  cleanup_reason TEXT CHECK (cleanup_reason IN ('cancelled','expired','upload_failed','confirm_failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.submission_upload_session_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.submission_upload_sessions(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 100),
  mime_type TEXT NOT NULL,
  declared_size BIGINT NOT NULL CHECK (declared_size > 0),
  file_size BIGINT CHECK (file_size > 0),
  sort_order SMALLINT NOT NULL CHECK (sort_order BETWEEN 0 AND 4),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','uploaded','cleanup_pending','cleaned')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, sort_order),
  UNIQUE (session_id, file_name)
);
```

Add indexes for `(submission_id, sort_order)`, cleanup `(status, expires_at)`, and session files `(session_id, status, sort_order)`. Enable RLS, revoke `anon/authenticated`, and grant service-role CRUD on all three tables.

Implement `confirm_multi_file_submission` as `SECURITY DEFINER SET search_path = pg_catalog, public`. It must lock `hashtextextended(delivery_id || ':' || user_id, 0)`, lock the session row `FOR UPDATE`, return `{submission, created:false}` for an already-confirmed session, re-check expiry/owner/count/all-uploaded/max-submissions, mark the previous row `is_latest = FALSE`, insert one parent using the first file metadata, insert 1-5 child rows, mark the session confirmed, and return `{submission, created:true}` in the same transaction.

- [ ] **Step 4: Mirror the table definitions in the clean-install schema**

Append the three table definitions, indexes, RLS/revoke/grants to `backend/src/database/schema.sql`. Do not copy the numbered RPC into the snapshot if other migration-only RPCs are intentionally absent; the two numbered migration files remain the source of the confirm transaction.

- [ ] **Step 5: Run migration contracts and backend regression tests**

Run: `npm test --prefix backend -- --test-name-pattern="multi-file migrations|file submission"`

Expected: PASS; the two migration bodies compare equal and legacy file-submission tests still pass.

- [ ] **Step 6: Commit the database contract**

```bash
git add backend/src/database/migrations/017_multi_file_essay_submissions.sql supabase/migrations/022_multi_file_essay_submissions.sql backend/src/database/schema.sql backend/test/multiFileSubmissionMigration.test.js
git commit -m "feat: add multi-file submission schema"
```

---

### Task 2: Add private R2 deletion and cleanup retries

**Files:**
- Modify: `backend/src/services/r2Service.js`
- Create: `backend/src/services/submissionUploadCleanupWorker.js`
- Modify: `backend/src/app.js`
- Modify: `backend/test/r2Sync.test.js`
- Create: `backend/test/submissionUploadCleanupWorker.test.js`

**Interfaces:**
- Consumes: session rows and internal `local://` object references from Task 1.
- Produces: `buildR2DeleteHeaders(options)`, `deleteObjectFromR2({ objectKey, fetchImpl? })`, `createSubmissionUploadCleanupWorker({ db, listCandidates?, cleanupSession?, ... })`.

- [ ] **Step 1: Write failing DeleteObject and cleanup-worker tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildR2DeleteHeaders } from '../src/services/r2Service.js';
import { createSubmissionUploadCleanupWorker } from '../src/services/submissionUploadCleanupWorker.js';

test('builds a signed private R2 DeleteObject request', () => {
  const req = buildR2DeleteHeaders({
    accountId: 'acc', accessKeyId: 'key', secretAccessKey: 'secret',
    bucketName: 'lms-submissions', objectKey: 'd1/u1/tmp/session/file.pdf',
    now: new Date('2026-09-14T01:02:03Z'),
  });
  assert.equal(req.method, 'DELETE');
  assert.match(req.headers.Authorization, /Credential=key\/20260914\/auto\/s3\/aws4_request/);
});

test('cleanup never removes files from a confirmed session', async () => {
  const deleted = [];
  const worker = createSubmissionUploadCleanupWorker({
    db: {},
    listCandidates: async () => [{ id: 'expired', status: 'expired' }],
    cleanupSession: async (session) => deleted.push(session.id),
  });
  await worker.runOnce();
  assert.deepEqual(deleted, ['expired']);
});
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm test --prefix backend -- --test-name-pattern="DeleteObject|cleanup never"`

Expected: FAIL because the exports do not exist.

- [ ] **Step 3: Implement signed R2 deletion**

Refactor the duplicated GET/PUT signing pieces only as needed, preserving existing exports. `deleteObjectFromR2` must return `true` for HTTP `200`, `202`, `204` or `404`, return `false` for other responses, and never log credentials or object keys.

```js
export const deleteObjectFromR2 = async ({ objectKey, fetchImpl = fetch }) => {
  const config = readR2Config();
  if (!config) return false;
  const request = buildR2DeleteHeaders({ ...config, objectKey });
  const response = await fetchImpl(request.url, { method: 'DELETE', headers: request.headers });
  return response.ok || response.status === 404;
};
```

- [ ] **Step 4: Implement bounded cleanup polling**

`runOnce()` selects at most 20 sessions where status is `cleanup_pending`, or status is `uploading` with `expires_at < now`. Expiry first sets `cleanup_reason = 'expired'`. For each candidate, query session files, require every derived R2 key to begin with `${delivery_id}/${user_id}/tmp/${session.id}/`, remove local and R2 copies, mark successful file rows `cleaned`, then mark the session `expired` when `cleanup_reason = 'expired'`, otherwise `cancelled`. Any failed delete leaves both file and session at `cleanup_pending` while retaining `cleanup_reason`.

```js
const start = ({ intervalMs = 60_000 } = {}) => {
  const timer = setInterval(() => runOnce().catch(() => {}), intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
};
```

Start the worker in `backend/src/app.js` unless `SUBMISSION_UPLOAD_CLEANUP_ENABLED === 'false'`. Use `SUBMISSION_UPLOAD_CLEANUP_POLL_MS || 60000`; no credential is sent to the browser.

- [ ] **Step 5: Run focused and full backend tests**

Run: `npm test --prefix backend -- --test-name-pattern="R2|cleanup"`

Expected: PASS, including PUT/GET regression and confirmed-session protection.

- [ ] **Step 6: Commit storage cleanup**

```bash
git add backend/src/services/r2Service.js backend/src/services/submissionUploadCleanupWorker.js backend/src/app.js backend/test/r2Sync.test.js backend/test/submissionUploadCleanupWorker.test.js
git commit -m "feat: clean abandoned submission uploads"
```

---

### Task 3: Implement upload-session API and atomic confirmation

**Files:**
- Create: `backend/src/services/submissionUploadSessionService.js`
- Modify: `backend/src/services/fileSubmissionService.js`
- Modify: `backend/src/controllers/fileSubmissionController.js`
- Modify: `backend/src/routes/index.js`
- Create: `backend/test/submissionUploadSessionService.test.js`
- Modify: `backend/test/fileSubmissionDownloadController.test.js`

**Interfaces:**
- Consumes: Task 1 RPC/tables, Task 2 R2 PUT/DELETE, existing `getStudentDelivery`, `validateSubmissionBuffer`, `safeFileName` and essay enqueue service.
- Produces: `createSubmissionUploadSessionService(db, { getStudentDelivery, loadOwnedSessionFile?, persistBuffer?, markUploaded?, cleanupSession?, confirmRpc?, enqueue?, now? })`; methods `createSession`, `uploadSessionFile`, `confirmSession`, `cancelSession`; HTTP endpoints described below.

- [ ] **Step 1: Write failing service tests for the session state machine**

Cover exact cases with a fake Supabase builder and injected storage functions:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSubmissionUploadSessionService } from '../src/services/submissionUploadSessionService.js';

test('confirm queues one AI job and returns the same submission when retried', async () => {
  let rpcCalls = 0;
  let enqueueCalls = 0;
  const getStudentDelivery = async () => ({
    delivery: { id: 'd1', due_date: null, max_submissions: 3 },
    assignment: { id: 'a1', submission_type: 'essay', max_score: 10, ai_grading_enabled: true },
  });
  const service = createSubmissionUploadSessionService({}, {
    getStudentDelivery,
    confirmRpc: async () => ({ submission: { id: 'submission-1' }, created: rpcCalls++ === 0 }),
    enqueue: async () => { enqueueCalls += 1; },
  });
  const first = await service.confirmSession({ studentId: 'u1', sessionId: 'session-1' });
  const second = await service.confirmSession({ studentId: 'u1', sessionId: 'session-1' });
  assert.equal(first.submission.id, 'submission-1');
  assert.equal(second.submission.id, 'submission-1');
  assert.equal(enqueueCalls, 1);
});

test('one failed upload cleans prior files and creates no submission', async () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
  const invalid = Buffer.from('not-an-image');
  let cleanupCalls = 0;
  let confirmCalls = 0;
  const service = createSubmissionUploadSessionService({}, {
    getStudentDelivery: async () => ({ assignment: { submission_type: 'essay', allowed_mime_types: ['image/jpeg'], max_file_size_mb: 1 } }),
    loadOwnedSessionFile: async ({ fileId }) => ({ id: fileId, session_id: 's1', status: 'pending', mime_type: 'image/jpeg', declared_size: fileId === 'f1' ? jpeg.length : invalid.length }),
    persistBuffer: async () => true,
    markUploaded: async () => true,
    cleanupSession: async () => { cleanupCalls += 1; },
    confirmRpc: async () => { confirmCalls += 1; },
  });
  await service.uploadSessionFile({ studentId: 'u1', sessionId: 's1', fileId: 'f1', buffer: jpeg, declaredMimeType: 'image/jpeg', declaredSize: jpeg.length });
  await assert.rejects(
    service.uploadSessionFile({ studentId: 'u1', sessionId: 's1', fileId: 'f2', buffer: invalid, declaredMimeType: 'image/jpeg', declaredSize: invalid.length }),
    (error) => error.code === 'BAD_REQUEST',
  );
  assert.equal(cleanupCalls, 1);
  assert.equal(confirmCalls, 0);
});
```

Also test 0/6 files, duplicate names, non-essay assignment, wrong owner, expiry, size mismatch, deadline and max-submission failure at confirm.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm test --prefix backend -- --test-name-pattern="confirm queues one|failed upload cleans|upload session"`

Expected: FAIL because `createSubmissionUploadSessionService` does not exist.

- [ ] **Step 3: Implement the service with raw one-file uploads**

Use these public method signatures:

```js
createSession({ studentId, deliveryId, files })
uploadSessionFile({ studentId, sessionId, fileId, buffer, declaredMimeType, declaredSize })
confirmSession({ studentId, sessionId })
cancelSession({ studentId, sessionId })
```

`createSession` accepts `{name,type,size}[]`, validates 1-5 items and normalized unique names, reuses `getStudentDelivery` authorization, requires essay, and inserts a 60-minute session plus ordered pending file rows. Return only `{id, expires_at, files:[{id,file_name,mime_type,file_size,sort_order}]}`.

`uploadSessionFile` requires an `uploading` owned session, an exact pending file row, `Buffer.isBuffer(req.body)`, matching declared/actual size and MIME signature, then stores local `tmp/<sessionId>/<fileId>_<safeName>` and private R2 `${deliveryId}/${studentId}/tmp/${sessionId}/${fileId}_${safeName}`. Mark uploaded only after R2 succeeds.

`confirmSession` re-checks authorization/deadline and calls:

```js
db.rpc('confirm_multi_file_submission', {
  p_session_id: sessionId,
  p_user_id: studentId,
  p_assignment_id: assignment.id,
  p_max_score: assignment.max_score,
  p_is_late: Boolean(delivery.due_date && now > new Date(delivery.due_date)),
});
```

Only enqueue AI when RPC returns `created: true`. On upload or confirm failure, invoke session cleanup and preserve the original safe error code.

- [ ] **Step 4: Add controllers and routes**

Add these routes before `/:submissionId` routes:

```js
router.post('/api/file-submissions/deliveries/:deliveryId/upload-sessions', authenticate, requireRole('student'), fileSubmissionController.createUploadSession);
router.post('/api/file-submissions/upload-sessions/:sessionId/files/:fileId', authenticate, requireRole('student'), raw({ type: () => true, limit: '101mb' }), fileSubmissionController.uploadSessionFile);
router.post('/api/file-submissions/upload-sessions/:sessionId/confirm', authenticate, requireRole('student'), fileSubmissionController.confirmUploadSession);
router.delete('/api/file-submissions/upload-sessions/:sessionId', authenticate, requireRole('student'), fileSubmissionController.cancelUploadSession);
router.get('/api/file-submissions/:submissionId/files/:fileId/download', authenticate, fileSubmissionController.downloadSubmissionFile);
```

The upload controller reads `x-file-mime` and `x-file-size`, never trusts them without buffer validation, and returns file status only. Extend error mapping: 400 for validation/deadline/max attempts, 403 for ownership, 404 for missing rows, 409 for invalid session state, and 503 for storage failure.

- [ ] **Step 5: Run service/controller/route regressions**

Run: `npm test --prefix backend -- --test-name-pattern="upload session|file submission|authorized R2 buffer"`

Expected: PASS; old `/submit` and old `/:submissionId/download` remain registered.

- [ ] **Step 6: Commit the upload-session API**

```bash
git add backend/src/services/submissionUploadSessionService.js backend/src/services/fileSubmissionService.js backend/src/controllers/fileSubmissionController.js backend/src/routes/index.js backend/test/submissionUploadSessionService.test.js backend/test/fileSubmissionDownloadController.test.js
git commit -m "feat: add atomic multi-file upload sessions"
```

---

### Task 4: Normalize multi-file submissions in student, teacher, download and export views

**Files:**
- Create: `backend/src/services/submissionFiles.js`
- Modify: `backend/src/services/fileSubmissionService.js`
- Modify: `backend/test/fileSubmissionService.test.js`
- Create: `backend/test/submissionFiles.test.js`

**Interfaces:**
- Consumes: `submission_files` rows from Task 1 and legacy parent file columns.
- Produces: `safeSubmissionFile`, `normalizeSubmissionFiles`, `safeSubmissionBundle`, safe `history[].files` and `latest.files`.

- [ ] **Step 1: Write failing normalization and authorization tests**

```js
test('normalizes child files and falls back to one legacy parent file', () => {
  const bundle = safeSubmissionBundle({
    id: 's1', object_key: 'local://first.pdf', file_name: 'first.pdf', mime_type: 'application/pdf', file_size: 10,
    submission_files: [],
  });
  assert.deepEqual(bundle.files, [{ id: null, file_name: 'first.pdf', mime_type: 'application/pdf', file_size: 10, sort_order: 0 }]);
  assert.equal(JSON.stringify(bundle).includes('object_key'), false);
});

test('download rejects a file that belongs to another submission', async () => {
  await assert.rejects(
    service.getSubmissionDownload({ userId: 'u1', userRole: 'student', submissionId: 's1', fileId: 'file-from-s2' }),
    (error) => error.code === 'NOT_FOUND',
  );
});
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm test --prefix backend -- --test-name-pattern="normalizes child|another submission"`

Expected: FAIL because bundle helpers and file-specific lookup are missing.

- [ ] **Step 3: Implement safe bundle projection**

```js
export const safeSubmissionFile = (file) => {
  const { object_key: _objectKey, ...safe } = file || {};
  return safe;
};

export const normalizeSubmissionFiles = (submission) => {
  const children = [...(submission?.submission_files || [])].sort((a, b) => a.sort_order - b.sort_order);
  if (children.length) return children.map(safeSubmissionFile);
  if (!submission?.file_name) return [];
  return [{ id: null, file_name: submission.file_name, mime_type: submission.mime_type, file_size: submission.file_size, sort_order: 0 }];
};
```

`safeSubmissionBundle` strips parent `object_key` and raw `submission_files`, then adds `files`.

- [ ] **Step 4: Update queries, downloads and export**

Select `submission_files(id,file_name,mime_type,file_size,sort_order,object_key)` for student history and teacher submissions. Use `safeSubmissionBundle` before decorating AI result. Build `roster[].history` from all parent submissions for the same delivery/student, ordered by `submitted_at DESC`, while `roster[].latest` remains the one current parent. For file-specific download, query child file by both `id` and `submission_id`; perform owner/teacher authorization before reading storage. Keep legacy download returning parent/first file.

Export exactly one safe field:

```js
'Tên file': (row.latest?.files || []).map((file) => file.file_name).join('; '),
```

- [ ] **Step 5: Run backend file-submission tests**

Run: `npm test --prefix backend -- --test-name-pattern="submission|download|export"`

Expected: PASS with no `object_key` in serialized history, roster or export.

- [ ] **Step 6: Commit normalized views**

```bash
git add backend/src/services/submissionFiles.js backend/src/services/fileSubmissionService.js backend/test/fileSubmissionService.test.js backend/test/submissionFiles.test.js
git commit -m "feat: expose safe submission file bundles"
```

---

### Task 5: Make AI extract files sequentially and grade once

**Files:**
- Create: `backend/src/ai/essayFileExtraction.js`
- Modify: `backend/src/ai/providers/geminiEssayProvider.js`
- Modify: `backend/src/services/submissionFileReader.js`
- Modify: `backend/src/services/essayGradingGateway.js`
- Modify: `backend/src/services/essayGradingWorker.js`
- Modify: `backend/test/submissionFileReader.test.js`
- Modify: `backend/test/essayGradingGateway.test.js`
- Modify: `backend/test/essayGradingWorker.test.js`

**Interfaces:**
- Consumes: ordered private child files and legacy fallback from Task 4.
- Produces: `readMany({ submission, files, assignment })`, `gateway.extractFile({ file, fileName })`, `combineExtractedFiles(results, maxChars)` and one final `gateway.generate` call.

- [ ] **Step 1: Write failing multi-file AI tests**

```js
test('reads and grades five files in sort order with one final grading call', async () => {
  const job = { id: 'j1', submission_id: 's1', grading_method: 'percentage_v2', rubric_snapshot: [], model_answer_snapshot: 'Đáp án' };
  const assignment = { essay_content: 'Đề', max_score: 10 };
  const submission = { id: 's1', delivery_id: 'd1', user_id: 'u1' };
  const jpeg = { mimeType: 'image/jpeg', base64: '/9j/' };
  const generatedGrade = {
    provider: 'gemini', model: 'gemini-test', usage: {},
    grade: { score: 8, correctness_percentage: 80, extracted_text: '', extraction_quality: 'sufficient', extraction_warnings: [], overall_feedback: 'Khá', correct_content: [], missing_or_incorrect_content: [], contradictions: [], strengths: [], improvements: [], confidence: 0.8 },
  };
  const calls = [];
  const result = await processEssayJob({
    job, assignment, submission,
    files: [{ file_name: '1.docx', sort_order: 0 }, { file_name: '2.jpg', sort_order: 1 }],
    fileReader: { readMany: async () => [{ fileName: '1.docx', extractedText: 'Một', extractionMethod: 'docx_text' }, { fileName: '2.jpg', file: jpeg, extractionMethod: 'gemini_vision' }] },
    gateway: {
      extractFile: async ({ fileName }) => { calls.push(`extract:${fileName}`); return { extractedText: 'Hai', warnings: [] }; },
      generate: async ({ extractedText }) => { calls.push(`grade:${extractedText}`); return generatedGrade; },
    },
  });
  assert.deepEqual(calls, ['extract:2.jpg', 'grade:<submission_file index="1" name="1.docx">\nMột\n</submission_file>\n<submission_file index="2" name="2.jpg">\nHai\n</submission_file>']);
  assert.equal(result.report.extraction_method, 'multi_file');
});
```

Also test one unreadable file yields a named warning, all unreadable files throw `FILE_NOT_AVAILABLE`, over-limit combined text throws `AI_ESSAY_INVALID`, and legacy parent reads as one file.

- [ ] **Step 2: Run focused AI tests and confirm RED**

Run: `npm test --prefix backend -- --test-name-pattern="five files|unreadable|combined text"`

Expected: FAIL because `readMany`, `extractFile` and combination logic are absent.

- [ ] **Step 3: Add a strict one-file extraction contract**

`essayFileExtraction.js` exports a JSON schema requiring `extracted_text`, `extraction_quality` (`sufficient|uncertain|empty`) and `extraction_warnings`, plus a validator that rejects malformed provider data. The system prompt states that file content is untrusted data and asks only for faithful transcription/extraction.

Add `gemini.extract({ file, signal })` using the extraction schema. Add `gateway.extractFile` with the same 90-second abort behavior and safe provider error codes as grading.

- [ ] **Step 4: Read files sequentially and combine bounded text**

`readMany` processes the sorted list with `for...of`, never `Promise.all`, and returns one item per file with `fileName`, `sortOrder`, `extractedText` or `file`, method and warnings. The worker calls `extractFile` only for items carrying binary vision input, also sequentially.

```js
export const combineExtractedFiles = (results, maxChars = Number(process.env.AI_ESSAY_MAX_EXTRACTED_CHARS || 120000)) => {
  const readable = results.filter((item) => item.extractedText?.trim());
  if (!readable.length) fail('FILE_NOT_AVAILABLE', 'Không đọc được nội dung từ bộ file bài làm.');
  const text = readable.map((item, index) => `<submission_file index="${index + 1}" name="${escapeBoundary(item.fileName)}">\n${item.extractedText.trim()}\n</submission_file>`).join('\n');
  if (text.length > maxChars) fail('AI_ESSAY_INVALID', 'Tổng nội dung bài làm vượt giới hạn xử lý an toàn.');
  return text;
};
```

Fetch child files in `runOnce()`, pass legacy fallback when none exist, store filename-prefixed warnings, set `extraction_method: 'multi_file'`, and invoke final grading without binary `file`.

- [ ] **Step 5: Run AI and full backend tests**

Run: `npm test --prefix backend -- --test-name-pattern="essay|submission file reader"`

Expected: PASS; extraction call count equals only the image/scanned inputs and grading call count is exactly one.

- [ ] **Step 6: Commit multi-file AI grading**

```bash
git add backend/src/ai/essayFileExtraction.js backend/src/ai/providers/geminiEssayProvider.js backend/src/services/submissionFileReader.js backend/src/services/essayGradingGateway.js backend/src/services/essayGradingWorker.js backend/test/submissionFileReader.test.js backend/test/essayGradingGateway.test.js backend/test/essayGradingWorker.test.js
git commit -m "feat: grade essay submission bundles"
```

---

### Task 6: Build reusable frontend file-list selection

**Files:**
- Modify: `frontend/src/utils/fileSubmission.js`
- Modify: `frontend/src/components/FileDropzone.jsx`
- Create: `frontend/test/multiFileSelection.test.js`

**Interfaces:**
- Consumes: assignment MIME and per-file size settings.
- Produces: `addSelectedFiles`, `removeSelectedFile`, `moveSelectedFile`, `validateSelectedFiles`; `FileDropzone({ selectedFiles, onChangeFiles, progressById, multiple })`.

- [ ] **Step 1: Write failing pure selection tests**

```js
const pdf = (name) => ({ name, type: 'application/pdf', size: 1024 });

test('adds at most five unique valid files and preserves order', () => {
  const settings = { allowed_mime_types: ['application/pdf'], max_file_size_mb: 1 };
  const result = addSelectedFiles([pdf('a.pdf')], [pdf('b.pdf'), pdf('c.pdf')], settings, 5);
  assert.deepEqual(result.files.map((file) => file.name), ['a.pdf', 'b.pdf', 'c.pdf']);
  assert.equal(result.error, null);
  assert.match(addSelectedFiles(result.files, [pdf('A.PDF')], settings, 5).error, /trùng/i);
  assert.match(addSelectedFiles(result.files, [pdf('d.pdf'), pdf('e.pdf'), pdf('f.pdf')], settings, 5).error, /5 file/i);
});

test('reorders without mutating the original list', () => {
  const input = [pdf('a.pdf'), pdf('b.pdf')];
  const output = moveSelectedFile(input, 1, -1);
  assert.deepEqual(output.map((file) => file.name), ['b.pdf', 'a.pdf']);
  assert.deepEqual(input.map((file) => file.name), ['a.pdf', 'b.pdf']);
});
```

- [ ] **Step 2: Run focused frontend tests and confirm RED**

Run: `npm test --prefix frontend -- --test-name-pattern="five unique|reorders"`

Expected: FAIL because the helpers are not exported.

- [ ] **Step 3: Implement list helpers and the dropzone**

Normalize duplicate checks with `file.name.trim().normalize('NFKC').toLocaleLowerCase('vi-VN')`. Validate every new file with existing `validateSelectedFile`, reject the whole add operation on any error, and never mutate the prior array.

The component must set `multiple={multiple}`, accept all dropped/selected files, render `n/5`, name/type/size, remove/up/down buttons, per-file status and total progress. Disable add/remove/reorder while uploading. Keep a one-file display when `multiple === false` so practice behavior does not change.

- [ ] **Step 4: Run selection and legacy frontend tests**

Run: `npm test --prefix frontend -- --test-name-pattern="file|selection"`

Expected: PASS, including existing MIME/size validation.

- [ ] **Step 5: Commit file-list selection**

```bash
git add frontend/src/utils/fileSubmission.js frontend/src/components/FileDropzone.jsx frontend/test/multiFileSelection.test.js
git commit -m "feat: select ordered essay file bundles"
```

---

### Task 7: Wire the student sequential upload and bundle history UI

**Files:**
- Create: `frontend/src/services/fileSubmissionUploads.js`
- Modify: `frontend/src/pages/FileSubmissionDetail.jsx`
- Modify: `frontend/test/fileSubmissionStudent.test.js`
- Create: `frontend/test/fileSubmissionUploads.test.js`

**Interfaces:**
- Consumes: Task 3 API and Task 6 file-list component.
- Produces: `submitFileBundle({ deliveryId, files, onProgress, apiClient = api })` and student history rendering of `submission.files`.

- [ ] **Step 1: Write failing API orchestration tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { submitFileBundle } from '../src/services/fileSubmissionUploads.js';

const pdf = (name) => new File([new Uint8Array([1, 2, 3])], name, { type: 'application/pdf' });

test('uploads files sequentially then confirms once', async () => {
  const calls = [];
  const apiClient = {
    post: async (url) => {
      if (url.endsWith('/upload-sessions')) { calls.push('create'); return { data: { id: 'session-1', files: [{ id: 'f1' }, { id: 'f2' }] } }; }
      if (url.includes('/files/f1')) calls.push('upload:0');
      else if (url.includes('/files/f2')) calls.push('upload:1');
      else if (url.endsWith('/confirm')) calls.push('confirm');
      return { data: { success: true } };
    },
    delete: async () => { calls.push('cancel'); },
  };
  await submitFileBundle({ deliveryId: 'd1', files: [pdf('a.pdf'), pdf('b.pdf')], apiClient });
  assert.deepEqual(calls, ['create', 'upload:0', 'upload:1', 'confirm']);
});

test('cancels the session and skips confirm after one upload fails', async () => {
  const calls = [];
  const apiClient = {
    post: async (url) => {
      if (url.endsWith('/upload-sessions')) { calls.push('create'); return { data: { id: 'session-1', files: [{ id: 'f1' }, { id: 'f2' }] } }; }
      if (url.includes('/files/f1')) { calls.push('upload:0'); return { data: { success: true } }; }
      if (url.includes('/files/f2')) { calls.push('upload:1'); throw new Error('upload failed'); }
      calls.push('confirm');
      return { data: {} };
    },
    delete: async () => { calls.push('cancel'); },
  };
  await assert.rejects(submitFileBundle({ deliveryId: 'd1', files: [pdf('a.pdf'), pdf('b.pdf')], apiClient }));
  assert.deepEqual(calls, ['create', 'upload:0', 'upload:1', 'cancel']);
});
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm test --prefix frontend -- --test-name-pattern="uploads files sequentially|cancels the session"`

Expected: FAIL because `fileSubmissionUploads.js` does not exist.

- [ ] **Step 3: Implement the API orchestrator**

Create session with metadata, iterate files with `for (let index = 0; index < files.length; index += 1)`, POST each browser `File` as raw body with `x-file-mime` and `x-file-size`, then confirm. Convert each Axios upload event into `{fileIndex,filePercent,totalPercent}`. In `catch`, call DELETE once when a session exists and rethrow the original error.

```js
const totalPercent = Math.round(((fileIndex + filePercent / 100) / files.length) * 100);
onProgress?.({ fileIndex, filePercent, totalPercent });
```

- [ ] **Step 4: Replace only the essay submit path**

In `FileSubmissionDetail.jsx`, keep the current single-file endpoint for practice assignments. For essay assignments, maintain `selectedFiles`, progress per index and total progress; call `submitFileBundle`; clear the selected list only after confirm succeeds; and replace history from the confirm response. Error copy must say the submission was not recorded and the entire set can be retried.

Render each history entry with its own ordered `files` list and file-specific download URL. Keep score, AI state and published model answer once per parent entry.

- [ ] **Step 5: Run student tests and production build**

Run: `npm test --prefix frontend -- --test-name-pattern="file|student|upload"`

Expected: PASS.

Run: `npm run build --prefix frontend`

Expected: Vite exits 0 and emits a production bundle without unresolved imports.

- [ ] **Step 6: Commit the student flow**

```bash
git add frontend/src/services/fileSubmissionUploads.js frontend/src/pages/FileSubmissionDetail.jsx frontend/test/fileSubmissionStudent.test.js frontend/test/fileSubmissionUploads.test.js
git commit -m "feat: submit essay files as one attempt"
```

---

### Task 8: Show all files to teachers while retaining one grading form

**Files:**
- Modify: `frontend/src/components/FilePreview.jsx`
- Modify: `frontend/src/pages/FileSubmissionManager.jsx`
- Modify: `frontend/src/utils/fileSubmission.js`
- Modify: `frontend/test/fileSubmissionTeacher.test.js`

**Interfaces:**
- Consumes: `latest.files` and child-file download endpoint from Task 4.
- Produces: selectable preview list, safe joined export names and unchanged parent-level grading actions.

- [ ] **Step 1: Write failing teacher view/export tests**

```js
test('report joins bundle names without private fields', () => {
  const [row] = toReportRows([{ student_name: 'An', status: 'submitted', latest: { files: [{ file_name: 'a.pdf' }, { file_name: 'b.jpg' }] } }]);
  assert.equal(row['Tên file'], 'a.pdf; b.jpg');
  assert.doesNotMatch(JSON.stringify(row), /object_key|downloadUrl|token/i);
});

test('teacher preview uses a file-specific download route', async () => {
  const source = await readFile(new URL('../src/components/FilePreview.jsx', import.meta.url), 'utf8');
  assert.match(source, /files\/\$\{fileId\}\/download/);
});
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm test --prefix frontend -- --test-name-pattern="bundle names|file-specific"`

Expected: FAIL because current UI uses only parent `file_name` and legacy download.

- [ ] **Step 3: Implement file selection in the grading panel**

`FilePreview` receives `fileId = null`; when present it downloads `/api/file-submissions/${submissionId}/files/${fileId}/download`, otherwise it uses the legacy route. Revoke the previous `URL.createObjectURL` in effect cleanup and when replacing a preview.

`FileSubmissionManager` renders `N file` plus ordered file buttons, keeps `selectedFileId` scoped to the currently selected student/submission, and previews the first file by default. Add a collapsed "Các lần nộp trước" area backed by `selectedItem.history`; selecting an old attempt swaps only the preview/file list and clearly labels it as historical, while grading controls remain bound to `selectedItem.latest.id` and are disabled when an old attempt is being viewed. Never mix files between parent submissions.

- [ ] **Step 4: Update export and run teacher regressions**

Use `(latest.files || legacyFallback).map(...).join('; ')` in frontend report generation. Run:

`npm test --prefix frontend -- --test-name-pattern="teacher|report|preview|percentage review"`

Expected: PASS; one grading form remains and export contains file names only.

- [ ] **Step 5: Commit teacher bundle viewing**

```bash
git add frontend/src/components/FilePreview.jsx frontend/src/pages/FileSubmissionManager.jsx frontend/src/utils/fileSubmission.js frontend/test/fileSubmissionTeacher.test.js
git commit -m "feat: review every file in an essay submission"
```

---

### Task 9: Verify migration safety, regressions and release readiness

**Files:**
- Modify: `docs/file-submission-deployment-checklist.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: all previous tasks.
- Produces: reproducible local evidence and an exact production payload proposal; no production mutation.

- [ ] **Step 1: Update operational documentation**

Document migration order through backend `017` / Supabase `022`, three session endpoints, child-file download, 1-5/per-file limits, these optional settings, and R2 DELETE permission:

```text
SUBMISSION_UPLOAD_CLEANUP_ENABLED=true
SUBMISSION_UPLOAD_CLEANUP_POLL_MS=60000
AI_ESSAY_MAX_EXTRACTED_CHARS=120000
```

The checklist must require migration first, compatible backend/worker second, frontend bundle third, then authorization/storage/live-bundle probes. Rollback disables the multi-file UI and cleanup worker or rolls back application code; it never drops the additive tables or deletes confirmed files.

- [ ] **Step 2: Run the complete automated suite**

Run: `npm test --prefix backend`

Expected: exit 0, including migration, upload session, cleanup, authorization and AI bundle tests.

Run: `npm test --prefix frontend`

Expected: exit 0, including list selection, sequential upload, history, teacher preview and legacy behavior.

- [ ] **Step 3: Build the production frontend**

Run: `npm run build --prefix frontend`

Expected: exit 0 and a new hashed asset under `frontend/dist/assets/`.

- [ ] **Step 4: Verify the migration on a disposable Supabase database**

Apply `supabase/migrations/022_multi_file_essay_submissions.sql` twice in a disposable database. Verify three tables exist, RLS is enabled, `anon/authenticated` have no privileges, `service_role` has CRUD, no old submission count changes, file 6/order duplicate/empty file are rejected, and two concurrent confirms yield at most one new submission per allowed attempt.

Record the exact disposable project/database identity and query output. Do not apply the migration to production in this step.

- [ ] **Step 5: Run safe end-to-end boundary cases**

Using synthetic test accounts in the disposable/local environment, verify: owner 1-file submit; owner 5-file submit; second-file failure produces no submission; retry confirm returns the same ID; resubmission creates a new parent and keeps old bundle; student and teacher histories group each attempt separately; non-owner student gets 403; wrong teacher gets 403; owner/teacher can download each child; AI creates one report with ordered boundaries and a named warning for one unreadable file.

- [ ] **Step 6: Scan for private-data leaks and unintended destructive SQL**

Run:

```bash
rg -n "object_key|R2_SECRET_ACCESS_KEY|R2_ACCESS_KEY_ID|downloadUrl|uploadUrl" backend/src frontend/src docs README.md
rg -n "DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM public\.submissions" backend/src/database/migrations/017_multi_file_essay_submissions.sql supabase/migrations/022_multi_file_essay_submissions.sql
```

Expected: object keys occur only in server/storage/database internals; credentials occur only as environment-variable names; the destructive-SQL scan returns no match.

- [ ] **Step 7: Commit documentation and prepare the approval gate**

```bash
git add docs/file-submission-deployment-checklist.md README.md
git commit -m "docs: add multi-file submission operations"
```

Report the exact commit range, migration `022`, backend/worker files, frontend files, Render destination `https://lms-thpt-camau.onrender.com`, test/build/database evidence and unchanged unrelated workspace files. Ask for a separate production confirmation before migration, configuration changes, push/deploy or live test data.
