# Essay AI Rate-Limit Hotfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent Gemini quota exhaustion from blocking AI essay grading and safely resume provider-failed production jobs.

**Architecture:** Put one serialized, cooldown-aware request gate inside the Gemini essay provider so extraction and grading share the same quota budget. Change the database worker scheduler from an overlapping interval to a completion-driven timeout loop, and treat provider rate limiting as a non-consuming retry. Keep queue reconciliation and grading-job uniqueness unchanged.

**Tech Stack:** Node.js 22, native `node:test`, Express worker process, Gemini REST API, Supabase Postgres, Render.

## Global Constraints

- Default `GEMINI_ESSAY_MIN_REQUEST_INTERVAL_MS` is exactly `4000` milliseconds.
- `HTTP 429` maps to `AI_RATE_LIMITED` and honors `Retry-After`, falling back to 60 seconds.
- A rate-limited claim does not consume the job's retry budget.
- Do not log API keys, student identity, file content, model answers, rubrics, or extracted text.
- Do not modify submission, file, report, score, or review rows during recovery.
- Do not deploy frontend code or unrelated dirty files.

---

### Task 1: Add a serialized Gemini request gate

**Files:**
- Modify: `backend/test/geminiEssayProvider.test.js`
- Modify: `backend/src/ai/providers/geminiEssayProvider.js`

**Interfaces:**
- Consumes: existing `createGeminiEssayProvider({ apiKey, model, fetchImpl })` calls.
- Produces: `createGeminiEssayProvider({ apiKey, model, fetchImpl, minRequestIntervalMs, now, sleep })`; thrown `AI_RATE_LIMITED` errors include numeric `retryAfterMs`.

- [ ] **Step 1: Write failing tests for serialization and minimum spacing**

Append tests that inject a deterministic clock and record request start times:

```js
test('serializes Gemini calls and spaces request starts', async () => {
  let clock = 0;
  const starts = [];
  const provider = createGeminiEssayProvider({
    apiKey: 'key', model: 'gemini-test', minRequestIntervalMs: 4000,
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
    fetchImpl: async () => {
      starts.push(clock);
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }], usageMetadata: {} }) };
    },
  });
  await Promise.all([
    provider.grade({ system: 's', user: 'u1', schema: { type: 'object' } }),
    provider.extract({ system: 's', user: 'u2', schema: { type: 'object' } }),
  ]);
  assert.deepEqual(starts, [0, 4000]);
});
```

- [ ] **Step 2: Write a failing test for `429` cooldown**

```js
test('maps 429 to a shared Retry-After cooldown', async () => {
  let clock = 0;
  const starts = [];
  let calls = 0;
  const provider = createGeminiEssayProvider({
    apiKey: 'key', model: 'gemini-test', minRequestIntervalMs: 4000,
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
    fetchImpl: async () => {
      starts.push(clock);
      calls += 1;
      if (calls === 1) return {
        ok: false, status: 429,
        headers: { get: (name) => name.toLowerCase() === 'retry-after' ? '43' : null },
        json: async () => ({ error: { status: 'RESOURCE_EXHAUSTED' } }),
      };
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }) };
    },
  });
  await assert.rejects(
    provider.grade({ system: 's', user: 'u1', schema: { type: 'object' } }),
    (error) => error.code === 'AI_RATE_LIMITED' && error.retryAfterMs === 43000,
  );
  await provider.grade({ system: 's', user: 'u2', schema: { type: 'object' } });
  assert.deepEqual(starts, [0, 43000]);
});
```

- [ ] **Step 3: Run the provider tests and verify RED**

Run: `node --test test/geminiEssayProvider.test.js`

Expected: both new tests fail because calls are not serialized and `429` is still `AI_PROVIDER_ERROR` without `retryAfterMs`.

- [ ] **Step 4: Implement the minimal request gate**

In `geminiEssayProvider.js`:

```js
const DEFAULT_INTERVAL_MS = 4000;
const DEFAULT_RETRY_AFTER_MS = 60000;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const retryAfterMs = (response, body) => {
  const header = Number(response.headers?.get?.('retry-after'));
  if (Number.isFinite(header) && header >= 0) return header * 1000;
  const match = String(body?.error?.message || '').match(/retry in\s+([0-9.]+)s/i);
  return match ? Math.ceil(Number(match[1]) * 1000) : DEFAULT_RETRY_AFTER_MS;
};
```

Extend the factory arguments with injected `now` and `sleep`, keep a shared `chain`, `nextRequestAt`, and `cooldownUntil`, and route both `grade` and `extract` through:

```js
const schedule = (operation) => {
  const run = async () => {
    const delay = Math.max(0, nextRequestAt - now(), cooldownUntil - now());
    if (delay) await sleep(delay);
    const startedAt = now();
    nextRequestAt = startedAt + intervalMs;
    return operation();
  };
  const result = chain.then(run, run);
  chain = result.catch(() => undefined);
  return result;
};
```

