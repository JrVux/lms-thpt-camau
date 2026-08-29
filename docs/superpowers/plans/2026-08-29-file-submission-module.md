# File Submission Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure, versioned file submissions for practical and essay assignments, with direct Cloudflare R2 upload, student history, teacher grading, preview, and report export while preserving all autograding behavior.

**Architecture:** Extend the existing assignments, deliveries, and submissions schema instead of creating parallel LMS entities. React calls four Supabase Edge Functions with the existing Express JWT; the functions verify that JWT with `APP_JWT_SECRET`, authorize against LMS tables, and return short-lived R2 URLs, while Express continues serving metadata and aggregate lists.

**Tech Stack:** PostgreSQL/Supabase migrations, Supabase Edge Functions (Deno/TypeScript), `aws4fetch`, React 18, Vite 6, Tailwind CSS, Axios, `marked`, DOMPurify, SheetJS, Node 22 test runner.

## Global Constraints

- Do not modify Python, SQL, or HTML autograding behavior.
- Keep the R2 bucket private; never expose R2 credentials or `object_key` to the frontend.
- Upload URLs expire in 300 seconds and download URLs expire in 900 seconds.
- Accept only PDF, DOC, DOCX, PPT, PPTX, JPG/JPEG, PNG, and WEBP, with an assignment default limit of 25 MB per file.
- Keep every resubmission as a separate `submissions` row and expose exactly one latest file row per `(delivery_id, user_id)`.
- Use `assignment_deliveries.due_date` as the only authoritative deadline.
- Verify the Express JWT in Edge Functions with `APP_JWT_SECRET`; do not migrate to Supabase Auth.
- Apply explicit student/teacher authorization before every service-role query or mutation.
- Never log JWTs, R2 credentials, object keys, upload tokens, or presigned URLs.
- Treat production database migration, secret changes, Edge Function deployment, and application deployment as separate external changes requiring execution-time approval.

## File map

- `supabase/migrations/016_file_submissions.sql`: production schema migration.
- `backend/src/database/migrations/014_file_submissions.sql`: backend migration mirror.
- `backend/src/database/schema.sql`: canonical schema snapshot.
- `backend/src/services/fileAssignmentRules.js`: normalization and validation shared by authoring controllers/services.
- `backend/src/services/fileSubmissionService.js`: safe student history and teacher roster/report queries.
- `backend/src/controllers/fileSubmissionController.js`: Express list/detail/export handlers.
- `supabase/functions/_shared/appJwt.ts`: HMAC JWT and upload-token verification.
- `supabase/functions/_shared/http.ts`: CORS, JSON, and redacted error helpers.
- `supabase/functions/_shared/fileRules.ts`: MIME, size, filename, deadline, and score rules.
- `supabase/functions/_shared/authorization.ts`: delivery/student/teacher database authorization.
- `supabase/functions/_shared/r2.ts`: R2 environment validation and signed requests.
- `supabase/functions/get-upload-url/index.ts`: presigned PUT issuance.
- `supabase/functions/confirm-submission/index.ts`: R2 HEAD verification and idempotent metadata insert.
- `supabase/functions/get-download-url/index.ts`: authorized presigned GET issuance.
- `supabase/functions/grade-submission/index.ts`: teacher-only grading.
- `frontend/src/services/edgeFunctions.js`: custom-JWT Edge Function client and upload progress.
- `frontend/src/utils/fileSubmission.js`: display status, sorting, file validation, and export row helpers.
- `frontend/src/components/FileDropzone.jsx`: reusable file chooser and upload progress UI.
- `frontend/src/components/FilePreview.jsx`: secure preview/download fallback.
- `frontend/src/pages/FileSubmissionDetail.jsx`: student detail/history/upload page.
- `frontend/src/pages/FileSubmissionManager.jsx`: teacher roster/filter/preview/grading/export page.
- Existing assignment, delivery, routes, and list files are modified only where listed in tasks below.

---

### Task 1: Backward-compatible file-submission schema

**Files:**
- Create: `supabase/migrations/016_file_submissions.sql`
- Create: `backend/src/database/migrations/014_file_submissions.sql`
- Modify: `backend/src/database/schema.sql`
- Create: `backend/test/fileSubmissionMigration.test.js`

**Interfaces:**
- Produces assignment fields `submission_type`, `essay_content`, `allowed_mime_types`, `max_file_size_mb`, `allow_late_submission`.
- Produces submission fields `object_key`, `file_name`, `mime_type`, `file_size`, `is_late`, `is_latest`, `feedback`, `graded_at`, `graded_by`.
- Produces database function `create_file_submission(...)` with idempotent object-key handling.

- [ ] **Step 1: Write migration contract tests**

```js
// backend/test/fileSubmissionMigration.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../src/database/migrations/014_file_submissions.sql', import.meta.url), 'utf8');

test('adds file assignment and submission fields without replacing legacy columns', () => {
  for (const field of ['submission_type', 'essay_content', 'allowed_mime_types', 'max_file_size_mb', 'allow_late_submission']) {
    assert.match(migration, new RegExp(`ADD COLUMN IF NOT EXISTS ${field}`, 'i'));
  }
  for (const field of ['object_key', 'file_name', 'mime_type', 'file_size', 'is_late', 'is_latest', 'feedback', 'graded_at', 'graded_by']) {
    assert.match(migration, new RegExp(`ADD COLUMN IF NOT EXISTS ${field}`, 'i'));
  }
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN/i);
});

test('enforces one latest file row and idempotent confirmation', () => {
  assert.match(migration, /WHERE object_key IS NOT NULL AND is_latest = TRUE/i);
  assert.match(migration, /UNIQUE.*object_key/i);
  assert.match(migration, /create_file_submission/i);
  assert.match(migration, /mark_previous_file_submissions_not_latest/i);
});
```

