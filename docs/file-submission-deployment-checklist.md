# Multi-file Essay Submission Deployment Checklist

## 1. Release scope

- [ ] Confirm the release contains the additive database migration, compatible Express backend/AI worker, and matching frontend bundle.
- [ ] Confirm essay students may submit **1-5 ordered files as one attempt**; practice assignments remain single-file.
- [ ] Confirm a resubmission creates a new parent attempt and does not overwrite the previous bundle.
- [ ] Do not delete legacy submission columns, confirmed files, or old attempts during rollout or rollback.

## 2. Storage and backend configuration

The private Cloudflare R2 token must be scoped to the submissions bucket and allow object **read, write, and delete**. Delete permission is required only for abandoned-session cleanup; confirmed submission files are excluded from that worker.

Required backend secrets:

```dotenv
R2_ACCOUNT_ID=<account-id>
R2_BUCKET_NAME=lms-submissions
R2_ACCESS_KEY_ID=<server-only-access-key>
R2_SECRET_ACCESS_KEY=<server-only-secret>
SUPABASE_URL=<project-url>
SUPABASE_SERVICE_ROLE_KEY=<server-only-service-role-key>
JWT_SECRET=<application-jwt-secret>
```

Recommended worker settings:

```dotenv
SUBMISSION_UPLOAD_CLEANUP_ENABLED=true
SUBMISSION_UPLOAD_CLEANUP_POLL_MS=60000
AI_ESSAY_GRADING_WORKER_ENABLED=true
AI_ESSAY_MAX_EXTRACTED_CHARS=100000
```

Never place R2, Supabase service-role, JWT, or Gemini secrets in frontend variables.

## 3. Database migration first

- [ ] Back up production and record the current row count in `public.submissions`.
- [ ] Apply `supabase/migrations/022_multi_file_essay_submissions.sql` to Supabase production. The equivalent backend migration is `backend/src/database/migrations/017_multi_file_essay_submissions.sql`.
- [ ] Verify `submission_files`, `submission_upload_sessions`, and `submission_upload_session_files` exist and have RLS enabled.
- [ ] Verify `anon` and `authenticated` have no table privileges; `service_role` has only the required CRUD/execute privileges.
- [ ] Verify the pre-migration `public.submissions` rows and counts are unchanged.
- [ ] Verify `confirm_multi_file_submission` is callable only through the backend service role.

The migration is additive and idempotent. Do not drop these tables as an application rollback.

## 4. Deploy compatible backend second

Deploy the Express service and AI/cleanup workers only after migration `022` succeeds. The backend exposes:

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/file-submissions/deliveries/:deliveryId/upload-sessions` | Create a 1-5 file upload session from metadata |
| `POST` | `/api/file-submissions/upload-sessions/:sessionId/files/:fileId` | Upload one raw file body |
| `POST` | `/api/file-submissions/upload-sessions/:sessionId/confirm` | Atomically create one parent attempt and its ordered children |
| `DELETE` | `/api/file-submissions/upload-sessions/:sessionId` | Cancel and clean an incomplete bundle |
| `GET` | `/api/file-submissions/:submissionId/files/:fileId/download` | Authorized child-file download |

- [ ] Check `/health` after deployment.
- [ ] Verify cleanup worker startup without printing credentials or object keys.
- [ ] Verify the AI worker reads child files sequentially and creates one parent-level report.

## 5. Deploy frontend third

- [ ] Build with `VITE_API_URL=https://lms-thpt-camau.onrender.com` for the combined Render target.
- [ ] Deploy the hashed Vite bundle after the backend is healthy.
- [ ] Fetch the live HTML and referenced JS bundle; verify markers for `upload-sessions`, `selectedFiles`, and child-file download routes.
- [ ] Hard-refresh and verify practice assignments still show one-file selection.

## 6. Safe production probes

Use synthetic teacher/student accounts only. Do not use real student credentials or files.

- [ ] Owner submits one file and receives one parent attempt.
- [ ] Owner submits five files; order is preserved in student and teacher history.
- [ ] Failure on file 2 records no submission; retrying the whole bundle succeeds.
- [ ] Repeating confirm for the same session returns the same submission ID.
- [ ] Resubmission creates a new parent while the prior bundle remains readable.
- [ ] Non-owner student and unrelated teacher receive `403` for child downloads.
- [ ] Owner student and owning teacher can download every child.
- [ ] AI produces one report with ordered file boundaries; one unreadable file is named in warnings while readable files are still graded.
- [ ] CSV/XLSX export contains joined safe file names only, never object keys, tokens, or private URLs.

## 7. Rollback

- [ ] Disable the multi-file frontend path or roll back application code as one compatible unit.
- [ ] Set `SUBMISSION_UPLOAD_CLEANUP_ENABLED=false` only if cleanup itself is suspected.
- [ ] Do not drop additive tables and do not delete confirmed files.
- [ ] Keep migration `022` in place so older single-file application code can continue using legacy submission fields.