Inside the scheduled fetch, parse the bounded JSON error body. For status `429`, set `cooldownUntil`, throw `{ code: 'AI_RATE_LIMITED', retryAfterMs }`; retain `AI_PROVIDER_ERROR` for other non-success statuses.

- [ ] **Step 5: Run the provider tests and verify GREEN**

Run: `node --test test/geminiEssayProvider.test.js`

Expected: all provider tests pass with no unhandled rejection.

- [ ] **Step 6: Commit Task 1**

```bash
git add backend/test/geminiEssayProvider.test.js backend/src/ai/providers/geminiEssayProvider.js
git commit -m "fix: pace Gemini essay requests"
```

---

### Task 2: Make the worker rate-limit safe and non-overlapping

**Files:**
- Modify: `backend/test/essayGradingWorker.test.js`
- Modify: `backend/src/services/essayGradingWorker.js`

**Interfaces:**
- Consumes: provider errors with `code = 'AI_RATE_LIMITED'` and `retryAfterMs`.
- Produces: rate-limited job updates that preserve the pre-claim attempt count; `start({ intervalMs, setTimer, clearTimer })` schedules only after `runOnce()` settles.

- [ ] **Step 1: Write a failing safe-code assertion**

Extend the existing safe-code test:

```js
assert.equal(safeEssayErrorCode({ code: 'AI_RATE_LIMITED' }), 'AI_RATE_LIMITED');
```

- [ ] **Step 2: Write a failing rate-limit retry test**

Create a fake claimed job with `attempt_count: 3`. Make `gateway.generate()` throw an error with `code = 'AI_RATE_LIMITED'` and `retryAfterMs = 43000`. Capture the final job update and assert:

```js
assert.equal(finalPatch.status, 'queued');
assert.equal(finalPatch.error_code, 'AI_RATE_LIMITED');
assert.equal(finalPatch.attempt_count, 2);
assert.equal(finalPatch.next_attempt_at, new Date(nowValue + 43000).toISOString());
assert.equal(result.retrying, true);
```

The fake DB must return a valid submission and assignment, accept the lease update, and capture the second update to `essay_grading_jobs`; it must not create a report.

- [ ] **Step 3: Write a failing scheduler overlap test**

Inject a fake `setTimer` that captures callbacks and a deferred gateway promise. Invoke the first callback, then verify no second timer is scheduled until the deferred `runOnce()` resolves:

```js
const stop = worker.start({ intervalMs: 5000, setTimer, clearTimer });
assert.equal(timers.length, 1);
const firstTick = timers.shift();
const pending = firstTick.callback();
assert.equal(timers.length, 0);
resolveGateway(validGeneratedResult);
await pending;
assert.equal(timers.length, 1);
stop();
```

- [ ] **Step 4: Run the worker tests and verify RED**

Run: `node --test test/essayGradingWorker.test.js`

Expected: safe-code and retry assertions fail; the current `setInterval` scheduler does not expose or satisfy the completion-driven timer contract.

- [ ] **Step 5: Implement rate-limit retry semantics**

Add `AI_RATE_LIMITED` to `SAFE_CODES`. In the catch block:

```js
const rateLimited = code === 'AI_RATE_LIMITED';
const retry = rateLimited || (RETRYABLE.has(code) && attempt < maxAttempts);
const delay = rateLimited
  ? Math.max(1000, Number(error.retryAfterMs) || 60000)
  : backoffMs(attempt);
const patch = {
  status: retry ? 'queued' : 'failed',
  error_code: code,
  next_attempt_at: new Date(now() + (retry ? delay : 0)).toISOString(),
  updated_at: new Date(now()).toISOString(),
  lease_owner: null,
  lease_expires_at: null,
};
if (rateLimited) patch.attempt_count = Math.max(0, attempt - 1);
```

Keep the existing safe event metadata.

- [ ] **Step 6: Replace overlapping `setInterval` with a completion-driven loop**

Use injectable timers and schedule the next callback in `finally`:

```js
const start = ({
  intervalMs = 5000,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) => {
  let stopped = false;
  let timer = null;
  const schedule = () => {
    if (stopped) return;
    timer = setTimer(tick, intervalMs);
    timer?.unref?.();
  };
  const tick = async () => {
    try { await runOnce(); } catch { /* isolate one tick */ }
    finally { schedule(); }
  };
  schedule();
  return () => { stopped = true; if (timer !== null) clearTimer(timer); };
};
```

- [ ] **Step 7: Run the worker tests and verify GREEN**

Run: `node --test test/essayGradingWorker.test.js`

Expected: all worker tests pass, including the new non-overlap and retry-budget cases.

- [ ] **Step 8: Commit Task 2**

```bash
git add backend/test/essayGradingWorker.test.js backend/src/services/essayGradingWorker.js
git commit -m "fix: make essay grading worker quota-safe"
```

---

### Task 3: Wire the production pacing configuration

**Files:**
- Modify: `backend/test/essayQueueReconcilerStartup.test.js`
- Modify: `backend/src/app.js`
- Modify: `render.yaml`