- [ ] **Step 2: Run the migration test and verify failure**

Run: `node --test backend/test/fileSubmissionMigration.test.js`  
Expected: FAIL with `ENOENT` for `014_file_submissions.sql`.

- [ ] **Step 3: Add the migration in both migration trees**

Use the same SQL body in both files. It must:

```sql
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS submission_type TEXT NOT NULL DEFAULT 'autograde',
  ADD COLUMN IF NOT EXISTS essay_content TEXT,
  ADD COLUMN IF NOT EXISTS allowed_mime_types TEXT[] NOT NULL DEFAULT ARRAY[
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg', 'image/png', 'image/webp'
  ],
  ADD COLUMN IF NOT EXISTS max_file_size_mb INTEGER NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS allow_late_submission BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS object_key TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS file_size BIGINT,
  ADD COLUMN IF NOT EXISTS is_late BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_latest BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS feedback TEXT,
  ADD COLUMN IF NOT EXISTS graded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS graded_by UUID REFERENCES public.users(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_file_object_key
  ON public.submissions(object_key) WHERE object_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_latest_file_delivery_user
  ON public.submissions(delivery_id, user_id)
  WHERE object_key IS NOT NULL AND is_latest = TRUE;
CREATE INDEX IF NOT EXISTS idx_submissions_file_roster
  ON public.submissions(delivery_id, is_latest, submitted_at DESC)
  WHERE object_key IS NOT NULL;
```

Add named `DO $$` constraint guards for the submission-type enum, `max_file_size_mb BETWEEN 1 AND 100`, and complete file metadata. Add an `AFTER INSERT` trigger that flips older file rows. Add `create_file_submission` as a `SECURITY DEFINER` function that locks the delivery/student pair, returns an existing row for a duplicate `object_key`, and inserts the new row otherwise.

- [ ] **Step 4: Update the canonical schema snapshot**

Copy the new assignment/submission columns, constraints, indexes, trigger, and `create_file_submission` signature into `backend/src/database/schema.sql`. Do not reorder or remove legacy columns.

- [ ] **Step 5: Run migration and legacy tests**

Run: `node --test backend/test/fileSubmissionMigration.test.js backend/test/assignmentTransactionsMigration.test.js backend/test/deliveryCompatibility.test.js`  
Expected: all tests PASS.

- [ ] **Step 6: Commit the schema slice**

```bash
git add supabase/migrations/016_file_submissions.sql backend/src/database/migrations/014_file_submissions.sql backend/src/database/schema.sql backend/test/fileSubmissionMigration.test.js
git commit -m "feat: add file submission schema"
```

### Task 2: File-assignment authoring rules and persistence

**Files:**
- Create: `backend/src/services/fileAssignmentRules.js`
- Create: `backend/test/fileAssignmentRules.test.js`
- Modify: `backend/src/services/assignmentLibraryService.js`
- Modify: `backend/src/controllers/assignmentLibraryController.js`
- Modify: `backend/src/services/assignmentSharing.js`
- Modify: `backend/src/database/migrations/014_file_submissions.sql`
- Modify: `supabase/migrations/016_file_submissions.sql`

**Interfaces:**
- Produces `normalizeFileAssignment(input)` returning database-safe assignment settings.
- Produces `validateFileAssignment(input)` returning `null` or a Vietnamese error message.
- Existing library create/update and linked-delivery synchronization preserve the new fields.

- [ ] **Step 1: Write authoring rule tests**

```js
// backend/test/fileAssignmentRules.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFileAssignment, validateFileAssignment } from '../src/services/fileAssignmentRules.js';

test('normalizes supported file settings', () => {
  assert.deepEqual(normalizeFileAssignment({
    submission_type: 'essay', essay_content: '  **Đề bài**  ',
    allowed_mime_types: ['application/pdf', 'image/jpeg', 'application/pdf'],
    max_file_size_mb: '25', allow_late_submission: true,
  }), {
    submission_type: 'essay', essay_content: '**Đề bài**',
    allowed_mime_types: ['application/pdf', 'image/jpeg'],
    max_file_size_mb: 25, allow_late_submission: true,
  });
});

test('requires content for essay and rejects unsupported MIME', () => {
  assert.match(validateFileAssignment({ submission_type: 'essay', essay_content: '' }), /đề bài/i);
  assert.match(validateFileAssignment({ submission_type: 'practice_file', allowed_mime_types: ['text/plain'] }), /định dạng/i);
  assert.equal(validateFileAssignment({ submission_type: 'autograde' }), null);
});
```

- [ ] **Step 2: Run the rule test and verify failure**

Run: `node --test backend/test/fileAssignmentRules.test.js`  
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Add the pure authoring rules**

