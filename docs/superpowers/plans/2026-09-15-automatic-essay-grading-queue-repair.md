# Automatic Essay Grading Queue Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every latest AI-enabled essay submission automatically receives exactly one initial grading job, with truthful API status and automatic repair for missed jobs.

**Architecture:** Add an idempotent `ensureQueued` primitive around the existing enqueue operation, use it from both submission paths, and run a bounded reconciliation worker over IDs selected by a service-role-only SQL RPC. Submission durability stays independent from the AI subsystem; enqueue failures are logged safely and repaired later.

**Tech Stack:** Node.js ES modules, Node test runner, Express, Supabase/PostgreSQL, React/Vite.

## Global Constraints

- Do not expose model answers, rubric contents, file names, object keys, student identities, credentials, or raw provider errors in public responses or queue-failure logs.
- Preserve successful submissions when queue creation fails.
- Do not automatically retry submissions that already have any grading job, including `failed` or `awaiting_review` jobs.
- Preserve teacher review, retry, publication, and existing AI worker behavior.
- Production deployment, production migrations, and secret changes remain outside this implementation.

---

### Task 1: Idempotent initial queue primitive

**Files:**
- Modify: `backend/src/services/essayGradingService.js:93-116`
- Test: `backend/test/essayGradingService.test.js`

**Interfaces:**
- Consumes: existing `enqueue({ submission, assignment, studentId, requestedBy })`.
- Produces: `ensureQueued({ submission, assignment, studentId, requestedBy }): Promise<{ job: object|null, created: boolean }>`.

- [ ] **Step 1: Write failing service tests**

Add tests that create a small in-memory Supabase builder and assert these exact behaviors:

```js
test('ensureQueued returns an existing job without inserting', async () => {
  const { db, inserts } = queueDb({ existing: { id: 'job-existing', submission_id: 's1', status: 'queued' } });
  const result = await createEssayGradingService(db).ensureQueued({
    submission: { id: 's1', delivery_id: 'd1', user_id: 'u1' },
    assignment: aiAssignment,
    studentId: 'u1',
  });
  assert.deepEqual(result, { job: { id: 'job-existing', submission_id: 's1', status: 'queued' }, created: false });
  assert.equal(inserts.filter((item) => item.table === 'essay_grading_jobs').length, 0);
});

test('ensureQueued creates one initial job when none exists', async () => {
  const { db, inserts } = queueDb();
  const result = await createEssayGradingService(db).ensureQueued({
    submission: { id: 's1', delivery_id: 'd1', user_id: 'u1' },
    assignment: aiAssignment,
    studentId: 'u1',
  });
  assert.equal(result.created, true);
  assert.equal(result.job.submission_id, 's1');
  assert.equal(inserts.filter((item) => item.table === 'essay_grading_jobs').length, 1);
});

test('ensureQueued treats a concurrent insert as success after reread', async () => {
  const { db } = queueDb({ insertError: new Error('duplicate key'), existingAfterError: { id: 'job-race', submission_id: 's1', status: 'queued' } });
  const result = await createEssayGradingService(db).ensureQueued({
    submission: { id: 's1', delivery_id: 'd1', user_id: 'u1' }, assignment: aiAssignment, studentId: 'u1',
  });
  assert.deepEqual(result, { job: { id: 'job-race', submission_id: 's1', status: 'queued' }, created: false });
});

test('ensureQueued rethrows when insert fails and no job exists', async () => {
  const { db } = queueDb({ insertError: new Error('database unavailable') });
  await assert.rejects(() => createEssayGradingService(db).ensureQueued({
    submission: { id: 's1', delivery_id: 'd1', user_id: 'u1' }, assignment: aiAssignment, studentId: 'u1',
  }), /database unavailable/i);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test --test-name-pattern="ensureQueued" test/essayGradingService.test.js` from `backend`.

Expected: FAIL because `ensureQueued` is not defined.

- [ ] **Step 3: Implement the minimal primitive**

Inside `createEssayGradingService`, add a private latest-job read and the exported method:

```js
const latestJob = async (submissionId) => {
  const { data, error } = await db.from('essay_grading_jobs')
    .select('*').eq('submission_id', submissionId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
};

const ensureQueued = async (input) => {
  const normalized = Array.isArray(input.submission) ? input.submission[0] : input.submission;
  if (!input.assignment?.ai_grading_enabled || !normalized?.id) return { job: null, created: false };
  const existing = await latestJob(normalized.id);
  if (existing) return { job: existing, created: false };
  try {
    return { job: await enqueue(input), created: true };
  } catch (error) {
    const raced = await latestJob(normalized.id);
    if (raced) return { job: raced, created: false };
    throw error;
  }
};
```

