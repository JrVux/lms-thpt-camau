# File Submission Module Design

**Date:** 2026-08-29  
**Status:** Approved for implementation planning  
**Source:** `master-prompt-submission-module.md`

## Goal

Add manual-grading file submissions for practical and essay assignments without changing the existing Python, SQL, or HTML autograding flows. Students upload directly to a private Cloudflare R2 bucket through short-lived presigned URLs. PostgreSQL stores submission metadata, history, scores, and feedback.

## Existing-system constraints

- The frontend is React 18 with Vite and Tailwind CSS.
- The API is Express and authenticates users with an application JWT signed by `JWT_SECRET`.
- Supabase is used as PostgreSQL through a server-side service-role client. The application does not use Supabase Auth.
- Assignments are reusable library records. `assignment_deliveries` connects an assignment to a class and owns the class-specific deadline, publication state, recipients, and submission limit.
- `submissions` already stores autograded code submissions and must be extended rather than replaced.
- R2 infrastructure is configured in the `jrvux18` Supabase project. The private `lms-submissions` bucket has CORS for the production frontend and `http://localhost:5173`. R2 credentials are stored as Edge Function secrets.

## Architectural decision

Keep the existing Express authentication system. Supabase Edge Functions will be deployed with Supabase gateway JWT verification disabled and will verify the application JWT themselves with `APP_JWT_SECRET`, whose value must match the backend's production `JWT_SECRET`.

After verifying the token, each function performs explicit authorization against `users`, `classes`, `enrollments`, `assignment_deliveries`, and `assignment_recipients` before using the service-role database client. Direct client access to protected tables remains blocked by RLS and grants. This preserves the existing security boundary without migrating the whole LMS to Supabase Auth.

The application JWT is never sent to R2. R2 credentials are never returned to the frontend. The frontend receives only short-lived presigned URLs.

## Data model

### Assignments

Extend `assignments` with:

- `submission_type text not null default 'autograde'`, restricted to `autograde`, `practice_file`, or `essay`.
- `essay_content text` for Markdown essay prompts.
- `allowed_mime_types text[] not null` with the supported file MIME defaults.
- `max_file_size_mb integer not null default 25`, restricted to a safe positive range.
- `allow_late_submission boolean not null default false`.

The existing `type` column remains the subject/runtime (`python`, `sql`, or `html`) for compatibility. File assignments still retain a subject so existing class compatibility and library organization continue working. Test cases and code fields are unused for file assignments.

### Deliveries and deadlines

Keep deadline and targeting on `assignment_deliveries`. Do not add a second authoritative deadline to `assignments`. File assignment upload and confirmation APIs accept `deliveryId`, not only `assignmentId`, so authorization, recipient targeting, lateness, and submission limits are evaluated for the exact class delivery.

### Submissions

Extend the existing `submissions` table with nullable file-specific columns:

- `object_key text`
- `file_name text`
- `mime_type text`
- `file_size bigint`
- `is_late boolean not null default false`
- `is_latest boolean not null default true`
- `feedback text`
- `graded_at timestamptz`
- `graded_by uuid references users(id)`

Existing code-submission rows remain valid because file fields are nullable. File rows use the existing `user_id`, `assignment_id`, `delivery_id`, `score`, `max_score`, `status`, and `submitted_at` fields. A check constraint ensures a file-submission row has all required file metadata.

A trigger marks older file submissions as `is_latest = false` after a new file submission is inserted for the same `(delivery_id, user_id)`. A partial unique index enforces at most one latest file submission for that pair. Autograde rows are not included in this latest-file constraint.

Indexes support student history, latest-submission teacher lists, and grading queries. Migration files are duplicated in `supabase/migrations` and `backend/src/database/migrations`, and the canonical schema snapshot is updated.

## Edge Functions

Shared modules under `supabase/functions/_shared` provide:

- CORS and JSON responses.
- Application JWT verification with a strict Bearer-token parser.
- Student delivery authorization and teacher ownership authorization.
- R2 configuration validation, filename sanitization, object-key validation, and AWS signing.
- MIME and file-size validation.

All functions accept `POST` and handle `OPTIONS`. Error responses contain a stable error code and Vietnamese message. They do not expose database errors, object keys, credentials, or token contents.

### `get-upload-url`

Input: `deliveryId`, `fileName`, `mimeType`, `fileSize`.

The function verifies that the caller is a student enrolled in and targeted by the published delivery; the assignment is a file-submission type; the file MIME and size match assignment settings; the deadline policy permits submission; and the delivery's maximum-attempt policy has not been exhausted. It returns a five-minute presigned `PUT` URL and an opaque upload token containing the server-generated object key and validated file metadata.

Object keys use `{deliveryId}/{studentId}/{timestamp}_{random}_{safeFileName}`. The client cannot choose an arbitrary R2 key.

### `confirm-submission`

Input: the opaque upload token returned by `get-upload-url`.

The function repeats authentication and delivery authorization, verifies the signed upload token, issues a signed `HEAD` request to R2, checks that the object exists and matches the expected size and content type, reevaluates deadline and attempt limits, then inserts one metadata row. The response returns the new submission and current history but never returns `object_key`.

If confirmation is retried for the same upload token, the function returns the already-created row instead of creating a duplicate. A database uniqueness key derived from the object key provides idempotency.

### `get-download-url`

Input: `submissionId`.

The caller must be the student who owns the row or the teacher who owns the row's class delivery. The function returns a fifteen-minute presigned `GET` URL plus safe display metadata. Only file-submission rows are accepted.

### `grade-submission`

Input: `submissionId`, `score`, `feedback`.

Only the teacher who owns the delivery's class can grade. Score must be finite, non-negative, and no greater than the assignment maximum score. The function updates only `score`, `feedback`, `graded_at`, `graded_by`, and grading status fields. Historical versions remain viewable and gradeable, while the teacher list defaults to the latest version.

## Express API responsibilities

Express continues to provide metadata and list endpoints because it already owns LMS queries and custom JWT authentication:

- Student delivery lists/details include file-assignment settings and safe submission history without `object_key`.
- Teacher file-submission management returns all targeted students, latest submission metadata, aggregate counts, and filter fields.
- Export endpoints produce CSV and XLSX reports using the existing export conventions.

Express never proxies file bytes and never signs R2 requests.

## Frontend design

### Shared client layer

Add an Edge Function client that uses `VITE_SUPABASE_URL`, sends the existing application JWT in `Authorization`, reports upload progress for the direct R2 `PUT`, and maps stable error codes to Vietnamese messages. File validation is shared between the student form and assignment authoring form.

### Student experience

`MyAssignments` continues to be the canonical list. File assignments display `Thực hành` or `Tự luận` badges, deadline, and one of `Chưa nộp`, `Đã nộp`, `Nộp trễ`, or `Đã chấm: {score}`. Sorting places ungraded work nearest its deadline first and graded work last.

A new file-submission detail page displays:

- Title, class, deadline, and essay Markdown rendered through `marked` and sanitized through `DOMPurify`.
- Drag-and-drop and file selection with immediate MIME and size validation.
- Upload progress and explicit states for URL creation, R2 upload, confirmation, success, and retryable failure.
- Submission history ordered newest first, with a `Bản mới nhất` badge.
- Score and feedback for the latest graded submission.
- A disabled submission form after the deadline unless late submission is enabled.

Submitting again always creates a new history row. No UI offers overwrite or deletion in this module.

### Teacher authoring

`CreateAssignment` adds an assignment-mode selector: Autograde, Practical file, or Essay file. Autograde preserves the existing editor and test-case UI. File modes show allowed-format checkboxes, maximum size, maximum score, late-submission policy, and Markdown essay content when applicable. Library assignments are still delivered to one or more classes through the existing delivery workflow, preserving per-class deadlines and recipients.