```js
// backend/src/services/fileAssignmentRules.js
export const FILE_SUBMISSION_TYPES = ['practice_file', 'essay'];
export const ALL_SUBMISSION_TYPES = ['autograde', ...FILE_SUBMISSION_TYPES];
export const SUPPORTED_FILE_MIME_TYPES = [
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg', 'image/png', 'image/webp',
];

export const normalizeFileAssignment = (input) => {
  const submissionType = input.submission_type ?? 'autograde';
  if (submissionType === 'autograde') return { submission_type: 'autograde' };
  return {
    submission_type: submissionType,
    essay_content: submissionType === 'essay' ? String(input.essay_content ?? '').trim() : null,
    allowed_mime_types: [...new Set(input.allowed_mime_types ?? SUPPORTED_FILE_MIME_TYPES)],
    max_file_size_mb: Number(input.max_file_size_mb ?? 25),
    allow_late_submission: input.allow_late_submission === true,
  };
};

export const validateFileAssignment = (input) => {
  const normalized = normalizeFileAssignment(input);
  if (!ALL_SUBMISSION_TYPES.includes(normalized.submission_type)) return 'Hình thức nộp bài không hợp lệ.';
  if (normalized.submission_type === 'autograde') return null;
  if (normalized.submission_type === 'essay' && !normalized.essay_content) return 'Vui lòng nhập đề bài tự luận.';
  if (!normalized.allowed_mime_types.length || normalized.allowed_mime_types.some((mime) => !SUPPORTED_FILE_MIME_TYPES.includes(mime))) return 'Định dạng file cho phép không hợp lệ.';
  if (!Number.isInteger(normalized.max_file_size_mb) || normalized.max_file_size_mb < 1 || normalized.max_file_size_mb > 100) return 'Dung lượng file tối đa phải từ 1 đến 100 MB.';
  return null;
};
```

- [ ] **Step 4: Wire rules into assignment create/update**

Add the five new fields to `WRITABLE_FIELDS`, merge `normalizeFileAssignment(input)` into create/update payloads, and call `validateFileAssignment` in `assignmentLibraryController.create` and `.update`. File assignments skip test-case replacement and scoring-version changes unless `max_score` changes. Update linked-copy SQL/RPC field lists so deliveries receive the new settings.

- [ ] **Step 5: Run authoring and sharing tests**

Run: `node --test backend/test/fileAssignmentRules.test.js backend/test/assignmentLibraryService.test.js backend/test/assignmentSharing.test.js backend/test/assignmentShareService.test.js`  
Expected: all tests PASS.

- [ ] **Step 6: Commit authoring support**

```bash
git add backend/src/services/fileAssignmentRules.js backend/src/services/assignmentLibraryService.js backend/src/controllers/assignmentLibraryController.js backend/src/services/assignmentSharing.js backend/test/fileAssignmentRules.test.js supabase/migrations/016_file_submissions.sql backend/src/database/migrations/014_file_submissions.sql
git commit -m "feat: support file assignment authoring"
```

### Task 3: Express student history and teacher roster APIs

**Files:**
- Create: `backend/src/services/fileSubmissionService.js`
- Create: `backend/src/controllers/fileSubmissionController.js`
- Create: `backend/test/fileSubmissionService.test.js`
- Modify: `backend/src/services/studentAssignmentService.js`
- Modify: `backend/src/routes/index.js`

**Interfaces:**
- Produces `createFileSubmissionService(db)` with `getStudentDelivery`, `getTeacherRoster`, and `exportRows`.
- Produces routes `GET /api/file-submissions/deliveries/:deliveryId`, `GET /api/assignment-library/:assignmentId/file-submissions`, and `GET /api/assignment-library/:assignmentId/file-submissions/export`.
- No response contains `object_key`.

- [ ] **Step 1: Write safe-projection and status tests**

```js
// backend/test/fileSubmissionService.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { safeFileSubmission, fileRosterStatus, toExportRows } from '../src/services/fileSubmissionService.js';

test('safe projection removes the object key', () => {
  const result = safeFileSubmission({ id: 's1', object_key: 'private/key', file_name: 'a.pdf', score: 8 });
  assert.equal(result.object_key, undefined);
  assert.equal(result.file_name, 'a.pdf');
});

test('roster distinguishes missing, submitted, late, and graded', () => {
  assert.equal(fileRosterStatus(null), 'missing');
  assert.equal(fileRosterStatus({ is_late: false, graded_at: null }), 'submitted');
  assert.equal(fileRosterStatus({ is_late: true, graded_at: null }), 'late');
  assert.equal(fileRosterStatus({ is_late: false, graded_at: '2026-08-29' }), 'graded');
});

test('export rows omit keys and URLs', () => {
  const [row] = toExportRows([{ student_name: 'An', class_name: '10A', latest: { file_name: 'a.pdf' } }]);
  assert.deepEqual(Object.keys(row), ['Học sinh', 'Lớp', 'Trạng thái', 'Thời gian nộp', 'Nộp trễ', 'Tên file', 'Điểm', 'Nhận xét']);
});
```

- [ ] **Step 2: Run the service test and verify failure**

Run: `node --test backend/test/fileSubmissionService.test.js`  
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Add safe pure helpers and database service**

```js
export const safeFileSubmission = ({ object_key, ...row }) => row;
export const fileRosterStatus = (submission) => !submission ? 'missing'
  : submission.graded_at ? 'graded'
    : submission.is_late ? 'late' : 'submitted';

export const toExportRows = (rows) => rows.map((row) => ({
  'Học sinh': row.student_name,
  'Lớp': row.class_name,
  'Trạng thái': fileRosterStatus(row.latest),
  'Thời gian nộp': row.latest?.submitted_at ?? '',
  'Nộp trễ': row.latest?.is_late ? 'Có' : 'Không',
  'Tên file': row.latest?.file_name ?? '',
  'Điểm': row.latest?.score ?? '',
  'Nhận xét': row.latest?.feedback ?? '',
}));
```

`getStudentDelivery` must reuse enrollment/recipient checks from `studentAssignmentService`, require a file assignment, select file history ordered newest first, and map every row through `safeFileSubmission`. `getTeacherRoster` must first prove assignment ownership, fetch all deliveries/classes/recipients/enrollments, fetch only latest file submissions, and merge them by `(delivery_id,user_id)`.