Return `ensureQueued` from the service factory without changing `retry`, which must continue to call `enqueue` directly.

- [ ] **Step 4: Run targeted and full service tests**

Run:

```powershell
node --test test/essayGradingService.test.js
npm test -- --test-name-pattern="enqueue|ensureQueued"
```

Expected: all selected tests pass with zero failures.

- [ ] **Step 5: Commit**

```powershell
git add backend/src/services/essayGradingService.js backend/test/essayGradingService.test.js
git commit -m "fix: make initial essay enqueue idempotent"
```

---

### Task 2: Truthful automatic enqueue in both submission paths

**Files:**
- Modify: `backend/src/services/fileSubmissionService.js:104-108,406-432`
- Modify: `backend/src/services/submissionUploadSessionService.js:58-69,208-246`
- Test: `backend/test/fileSubmissionService.test.js`
- Test: `backend/test/submissionUploadSessionService.test.js`

**Interfaces:**
- Consumes: `essayGradingService.ensureQueued` from Task 1.
- Produces: truthful `grading_queued: boolean` and optional injected `reportQueueError(context)` used only for safe internal diagnostics.

- [ ] **Step 1: Write failing multi-file tests**

Replace the injected `enqueue` dependency with `ensureQueued` and add:

```js
test('confirm reports false and logs safely when automatic enqueue fails', async () => {
  const reports = [];
  const service = createSubmissionUploadSessionService({}, {
    getStudentDelivery: async () => essayDetail,
    loadOwnedSession: async () => ({ id: 'session-1', user_id: 'u1', delivery_id: 'd1', status: 'confirmed' }),
    confirmRpc: async () => ({ submission: { id: 'submission-1', delivery_id: 'd1', user_id: 'u1' }, created: false }),
    loadAssignment: async () => ({ ...essayDetail.assignment, essay_model_answer: 'bí mật', essay_rubric: [] }),
    ensureQueued: async () => { throw new Error('database unavailable'); },
    reportQueueError: (context) => reports.push(context),
  });
  const result = await service.confirmSession({ studentId: 'u1', sessionId: 'session-1' });
  assert.equal(result.success, true);
  assert.equal(result.grading_queued, false);
  assert.equal(reports.length, 1);
  assert.equal(reports[0].submissionId, 'submission-1');
});

test('repeated confirm repairs the first enqueue failure without a second submission', async () => {
  let attempts = 0;
  const service = createSubmissionUploadSessionService({}, {
    getStudentDelivery: async () => essayDetail,
    loadOwnedSession: async () => ({ id: 'session-1', user_id: 'u1', delivery_id: 'd1', status: 'confirmed' }),
    confirmRpc: async () => ({ submission: { id: 'submission-1', delivery_id: 'd1', user_id: 'u1' }, created: false }),
    loadAssignment: async () => ({ ...essayDetail.assignment, essay_model_answer: 'Đáp án', essay_rubric: [] }),
    ensureQueued: async () => ({ job: { id: `job-${++attempts}` }, created: true }),
  });
  const result = await service.confirmSession({ studentId: 'u1', sessionId: 'session-1' });
  assert.equal(result.grading_queued, true);
  assert.equal(attempts, 1);
});
```

- [ ] **Step 2: Write a failing one-file status test**

Add this test, using a temporary upload directory so no workspace artifact remains:

```js
test('single-file submission stays successful but reports false when automatic enqueue fails', async () => {
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-queue-status-'));
  const reports = [];
  const assignment = {
    id: 'assignment-1', submission_type: 'essay', allowed_mime_types: ['image/jpeg'],
    max_file_size_mb: 1, allow_late_submission: true, ai_grading_enabled: true,
    essay_model_answer: 'Đáp án', essay_rubric: [], max_score: 10,
  };
  const created = { id: 'submission-1', delivery_id: 'delivery-1', user_id: 'student-1' };
  const db = {
    from(table) {
      if (table === 'assignment_deliveries') return queryReturning({
        id: 'delivery-1', class_id: 'class-1', recipient_mode: 'all',
        max_submissions: null, due_date: null, assignment,
      });
      if (table === 'enrollments') return queryReturning({ id: 'enrollment-1' });
      if (table === 'submissions') {
        const query = {
          select: () => query, eq: () => query, not: () => query,
          update: () => query,
          order: async () => ({ data: [], error: null }),
          maybeSingle: async () => ({ data: created, error: null }),
        };
        return query;
      }
      throw new Error(`Unexpected table: ${table}`);
    },
    rpc: async () => ({ data: created, error: null }),
  };
  const service = createFileSubmissionService(db, {
    uploadsDir, r2Upload: async () => true,
    ensureQueued: async () => { throw new Error('database unavailable'); },
    reportQueueError: (context) => reports.push(context),
  });
  try {
    const result = await service.submitStudentFile({
      studentId: 'student-1', deliveryId: 'delivery-1', fileName: 'answer.jpg',
      mimeType: 'image/jpeg', fileSize: 4,
      fileData: `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0x00]).toString('base64')}`,
    });
    assert.equal(result.success, true);
    assert.equal(result.grading_queued, false);
    assert.equal(reports.length, 1);
    assert.equal(reports[0].submissionId, 'submission-1');
  } finally {
    fs.rmSync(uploadsDir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 3: Run tests and verify RED**

Run:

```powershell
node --test test/submissionUploadSessionService.test.js
node --test --test-name-pattern="automatic enqueue" test/fileSubmissionService.test.js
```

Expected: multi-file test fails because the existing result reports `true`; one-file dependency injection is not yet supported.

- [ ] **Step 4: Implement truthful status and safe reporting**

Add this module-level default reporter in both services or one shared small helper:

```js
export const reportEssayQueueError = ({ operation, submissionId, assignmentId, error }) => {
  console.error(JSON.stringify({
    level: 'error', message: 'Essay grading enqueue failed', operation,
    submission_id: submissionId || null, assignment_id: assignmentId || null,
    error: String(error?.message || error || 'unknown').slice(0, 500),
  }));
};
```

Inject `ensureQueued` and `reportQueueError` into both factories for deterministic tests. After a durable submission, call `ensureQueued` regardless of the multi-file RPC's `created` value. Set `gradingQueued = Boolean(result.job)` only after the promise resolves. On error, call the reporter and retain `false`; never throw away the submission.

- [ ] **Step 5: Run targeted tests**

Run:

```powershell
node --test test/essayGradingService.test.js test/fileSubmissionService.test.js test/submissionUploadSessionService.test.js
```

Expected: all targeted tests pass with zero failures.

- [ ] **Step 6: Commit**

```powershell
git add backend/src/services/fileSubmissionService.js backend/src/services/submissionUploadSessionService.js backend/src/services/essayQueueDiagnostics.js backend/test/fileSubmissionService.test.js backend/test/submissionUploadSessionService.test.js
git commit -m "fix: report essay queue status truthfully"
```

---

### Task 3: Private selector for submissions missing initial jobs

**Files:**
- Create: `backend/src/database/migrations/018_automatic_essay_queue_repair.sql`
- Create: `supabase/migrations/023_automatic_essay_queue_repair.sql`
- Create: `backend/test/essayQueueRepairMigration.test.js`

**Interfaces:**
- Produces: `list_missing_essay_grading_submissions(p_limit INTEGER DEFAULT 20) RETURNS TABLE(submission_id UUID)`; executable only by `service_role`.

- [ ] **Step 1: Write the failing migration contract test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const paths = [
  new URL('../src/database/migrations/018_automatic_essay_queue_repair.sql', import.meta.url),
  new URL('../../supabase/migrations/023_automatic_essay_queue_repair.sql', import.meta.url),
];

test('queue repair migrations are identical, bounded and service-role-only', async () => {
  const [backendSql, supabaseSql] = await Promise.all(paths.map((url) => readFile(url, 'utf8')));
  assert.equal(backendSql, supabaseSql);
  assert.match(backendSql, /list_missing_essay_grading_submissions/i);
  assert.match(backendSql, /submission_type\s*=\s*'essay'/i);
  assert.match(backendSql, /ai_grading_enabled\s*=\s*TRUE/i);
  assert.match(backendSql, /is_latest\s*=\s*TRUE/i);
  assert.match(backendSql, /NOT EXISTS[\s\S]*essay_grading_jobs/i);
  assert.match(backendSql, /LEAST[\s\S]*100/i);
  assert.match(backendSql, /REVOKE ALL[\s\S]*PUBLIC, anon, authenticated/i);
  assert.match(backendSql, /GRANT EXECUTE[\s\S]*service_role/i);
  assert.doesNotMatch(backendSql, /DROP\s+(TABLE|COLUMN)/i);
});
```