### Teacher submission management

A management page for a library assignment aggregates its class deliveries and shows every targeted student. The table includes student, class, status, submission time, file, score, and actions. Filters cover all, missing, submitted, and late. Summary counts show submitted versus targeted totals.

Selecting a row opens a right-side panel without navigation. Images render directly, PDFs use the browser viewer, and Office files use Microsoft Office Online when compatible; every type has a safe download fallback. The panel obtains a fresh download URL on open or expiry. It contains score, feedback, Save, and `Lưu & bài tiếp theo` actions.

The page exports CSV and XLSX with student, class, status, submission time, late flag, filename, score, and feedback. It never exports URLs or object keys.

## Security and privacy

- The R2 bucket stays private; no public development URL or custom public domain is enabled.
- Upload URLs expire after five minutes; download URLs expire after fifteen minutes.
- Server-side MIME, size, delivery, role, deadline, and attempt checks are authoritative.
- Object keys are generated by trusted code and validated against delivery/user ownership.
- Filenames are stored for display only and are escaped in UI and exports.
- File bytes do not pass through Express, Supabase database, or logs.
- R2 secrets, `APP_JWT_SECRET`, service-role keys, upload tokens, presigned query strings, and object keys are never logged.
- Teacher authorization is derived from `classes.teacher_id`, not from a client-supplied class or teacher ID.
- Office preview may send a short-lived presigned URL to Microsoft. The UI labels this behavior and always offers direct download as a privacy-preserving fallback.

## Error handling and recovery

- Client validation prevents obviously unsupported files before network calls.
- Edge Functions return `401` for invalid/expired authentication, `403` for authorization/deadline policy failures, `404` for missing resources, `409` for attempt/idempotency conflicts, `413` for size violations, `415` for MIME violations, and `500` for redacted infrastructure failures.
- If R2 upload succeeds but confirmation fails, the client retries confirmation with the same token. Unconfirmed objects are harmless private orphans; automated cleanup is deliberately deferred from this module.
- If preview fails or expires, the panel requests a new download URL and provides a download fallback.
- Grading failures retain unsaved form contents and do not advance to the next student.

## Testing and acceptance

Automated tests cover:

- Migration compatibility with existing assignments and autograde submissions.
- Latest-version trigger, unique index, and idempotent confirmation.
- JWT parsing/verification and student/teacher authorization matrices.
- MIME, size, filename, deadline, lateness, recipient, and attempt-limit validation.
- R2 signing configuration and expiry values without real credentials.
- Student status/sorting, upload state transitions, history, teacher filters, next-student navigation, and export rows.
- Existing backend and frontend test suites to demonstrate no autograde regression.
- Frontend production build.

Deployment acceptance uses one practical assignment and one essay assignment, with three student accounts covering on-time, late, missing, resubmitted, and graded states. It verifies that direct R2 upload succeeds, history is retained, unauthorized students and teachers cannot access files, and exported reports match the visible table.

## Deployment sequence

1. Add `APP_JWT_SECRET` to Supabase Edge Function secrets with the exact production backend `JWT_SECRET` value.
2. Apply the database migration and verify schema constraints/indexes.
3. Deploy shared code and all four Edge Functions with gateway JWT verification disabled.
4. Deploy Express metadata/list/export changes.
5. Deploy frontend changes and verify the production origin remains present in R2 CORS.
6. Run acceptance scenarios and inspect Edge Function logs for redaction.

Database and Edge Function deployment are external production changes. They require explicit execution approval at deployment time. Local implementation and automated tests do not mutate production.

## Out of scope

- Replacing or modifying Pyodide, sql.js, or HTML autograding.
- Supabase Storage, Google Drive, or OneDrive storage.
- Typed essay answers.
- Automated reminders or notifications.
- Student deletion of submitted files.
- Automatic cleanup of abandoned R2 uploads.
- Malware scanning, OCR, plagiarism checking, or automatic grading of uploaded files.