- [ ] **Step 4: Add controllers and routes**

Controllers return JSON for student detail and teacher roster. The export handler accepts `format=csv|json`; CSV uses UTF-8 BOM and escaped cells, while the frontend uses JSON rows for XLSX. Add teacher/student role middleware exactly as existing routes do.

- [ ] **Step 5: Include file settings and status in `/api/my-assignments`**

Expand the student assignment select projection with the five assignment fields and file-submission metadata. Update `assignmentStatus` so a latest file row returns `graded`, `late`, or `submitted` and never enters autograde regrade logic.

- [ ] **Step 6: Run API service regressions**

Run: `node --test backend/test/fileSubmissionService.test.js backend/test/studentAssignmentService.test.js backend/test/teacherSubmissionView.test.js`  
Expected: all tests PASS.

- [ ] **Step 7: Commit metadata APIs**

```bash
git add backend/src/services/fileSubmissionService.js backend/src/controllers/fileSubmissionController.js backend/src/services/studentAssignmentService.js backend/src/routes/index.js backend/test/fileSubmissionService.test.js
git commit -m "feat: add file submission metadata APIs"
```

### Task 4: Edge Function authentication, HTTP, and validation foundation

**Files:**
- Create: `supabase/functions/_shared/appJwt.ts`
- Create: `supabase/functions/_shared/http.ts`
- Create: `supabase/functions/_shared/fileRules.ts`
- Create: `backend/test/fileSubmissionEdgeRules.test.js`

**Interfaces:**
- Produces `verifyAppJwt(header, secret): Promise<AppClaims>`.
- Produces `signUploadToken(payload, secret)` and `verifyUploadToken(token, secret)`.
- Produces `validateFile`, `safeFileName`, `deadlineState`, and `validateScore`.
- Produces `corsHeaders`, `json`, and `functionError`.

- [ ] **Step 1: Write pure Edge rule tests**

```js
// backend/test/fileSubmissionEdgeRules.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { safeFileName, deadlineState, validateFile, validateScore } from '../../supabase/functions/_shared/fileRules.ts';

test('sanitizes names and validates assignment limits', () => {
  assert.equal(safeFileName('../Bài làm 01.pdf'), 'B_i_l_m_01.pdf');
  assert.equal(validateFile({ mimeType: 'application/pdf', fileSize: 1024 }, { allowed_mime_types: ['application/pdf'], max_file_size_mb: 1 }), null);
  assert.equal(validateFile({ mimeType: 'text/plain', fileSize: 10 }, { allowed_mime_types: ['application/pdf'], max_file_size_mb: 1 }).code, 'UNSUPPORTED_FILE_TYPE');
});

test('deadline and score rules are deterministic', () => {
  assert.deepEqual(deadlineState('2026-08-28T00:00:00Z', true, new Date('2026-08-29T00:00:00Z')), { isLate: true, allowed: true });
  assert.equal(validateScore(8, 10), null);
  assert.equal(validateScore(11, 10).code, 'INVALID_SCORE');
});
```

- [ ] **Step 2: Run the Edge rule test and verify failure**

Run: `node --experimental-strip-types --test backend/test/fileSubmissionEdgeRules.test.js`  
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Add pure validation rules**

```ts
export const safeFileName = (name: string) => name
  .replace(/^.*[\\/]/, '')
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_').slice(0, 120);

export const deadlineState = (deadline: string | null, allowLate: boolean, now = new Date()) => {
  const isLate = Boolean(deadline && now > new Date(deadline));
  return { isLate, allowed: !isLate || allowLate };
};
```

Add typed error objects for missing metadata, unsupported MIME, files larger than `max_file_size_mb * 1024 * 1024`, empty sanitized names, and scores outside `0..maxScore`.

- [ ] **Step 4: Add constant-time HMAC JWT utilities**

`appJwt.ts` must base64url-decode JSON, support only `HS256`, use Web Crypto HMAC SHA-256, compare signatures through `crypto.subtle.verify`, require `id`, `role`, and unexpired `exp`, and accept roles only `student` or `teacher`. Upload tokens reuse the same primitive but require `kind: 'file-upload'`, `deliveryId`, `studentId`, object metadata, `iat`, and an expiry no later than five minutes.

- [ ] **Step 5: Add HTTP helpers**

`http.ts` defines only the two approved frontend origins, handles `OPTIONS`, returns `Content-Type: application/json`, and maps typed errors to `401/403/404/409/413/415/500`. Unknown errors are logged only as a stable code and function name.

- [ ] **Step 6: Run pure Edge tests**

Run: `node --experimental-strip-types --test backend/test/fileSubmissionEdgeRules.test.js`  
Expected: all tests PASS with no experimental type warning treated as failure.

- [ ] **Step 7: Commit the Edge foundation**

```bash
git add supabase/functions/_shared/appJwt.ts supabase/functions/_shared/http.ts supabase/functions/_shared/fileRules.ts backend/test/fileSubmissionEdgeRules.test.js
git commit -m "feat: add edge file submission security rules"
```

### Task 5: Shared database authorization and R2 signing

**Files:**
- Create: `supabase/functions/_shared/authorization.ts`
- Create: `supabase/functions/_shared/r2.ts`
- Create: `backend/test/fileSubmissionEdgeSource.test.js`

**Interfaces:**
- Produces `authorizeStudentDelivery(db, studentId, deliveryId)`.
- Produces `authorizeTeacherSubmission(db, teacherId, submissionId)`.
- Produces `r2Client()`, `presignPut`, `presignGet`, and `headObject`.

- [ ] **Step 1: Write source-level security contract tests**