- [ ] **Step 2: Run test and verify RED**

Run: `node --test test/essayQueueRepairMigration.test.js` from `backend`.

Expected: FAIL with `ENOENT` because both migrations do not exist.

- [ ] **Step 3: Write identical additive migrations**

Create both files with this contract:

```sql
CREATE OR REPLACE FUNCTION public.list_missing_essay_grading_submissions(
  p_limit INTEGER DEFAULT 20
) RETURNS TABLE(submission_id UUID)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog
AS $$
  SELECT submission.id
  FROM public.submissions AS submission
  JOIN public.assignments AS assignment ON assignment.id = submission.assignment_id
  WHERE submission.object_key IS NOT NULL
    AND submission.is_latest = TRUE
    AND assignment.submission_type = 'essay'
    AND assignment.ai_grading_enabled = TRUE
    AND NOT EXISTS (
      SELECT 1 FROM public.essay_grading_jobs AS job
      WHERE job.submission_id = submission.id
    )
  ORDER BY submission.submitted_at, submission.id
  LIMIT pg_catalog.GREATEST(1, pg_catalog.LEAST(COALESCE(p_limit, 20), 100));
$$;

REVOKE ALL ON FUNCTION public.list_missing_essay_grading_submissions(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_missing_essay_grading_submissions(INTEGER)
  TO service_role;
```

- [ ] **Step 4: Run migration tests**

Run:

```powershell
node --test test/essayQueueRepairMigration.test.js test/essayGradingMigration.test.js test/multiFileSubmissionMigration.test.js
```

Expected: all migration contract tests pass.

- [ ] **Step 5: Commit**

```powershell
git add backend/src/database/migrations/018_automatic_essay_queue_repair.sql supabase/migrations/023_automatic_essay_queue_repair.sql backend/test/essayQueueRepairMigration.test.js
git commit -m "feat: select essay submissions missing queue jobs"
```

---

### Task 4: Automatic queue reconciliation worker

**Files:**
- Create: `backend/src/services/essayQueueReconciler.js`
- Create: `backend/test/essayQueueReconciler.test.js`
- Modify: `backend/src/app.js:175-205`
- Modify: `render.yaml`

**Interfaces:**
- Consumes: RPC from Task 3 and `ensureQueued` from Task 1.
- Produces: `createEssayQueueReconciler({ db, ensureQueued, reportQueueError, limit }): { runOnce, start }`.
- `runOnce(): Promise<{ scanned: number, queued: number, existing: number, failed: number }>`.

- [ ] **Step 1: Write failing worker tests**

Add this deterministic DB helper and the worker behavior tests:

```js
const reconciliationDb = ({ ids, assignmentOverrides = {} }) => ({
  rpc: async () => ({ data: ids.map((submission_id) => ({ submission_id })), error: null }),
  from(table) {
    let selectedId;
    const query = {
      select: () => query,
      eq(field, value) { if (field === 'id') selectedId = value; return query; },
      maybeSingle: async () => table === 'submissions'
        ? ({ data: { id: selectedId, assignment_id: `a-${selectedId}`, delivery_id: 'd1', user_id: 'u1', object_key: 'local://answer.jpg', is_latest: true }, error: null })
        : ({ data: { id: selectedId, submission_type: 'essay', ai_grading_enabled: true, content_version: 1, essay_model_answer: 'A', essay_rubric: [], ...assignmentOverrides }, error: null }),
    };
    return query;
  },
});

test('reconciler queues each eligible missing submission sequentially', async () => {
  const calls = [];
  const worker = createEssayQueueReconciler({
    db: reconciliationDb({ ids: ['s1', 's2'] }),
    ensureQueued: async ({ submission }) => { calls.push(submission.id); return { job: { id: `j-${submission.id}` }, created: true }; },
    reportQueueError: () => {},
  });
  assert.deepEqual(await worker.runOnce(), { scanned: 2, queued: 2, existing: 0, failed: 0 });
  assert.deepEqual(calls, ['s1', 's2']);
});

test('reconciler continues after one item fails', async () => {
  const reports = [];
  const worker = createEssayQueueReconciler({
    db: reconciliationDb({ ids: ['s1', 's2'] }),
    ensureQueued: async ({ submission }) => {
      if (submission.id === 's1') throw new Error('temporary database failure');
      return { job: { id: 'j2' }, created: false };
    },
    reportQueueError: (context) => reports.push(context),
  });
  assert.deepEqual(await worker.runOnce(), { scanned: 2, queued: 0, existing: 1, failed: 1 });
  assert.equal(reports.length, 1);
});

test('reconciler skips a submission that is no longer eligible', async () => {
  let ensureCalls = 0;
  const worker = createEssayQueueReconciler({
    db: reconciliationDb({ ids: ['s1'], assignmentOverrides: { ai_grading_enabled: false } }),
    ensureQueued: async () => { ensureCalls += 1; return { job: null, created: false }; },
    reportQueueError: () => {},
  });
  assert.deepEqual(await worker.runOnce(), { scanned: 1, queued: 0, existing: 1, failed: 0 });
  assert.equal(ensureCalls, 0);
});

test('reconciler start returns a cleanup function', () => {
  const worker = createEssayQueueReconciler({
    db: reconciliationDb({ ids: [] }), ensureQueued: async () => ({ job: null, created: false }), reportQueueError: () => {},
  });
  const stop = worker.start({ intervalMs: 60000 });
  assert.equal(typeof stop, 'function');
  stop();
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test test/essayQueueReconciler.test.js` from `backend`.

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the reconciler**

