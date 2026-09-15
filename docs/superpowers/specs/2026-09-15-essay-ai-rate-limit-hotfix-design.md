# Essay AI Rate-Limit Hotfix Design

## Context

Production successfully creates essay grading jobs, but Gemini grading is not completing. Database evidence after deployment showed 147 queued jobs with `AI_PROVIDER_ERROR` and up to two attempts. A minimal request using the configured `gemini-3.6-flash` model reproduced `HTTP 429 RESOURCE_EXHAUSTED`; Gemini reported a free-tier limit of 20 requests and a retry delay of about 43 seconds.

The automatic reconciliation release exposed the underlying capacity defect by backfilling more than 150 historical submissions. The essay worker starts a new asynchronous `runOnce()` every five seconds without waiting for the previous call to finish. A multi-file job may also make several Gemini requests in succession. Together, these behaviors can exceed the provider quota and consume a job's retry budget even though the submission itself is valid.

## Goals

- Keep Gemini essay requests below the configured free-tier request rate.
- Ensure only one essay grading job is active in a worker process at a time.
- Respect Gemini's `Retry-After` response when the API returns `429`.
- Do not consume a submission's retry budget for provider rate limiting.
- Resume existing queued jobs without creating duplicate grading jobs.
- Recover only failed jobs whose safe error code is `AI_PROVIDER_ERROR`; leave content, validation, and file failures unchanged.
- Preserve privacy: do not log API keys, student identity, file content, model answers, rubrics, or extracted text.

## Non-Goals

- Changing essay grading prompts, schemas, scores, or teacher review behavior.
- Changing file upload, storage, or submission confirmation behavior.
- Purchasing quota or changing the Gemini billing plan.
- Requeueing `AI_ESSAY_FAILED`, `FILE_INVALID`, or other non-provider failures.
- Deploying frontend code.

## Considered Approaches

### 1. Application-level pacing and cooldown (recommended)

Serialize Gemini calls, apply a minimum delay between every provider request, prevent overlapping worker ticks, and honor provider retry timing. This fixes the defect regardless of current quota tier and keeps costs bounded.

### 2. Increase Gemini quota only

This may remove the immediate symptom, but overlapping worker ticks and multi-file bursts would remain. A later backlog or lower quota could reproduce the outage and increase spending unexpectedly.

### 3. Increase only the worker polling interval

This is a quick operational mitigation, but it does not control the number of Gemini calls inside one multi-file job and does not honor `Retry-After`. It also makes normal queue latency depend on a coarse environment setting.

## Design

### Provider request gate

`createGeminiEssayProvider` will own one request gate shared by `grade` and `extract` calls from the essay worker.

- A new option `minRequestIntervalMs` defaults from `GEMINI_ESSAY_MIN_REQUEST_INTERVAL_MS`, falling back to `4000` milliseconds. This caps a continuously busy process at approximately 15 request starts per minute, leaving headroom below the observed 20-request free-tier limit.
- Calls are serialized through a promise chain. Before starting a request, the gate waits until the later of the normal pacing time and any provider cooldown time.
- Tests inject `now` and `sleep` so pacing and cooldown are deterministic without real delays.
- A rejected request must release the chain so later requests are not permanently blocked.

### Structured rate-limit errors

When Gemini returns a non-success response, the provider will read only bounded error metadata.

- `429` becomes `AI_RATE_LIMITED` instead of generic `AI_PROVIDER_ERROR`.
- `retryAfterMs` is derived from the `Retry-After` header when present, then from Google's retry-delay text when necessary, with a safe fallback of 60 seconds.
- The provider advances its shared cooldown before throwing.
- Other HTTP failures remain `AI_PROVIDER_ERROR`.
- Error messages expose only HTTP status and safe provider classification; response bodies are not logged.

### Non-overlapping worker loop

`essayGradingWorker.start()` will schedule the next tick only after the current `runOnce()` settles. It will not use an unconstrained asynchronous `setInterval` callback.

- A stopped worker schedules no further ticks.
- Unexpected `runOnce()` errors remain isolated so the loop continues.
- Existing claim leases remain the database-level protection across multiple processes.

### Job retry semantics

When a claimed job receives `AI_RATE_LIMITED`:

- Return it to `queued`.
- Set `next_attempt_at` to at least the provider's retry delay.
- Clear its lease.
- Restore `attempt_count` to its value before this rate-limited claim, so quota exhaustion cannot turn a valid submission into a terminal failure.
- Record `retry_scheduled` with only the safe error code.

Other retryable errors retain the existing attempt limit and exponential backoff.

### Existing production jobs

No new grading job rows are needed. The existing idempotent queue repair already treats every submission with a job as present.

After the hotfix is live and its startup is verified, run one bounded production update that changes only jobs satisfying all of these conditions:

- `status = 'failed'`
- `error_code = 'AI_PROVIDER_ERROR'`
- no published grading report exists for the job

Those rows return to `queued` with `attempt_count = 0`, `error_code = NULL`, cleared lease fields, and `next_attempt_at = NOW()`. Currently queued jobs are left intact and resume under the paced worker. No submission, file, report, score, or review row is modified.

## Configuration

Add `GEMINI_ESSAY_MIN_REQUEST_INTERVAL_MS=4000` to `render.yaml`. Existing worker and reconciler feature flags remain enabled. The default in code matches the production value so missing environment synchronization cannot remove the safety limit.

## Testing

- Provider tests prove concurrent calls start serially and at least four seconds apart under the default production configuration.
- Provider tests prove `429` maps to `AI_RATE_LIMITED`, honors `Retry-After`, and does not block later calls permanently.
- Worker tests prove the scheduler never overlaps two `runOnce()` calls.
- Worker tests prove rate-limited jobs return to `queued`, keep their prior attempt budget, and use the provider delay.
- Existing essay grading, queue reconciliation, upload, backend, frontend, documentation, and production build checks must remain green.

## Release and Verification

The release will use an isolated worktree and a committed hotfix only. Before production mutation, state the exact commit and destinations and obtain a separate confirmation.

Production scope:

- GitHub `origin/main`
- Render service `lms-thpt-camau`
- No new Supabase migration
- One bounded SQL recovery update for eligible `AI_PROVIDER_ERROR` jobs only
- No direct Vercel/frontend deployment
- No unrelated dirty or untracked files

Verification requires the Render deployment to show the exact commit as live, health to return `200`, startup logs to show the essay worker, database aggregates to show rate-limited jobs no longer burning attempts, and at least one existing job to progress without a new burst of `429` events. No real student credentials or PINs will be used.