```js
// backend/test/fileSubmissionEdgeSource.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const auth = await readFile(new URL('../../supabase/functions/_shared/authorization.ts', import.meta.url), 'utf8');
const r2 = await readFile(new URL('../../supabase/functions/_shared/r2.ts', import.meta.url), 'utf8');

test('authorization binds students and teachers to delivery ownership', () => {
  assert.match(auth, /enrollments/);
  assert.match(auth, /assignment_recipients/);
  assert.match(auth, /classes.*teacher_id/s);
});

test('R2 helper uses private S3 signing and fixed expiries', () => {
  assert.match(r2, /aws4fetch@1\.0\.17/);
  assert.match(r2, /300/);
  assert.match(r2, /900/);
  assert.doesNotMatch(r2, /console\.log\(.*url|console\.log\(.*key/i);
});
```

- [ ] **Step 2: Run the security contract and verify failure**

Run: `node --test backend/test/fileSubmissionEdgeSource.test.js`  
Expected: FAIL with missing shared source files.

- [ ] **Step 3: Add explicit authorization queries**

`authorizeStudentDelivery` selects the published delivery, class, assignment file settings, and recipient list; verifies enrollment and targeting; and returns one trusted object. `authorizeTeacherSubmission` selects the submission with delivery/class/assignment and requires `classes.teacher_id === teacherId`. Both throw typed `NOT_FOUND` or `FORBIDDEN` errors without returning raw database errors.

- [ ] **Step 4: Add the R2 helper**

```ts
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.17';

const required = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw { code: 'R2_NOT_CONFIGURED', status: 500 };
  return value;
};

export const r2Config = () => ({
  accountId: required('R2_ACCOUNT_ID'),
  accessKeyId: required('R2_ACCESS_KEY_ID'),
  secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
  bucket: required('R2_BUCKET_NAME'),
});
```

Build URLs with `encodeURIComponent` per path segment, never by accepting a client URL. `presignPut` returns a 300-second signed query, `presignGet` a 900-second query, and `headObject` sends an authenticated `HEAD` request and returns normalized content length/type/etag.

- [ ] **Step 5: Run source and rule tests**

Run: `node --test backend/test/fileSubmissionEdgeSource.test.js`  
Expected: all tests PASS.

- [ ] **Step 6: Commit authorization and R2 helpers**

```bash
git add supabase/functions/_shared/authorization.ts supabase/functions/_shared/r2.ts backend/test/fileSubmissionEdgeSource.test.js
git commit -m "feat: add edge authorization and r2 signing"
```

### Task 6: Upload URL and idempotent confirmation Edge Functions

**Files:**
- Create: `supabase/functions/get-upload-url/index.ts`
- Create: `supabase/functions/confirm-submission/index.ts`
- Modify: `backend/test/fileSubmissionEdgeSource.test.js`

**Interfaces:**
- `get-upload-url` consumes `{ deliveryId, fileName, mimeType, fileSize }` and returns `{ uploadUrl, uploadToken, expiresIn: 300 }`.
- `confirm-submission` consumes `{ uploadToken }` and returns `{ submission, history }`, both safe projections.

- [ ] **Step 1: Extend source contracts for upload and confirmation**

```js
test('upload and confirmation repeat authorization and never return object keys', async () => {
  const upload = await readFile(new URL('../../supabase/functions/get-upload-url/index.ts', import.meta.url), 'utf8');
  const confirm = await readFile(new URL('../../supabase/functions/confirm-submission/index.ts', import.meta.url), 'utf8');
  assert.match(upload, /authorizeStudentDelivery/);
  assert.match(confirm, /authorizeStudentDelivery/);
  assert.match(confirm, /headObject/);
  assert.match(confirm, /create_file_submission/);
  assert.doesNotMatch(confirm, /object_key\s*:/);
});
```

- [ ] **Step 2: Run and verify the new contract fails**

Run: `node --test backend/test/fileSubmissionEdgeSource.test.js`  
Expected: FAIL because both function files are missing.

- [ ] **Step 3: Add `get-upload-url`**

The handler must: answer `OPTIONS`; require `POST`; verify `Authorization`; parse JSON; call `authorizeStudentDelivery`; reject autograde assignments; validate file/deadline/attempt count; generate `${deliveryId}/${studentId}/${Date.now()}_${crypto.randomUUID()}_${safeFileName}`; presign PUT; sign a five-minute upload token; and return only the URL/token/expiry.

- [ ] **Step 4: Add `confirm-submission`**

The handler must: verify JWT and upload token; require the token student to equal JWT student; repeat delivery authorization, file/deadline/attempt checks; verify R2 `HEAD`; call `create_file_submission`; select safe history without `object_key`; and return `200` for idempotent retry or `201` for first insert.

- [ ] **Step 5: Run Edge contracts**

Run: `node --test backend/test/fileSubmissionEdgeSource.test.js`  
Expected: all tests PASS.

- [ ] **Step 6: Commit upload flow**

```bash
git add supabase/functions/get-upload-url/index.ts supabase/functions/confirm-submission/index.ts backend/test/fileSubmissionEdgeSource.test.js
git commit -m "feat: add direct r2 upload flow"
```

### Task 7: Download and grading Edge Functions

**Files:**
- Create: `supabase/functions/get-download-url/index.ts`
- Create: `supabase/functions/grade-submission/index.ts`
- Modify: `backend/test/fileSubmissionEdgeSource.test.js`

**Interfaces:**
- `get-download-url` consumes `{ submissionId }` and returns `{ downloadUrl, expiresIn: 900, file }`.
- `grade-submission` consumes `{ submissionId, score, feedback }` and returns a safe updated submission.