Implement `runOnce` to call the RPC with `{ p_limit: limit }`, loop returned `submission_id` values, load `submissions` and `assignments`, recheck `object_key`, `is_latest`, `submission_type`, and `ai_grading_enabled`, then call `ensureQueued` sequentially. Increment `queued` only for `created: true`, `existing` for an existing job or a no-longer-eligible row, and `failed` only for a thrown error. Use the diagnostics helper from Task 2.

Implement:

```js
const start = ({ intervalMs = 30000 } = {}) => {
  const timer = setInterval(() => { runOnce().catch((error) => reportQueueError({ operation: 'reconcile_batch', error })); }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
};
```

- [ ] **Step 4: Start the worker from the backend app**

Add a startup function guarded by:

```js
if (process.env.AI_ESSAY_QUEUE_RECONCILER_ENABLED === 'false' || !process.env.GEMINI_API_KEY) return;
```

Use `AI_ESSAY_QUEUE_RECONCILER_POLL_MS || 30000`, log only worker startup/failure metadata, and add these optional Render variables:

```yaml
- key: AI_ESSAY_QUEUE_RECONCILER_ENABLED
  value: "true"
- key: AI_ESSAY_QUEUE_RECONCILER_POLL_MS
  value: "30000"
```

- [ ] **Step 5: Run worker and app-source tests**

Run:

```powershell
node --test test/essayQueueReconciler.test.js
npm test -- --test-name-pattern="essay.*queue|ensureQueued|confirm"
```

Expected: all selected tests pass with zero failures.

- [ ] **Step 6: Commit**

```powershell
git add backend/src/services/essayQueueReconciler.js backend/test/essayQueueReconciler.test.js backend/src/app.js render.yaml
git commit -m "feat: reconcile missing essay grading jobs"
```

---

### Task 5: Full verification and handoff

**Files:**
- Verify all files changed in Tasks 1-4.

**Interfaces:**
- Consumes: completed local implementation.
- Produces: fresh test/build evidence and a bounded release description; no production mutation.

- [ ] **Step 1: Run formatting and diff checks**

Run:

```powershell
git diff --check HEAD~4..HEAD
git status --short
```

Expected: no whitespace errors and only intended files changed.

- [ ] **Step 2: Run complete test suites**

Run in parallel where practical:

```powershell
npm test --prefix backend
npm test --prefix frontend
npm run test:docs
```

Expected: zero failures in all suites.

- [ ] **Step 3: Build the production frontend**

Run: `npm run build --prefix frontend`.

Expected: Vite exits 0 and produces the production bundle.

- [ ] **Step 4: Review the final branch**

Run:

```powershell
git log --oneline --decorate main..HEAD
git diff --stat main...HEAD
git status --short
```

Expected: design, plan, service, migration, worker, test, and optional Render configuration commits only; clean worktree after ignoring generated build artifacts already tracked by project policy.

- [ ] **Step 5: Use the finishing-development workflow**

Present merge/PR/keep-worktree choices. Do not merge, push, deploy, apply migration, change Render variables, or delete the worktree without explicit user direction.