**Interfaces:**
- Consumes: `GEMINI_ESSAY_MIN_REQUEST_INTERVAL_MS`.
- Produces: an explicit 4000 ms provider interval in production and the same code fallback.

- [ ] **Step 1: Write a failing configuration contract test**

Add assertions:

```js
assert.match(app, /GEMINI_ESSAY_MIN_REQUEST_INTERVAL_MS/);
assert.match(render, /key:\s*GEMINI_ESSAY_MIN_REQUEST_INTERVAL_MS[\s\S]*value:\s*"4000"/);
```

- [ ] **Step 2: Run the configuration test and verify RED**

Run: `node --test test/essayQueueReconcilerStartup.test.js`

Expected: failure because neither application wiring nor `render.yaml` contains the new setting.

- [ ] **Step 3: Pass the setting into the provider**

In `startEssayGradingWorker()`:

```js
gemini: createGeminiEssayProvider({
  apiKey: process.env.GEMINI_API_KEY,
  model: process.env.GEMINI_ESSAY_MODEL,
  minRequestIntervalMs: Number(process.env.GEMINI_ESSAY_MIN_REQUEST_INTERVAL_MS) || 4000,
}),
```

Add to `render.yaml` beside the essay worker settings:

```yaml
      - key: GEMINI_ESSAY_MIN_REQUEST_INTERVAL_MS
        value: "4000"
```

- [ ] **Step 4: Run the configuration and targeted essay suites**

Run:

```bash
node --test test/essayQueueReconcilerStartup.test.js test/geminiEssayProvider.test.js test/essayGradingWorker.test.js test/essayQueueReconciler.test.js
```

Expected: all targeted tests pass.

- [ ] **Step 5: Commit Task 3**

```bash
git add backend/test/essayQueueReconcilerStartup.test.js backend/src/app.js render.yaml
git commit -m "ops: configure Gemini essay pacing"
```

---

### Task 4: Verify, review, merge, and prepare the bounded release

**Files:**
- Verify all committed files from Tasks 1–3.
- No production mutation until the separate release confirmation.

**Interfaces:**
- Consumes: the completed hotfix branch.
- Produces: one reviewed commit range ready for `main`, Render, and bounded job recovery.

- [ ] **Step 1: Install dependencies in the isolated worktree**

Run `npm install`, `npm install --prefix backend`, and `npm install --prefix frontend` only if the corresponding `node_modules` directory is absent.

- [ ] **Step 2: Run full verification**

Run:

```bash
npm test --prefix backend
npm test --prefix frontend
npm run test:docs
npm run build --prefix frontend
git diff --check main...HEAD
```

Expected: backend, frontend, and documentation suites have zero failures; Vite exits 0; diff check is clean.

- [ ] **Step 3: Review the final diff against the design**

Confirm that only provider pacing, worker scheduling/retry semantics, configuration, tests, spec, and plan changed. Confirm no API key, submission ID, student data, generated `frontend/dist`, or unrelated dirty file is committed.

- [ ] **Step 4: Merge locally while preserving the dirty main checkout**

Verify the feature paths do not overlap dirty main paths, fetch `origin/main`, and fast-forward `main` only when the remote base is still `6813bd6`. Rerun backend/frontend/documentation tests on the merged commit without rebuilding into the user's dirty `frontend/dist`.

- [ ] **Step 5: State the exact production payload and request confirmation**

Name the final commit, GitHub `origin/main`, Render service `lms-thpt-camau`, absence of migrations/frontend deployment, and the bounded recovery update. Explicitly exclude all pre-existing dirty/untracked files.

- [ ] **Step 6: After confirmation, deploy and recover provider-failed jobs**

Push the exact commit to `origin/main`. Wait until Render shows that commit as Live and health is `200`. Then run this bounded update through `supabase db query --linked`:

```sql
UPDATE public.essay_grading_jobs AS job
SET status = 'queued',
    attempt_count = 0,
    error_code = NULL,
    next_attempt_at = NOW(),
    lease_owner = NULL,
    lease_expires_at = NULL,
    updated_at = NOW()
WHERE job.status = 'failed'
  AND job.error_code = 'AI_PROVIDER_ERROR'
  AND NOT EXISTS (
    SELECT 1
    FROM public.essay_grading_reports AS report
    WHERE report.job_id = job.id
      AND report.published_at IS NOT NULL
  )
RETURNING job.id;
```

Count returned rows but do not print IDs in the user-facing result.

- [ ] **Step 7: Verify live recovery**

Query only aggregate job/event states. Confirm no new burst of `AI_RATE_LIMITED` or `AI_PROVIDER_ERROR`, attempts do not rise on rate limiting, and at least one queued job progresses to `awaiting_review`. If the quota remains unavailable, report the exact bounded state and leave jobs queued for later processing rather than forcing retries.

- [ ] **Step 8: Clean the release worktree after verified completion**

Remove only the verified clean hotfix/release worktree and merged feature branch. Preserve every other worktree and all user-owned dirty files.