- [ ] **Step 1: Add teacher/student authorization contracts**

```js
test('download authorizes owner or class teacher and grading is teacher-only', async () => {
  const download = await readFile(new URL('../../supabase/functions/get-download-url/index.ts', import.meta.url), 'utf8');
  const grade = await readFile(new URL('../../supabase/functions/grade-submission/index.ts', import.meta.url), 'utf8');
  assert.match(download, /claims\.role.*student|student.*claims\.role/s);
  assert.match(download, /authorizeTeacherSubmission/);
  assert.match(grade, /authorizeTeacherSubmission/);
  assert.match(grade, /validateScore/);
  assert.doesNotMatch(download, /objectKey\s*:/);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test backend/test/fileSubmissionEdgeSource.test.js`  
Expected: FAIL with missing download/grade sources.

- [ ] **Step 3: Add authorized download signing**

For students, select the submission by `id,user_id` before using its server-side object key. For teachers, call `authorizeTeacherSubmission`. Reject rows without `object_key`, sign a 900-second GET URL, and return safe filename/MIME/size only.

- [ ] **Step 4: Add teacher grading**

Verify teacher role, authorize class ownership, validate score against `assignment.max_score`, normalize feedback to at most 5,000 characters, and update only:

```ts
{
  score,
  feedback: normalizedFeedback || null,
  graded_at: new Date().toISOString(),
  graded_by: claims.id,
  status: 'graded',
}
```

Return a safe projection and use `403` for a teacher who does not own the class.

- [ ] **Step 5: Run Edge contracts**

Run: `node --test backend/test/fileSubmissionEdgeSource.test.js`  
Expected: all tests PASS.

- [ ] **Step 6: Commit download and grading**

```bash
git add supabase/functions/get-download-url/index.ts supabase/functions/grade-submission/index.ts backend/test/fileSubmissionEdgeSource.test.js
git commit -m "feat: add secure file download and grading"
```

### Task 8: Frontend file rules and Edge client

**Files:**
- Create: `frontend/src/utils/fileSubmission.js`
- Create: `frontend/src/services/edgeFunctions.js`
- Create: `frontend/test/fileSubmission.test.js`
- Create: `frontend/.env.example`

**Interfaces:**
- Produces `validateSelectedFile`, `fileAssignmentStatus`, `sortFileDeliveries`, `toReportRows`, and `previewKind`.
- Produces `requestUploadUrl`, `uploadFileToR2`, `confirmSubmission`, `getDownloadUrl`, and `gradeSubmission`.

- [ ] **Step 1: Write frontend utility tests**

```js
// frontend/test/fileSubmission.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSelectedFile, fileAssignmentStatus, sortFileDeliveries, previewKind } from '../src/utils/fileSubmission.js';

test('validates MIME and bytes', () => {
  const settings = { allowed_mime_types: ['application/pdf'], max_file_size_mb: 1 };
  assert.equal(validateSelectedFile({ type: 'application/pdf', size: 1024 }, settings), null);
  assert.match(validateSelectedFile({ type: 'text/plain', size: 10 }, settings), /định dạng/i);
  assert.match(validateSelectedFile({ type: 'application/pdf', size: 2 * 1024 * 1024 }, settings), /dung lượng/i);
});

test('derives status and preview type', () => {
  assert.equal(fileAssignmentStatus(null, false), 'pending');
  assert.equal(fileAssignmentStatus({ is_late: true }, false), 'late');
  assert.equal(fileAssignmentStatus({ graded_at: '2026-08-29' }, false), 'graded');
  assert.equal(previewKind('application/pdf'), 'pdf');
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test frontend/test/fileSubmission.test.js`  
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Add pure frontend utilities**

Implement deterministic validation/status/sorting, MIME-to-preview mapping, Vietnamese file-size formatting, and report rows that omit URLs/object keys. Sort ungraded work by nearest deadline, then late/submitted, with graded work last.

- [ ] **Step 4: Add the Edge client**

```js
const functionUrl = (name) => `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`;
const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('token')}`,
  'Content-Type': 'application/json',
});
```

Use Axios for JSON calls and direct PUT upload so `onUploadProgress` works. The PUT sends exactly the selected file's `Content-Type`. Map `{ error: { code, message } }` and `{ message }` responses to one `Error` with `code`.

- [ ] **Step 5: Add safe environment documentation**

```dotenv
# frontend/.env.example
VITE_API_URL=http://localhost:3000
VITE_SUPABASE_URL=https://your-project.supabase.co
```

- [ ] **Step 6: Run frontend utility tests**

Run: `node --test frontend/test/fileSubmission.test.js`  
Expected: all tests PASS.

- [ ] **Step 7: Commit the frontend client foundation**

```bash
git add frontend/src/utils/fileSubmission.js frontend/src/services/edgeFunctions.js frontend/test/fileSubmission.test.js frontend/.env.example
git commit -m "feat: add frontend file submission client"
```

### Task 9: Teacher file-assignment authoring UI

**Files:**
- Modify: `frontend/src/pages/CreateAssignment.jsx`
- Modify: `frontend/src/components/AssignmentDeliveryModal.jsx`
- Create: `frontend/src/components/FileAssignmentFields.jsx`
- Create: `frontend/test/fileAssignmentForm.test.js`

**Interfaces:**
- Produces normalized authoring payload consumed by Task 2.
- Preserves the existing autograde form exactly when `submission_type === 'autograde'`.

- [ ] **Step 1: Write form-normalization tests**

```js
// frontend/test/fileAssignmentForm.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFileAssignmentPayload } from '../src/utils/fileSubmission.js';

test('builds essay settings without code fields', () => {
  const payload = buildFileAssignmentPayload({
    submission_type: 'essay', essay_content: '# Đề', allowed_mime_types: ['application/pdf'],
    max_file_size_mb: '25', allow_late_submission: true,
  });
  assert.deepEqual(payload, {
    submission_type: 'essay', essay_content: '# Đề', allowed_mime_types: ['application/pdf'],
    max_file_size_mb: 25, allow_late_submission: true,
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test frontend/test/fileAssignmentForm.test.js`  
Expected: FAIL because `buildFileAssignmentPayload` is not exported.

- [ ] **Step 3: Add `FileAssignmentFields`**

Render three mode buttons, Markdown essay textarea only for essay mode, eight format checkboxes grouped as documents/images, integer size `1..100`, maximum score, and late-submission checkbox. Emit a complete settings object through `onChange` and show inline validation from `validateSelectedFile`/form rules.

- [ ] **Step 4: Integrate conditional authoring**

Initialize and load the five new fields in `CreateAssignment`. Render Monaco/test sections only for autograde. Render `FileAssignmentFields` for file modes. Submit `buildFileAssignmentPayload` for file modes and do not call test-case endpoints for them. Do not change category/subject compatibility.

- [ ] **Step 5: Preserve per-class deadlines**

Keep deadline and recipient inputs in `AssignmentDeliveryModal`. Rename visible copy from generic submission attempts to file-friendly wording when the assignment is a file type, without changing the payload keys.

- [ ] **Step 6: Run form and legacy assignment tests**

Run: `node --test frontend/test/fileAssignmentForm.test.js frontend/test/assignmentLibrary.test.js frontend/test/deliveryForm.test.js frontend/test/aiAssignmentDraft.test.js`  
Expected: all tests PASS.

- [ ] **Step 7: Commit teacher authoring UI**

```bash
git add frontend/src/pages/CreateAssignment.jsx frontend/src/components/AssignmentDeliveryModal.jsx frontend/src/components/FileAssignmentFields.jsx frontend/src/utils/fileSubmission.js frontend/test/fileAssignmentForm.test.js
git commit -m "feat: add file assignment authoring ui"
```

### Task 10: Student cards, detail page, direct upload, and history

**Files:**
- Modify: `frontend/src/pages/MyAssignments.jsx`
- Modify: `frontend/src/App.jsx`
- Create: `frontend/src/pages/FileSubmissionDetail.jsx`
- Create: `frontend/src/components/FileDropzone.jsx`
- Create: `frontend/test/fileSubmissionStudent.test.js`

**Interfaces:**
- Adds route `/deliveries/:deliveryId/file-submission` for students.
- Uses Task 8 client in the sequence upload URL → R2 PUT → confirmation → reload history.

- [ ] **Step 1: Write student view-model tests**

```js
// frontend/test/fileSubmissionStudent.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { studentFileCard } from '../src/utils/fileSubmission.js';

test('file card uses file route and graded copy', () => {
  const card = studentFileCard({ id: 'd1', assignment_status: 'graded', assignments: { submission_type: 'essay' }, submissions: [{ score: 8, max_score: 10 }] });
  assert.equal(card.href, '/deliveries/d1/file-submission');
  assert.equal(card.badge, 'Tự luận');
  assert.match(card.status, /8\/10/);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test frontend/test/fileSubmissionStudent.test.js`  
Expected: FAIL because `studentFileCard` is missing.

- [ ] **Step 3: Update student assignment cards**

Add file badges/statuses and file route selection. Preserve all existing autograde routes. Extend tabs to display graded/late states without hiding existing submitted work, and apply `sortFileDeliveries` within each tab.

- [ ] **Step 4: Add the reusable dropzone**

The component supports click and drag/drop, one file only, disabled/late states, client validation, progress from 0–100, and explicit copy for requesting URL/uploading/confirming. It calls one `onSubmit(file, setProgress)` prop and does not know API URLs.

- [ ] **Step 5: Add the student detail page**

Fetch Express delivery detail; sanitize essay Markdown with `DOMPurify.sanitize(marked.parse(content))`; render deadline/late policy; run Task 8 client calls in order; retry confirmation with the same upload token; reload safe history; show latest badge, score, feedback, and downloadable history entries through fresh download URLs.

- [ ] **Step 6: Add the route and run tests**

Add `<Route path="/deliveries/:deliveryId/file-submission" ...>` with student role protection.

Run: `node --test frontend/test/fileSubmissionStudent.test.js frontend/test/studentAssignmentStatus.test.js`  
Expected: all tests PASS.

- [ ] **Step 7: Commit student workflow**

```bash
git add frontend/src/pages/MyAssignments.jsx frontend/src/App.jsx frontend/src/pages/FileSubmissionDetail.jsx frontend/src/components/FileDropzone.jsx frontend/src/utils/fileSubmission.js frontend/test/fileSubmissionStudent.test.js
git commit -m "feat: add student file submission workflow"
```

### Task 11: Teacher roster, secure preview, grading, and reports

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/AssignmentDeliveryList.jsx`
- Create: `frontend/src/pages/FileSubmissionManager.jsx`
- Create: `frontend/src/components/FilePreview.jsx`
- Create: `frontend/test/fileSubmissionTeacher.test.js`

**Interfaces:**
- Adds route `/assignments/:assignmentId/file-submissions` for teachers.
- Uses roster API from Task 3 and download/grade Edge Functions from Task 7.

- [ ] **Step 1: Write teacher filter/next/export tests**

```js
// frontend/test/fileSubmissionTeacher.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { filterRoster, nextRosterIndex, toReportRows } from '../src/utils/fileSubmission.js';

const rows = [{ status: 'missing' }, { status: 'submitted' }, { status: 'late' }];
test('filters and advances within the visible roster', () => {
  assert.equal(filterRoster(rows, 'submitted').length, 1);
  assert.equal(nextRosterIndex(rows, 1), 2);
  assert.equal(nextRosterIndex(rows, 2), 0);
});

test('report rows contain no private URL fields', () => {
  const [row] = toReportRows([{ student_name: 'An', class_name: '10A', status: 'submitted', latest: { file_name: 'a.pdf' } }]);
  assert.equal(JSON.stringify(row).includes('url'), false);
  assert.equal(JSON.stringify(row).includes('object_key'), false);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test frontend/test/fileSubmissionTeacher.test.js`  
Expected: FAIL because roster helpers are missing.

- [ ] **Step 3: Add `FilePreview`**

Request a fresh download URL on selection. Render `<img>` for images, `<iframe>` for PDF, and an Office Online viewer URL for Word/PowerPoint only after a visible privacy note; always render a direct Download button. On URL expiry/failure, request once more and then show the download-only fallback.

- [ ] **Step 4: Add manager table and panel**

Fetch the aggregate roster, render counts and four filters, and keep selected row state without navigation. The grading form validates `0..max_score`, preserves fields on failure, calls `gradeSubmission`, updates the row in place, and advances through the currently filtered list for `Lưu & bài tiếp theo`.

- [ ] **Step 5: Add CSV/XLSX export**

CSV downloads from the Express endpoint. XLSX uses `XLSX.utils.json_to_sheet(toReportRows(rows))`, `book_new`, `book_append_sheet`, and `writeFile`. Filenames use `file_submissions_<assignmentId>.<ext>` and exported cells contain no URL/object key.

- [ ] **Step 6: Add navigation and route**

For file assignments, `AssignmentDeliveryList` shows `Quản lý bài nộp` linking to the manager. Add the teacher-protected route to `App.jsx`.

- [ ] **Step 7: Run teacher tests**

Run: `node --test frontend/test/fileSubmissionTeacher.test.js frontend/test/fileSubmission.test.js`  
Expected: all tests PASS.

- [ ] **Step 8: Commit teacher workflow**

```bash
git add frontend/src/App.jsx frontend/src/components/AssignmentDeliveryList.jsx frontend/src/pages/FileSubmissionManager.jsx frontend/src/components/FilePreview.jsx frontend/src/utils/fileSubmission.js frontend/test/fileSubmissionTeacher.test.js
git commit -m "feat: add teacher file submission grading"
```

### Task 12: Full regression, production configuration, and acceptance handoff

**Files:**
- Modify: `README.md`
- Create: `docs/file-submission-deployment-checklist.md`

**Interfaces:**
- Produces a reproducible deployment checklist and evidence for local completion.
- Production mutation remains gated behind explicit approval.

- [ ] **Step 1: Document exact required configuration**

Document these server-only Supabase secrets:

```text
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
APP_JWT_SECRET  # exact value of production backend JWT_SECRET
```

Document frontend `VITE_SUPABASE_URL=https://sfanqrirgbxpgrhcamit.supabase.co`, the existing API URL, R2 CORS origins, four `supabase functions deploy <name> --no-verify-jwt` commands, migration ordering, rollback boundaries, and secret-rotation steps. Never include secret values.

- [ ] **Step 2: Run backend regression tests**

Run from `backend`: `node --test`  
Expected: all tests PASS; zero skipped file-submission tests.

- [ ] **Step 3: Run frontend regression tests**

Run from `frontend`: `node --test`  
Expected: all tests PASS.

- [ ] **Step 4: Run root documentation tests**

Run from the repository root: `node --test`  
Expected: all tests PASS.

- [ ] **Step 5: Build the frontend**

Run from `frontend`: `node node_modules/vite/bin/vite.js build`  
Expected: Vite build exits `0`, creates hashed assets, and reports no unresolved imports.

- [ ] **Step 6: Review secret and private-data leakage**

Run:

```bash
rg -n "R2_SECRET_ACCESS_KEY=|APP_JWT_SECRET=|object_key.*res\.json|console\.(log|error).*uploadUrl|console\.(log|error).*downloadUrl" backend frontend supabase docs README.md
```

Expected: no literal secret assignments and no logging/response exposure matches. Environment-variable reads are allowed.

- [ ] **Step 7: Commit documentation and verification updates**

```bash
git add README.md docs/file-submission-deployment-checklist.md
git commit -m "docs: add file submission deployment checklist"
```

- [ ] **Step 8: Request production-deployment approval**

Present the passing test/build evidence and ask separately for authorization to: add `APP_JWT_SECRET`; apply migration `016_file_submissions.sql`; deploy four Edge Functions with `--no-verify-jwt`; set frontend production environment; and deploy backend/frontend. Do not perform any of those external changes before approval.

- [ ] **Step 9: Execute acceptance scenarios after approved deployment**

Use one practical and one essay assignment with three student accounts:

1. Student A submits on time, resubmits, and retains two history rows.
2. Student B submits after deadline when late submission is enabled and receives `is_late=true`.
3. Student C remains missing and appears in teacher roster/export.
4. The teacher previews/downloads, grades Student A, uses `Lưu & bài tiếp theo`, and exports CSV/XLSX.
5. An unrelated student and unrelated teacher receive `403` for download and grade attempts.
6. Autograde Python, SQL, and HTML submissions still run and grade normally.

Record account IDs only in temporary local test notes; never commit credentials, JWTs, presigned URLs, or object keys.
