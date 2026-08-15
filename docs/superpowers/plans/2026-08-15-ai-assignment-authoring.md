# AI Assignment Authoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép giáo viên nhập yêu cầu hoặc bài mẫu để AI tạo bản nháp bài CodeHS hoàn chỉnh cho Python lớp 10, SQL lớp 11 và HTML/CSS lớp 12, dùng OpenRouter mặc định và Gemini dự phòng.

**Architecture:** Backend sở hữu toàn bộ khóa và gọi mô hình qua một AI Gateway có hai adapter dùng `fetch`. Prompt BTcodehs và JSON Schema dùng chung cho hai nhà cung cấp; lớp validation thuần kiểm tra cú pháp và quy tắc từng môn trước khi controller trả bản nháp cho frontend. Frontend chỉ điền dữ liệu hợp lệ vào form, không tự lưu; sau khi giáo viên lưu bài, một endpoint riêng ghi các năng lực AI đề xuất ở trạng thái `proposed`.

**Tech Stack:** Node.js 20+, Express 4, native `fetch`, Supabase PostgreSQL, React 18, Vite 6, Node test runner.

## Global Constraints

- OpenRouter là nhà cung cấp mặc định; Gemini chỉ dự phòng sau lỗi kỹ thuật, timeout hoặc output không hợp lệ.
- Tối đa hai lượt OpenRouter (sinh + sửa) và một lượt Gemini cho mỗi yêu cầu.
- Model lấy từ `OPENROUTER_MODEL` và `GEMINI_MODEL`; không ghi cứng model vào mã nguồn.
- Khóa `OPENROUTER_API_KEY` và `GEMINI_API_KEY` chỉ tồn tại ở backend.
- Hỗ trợ đúng ba ánh xạ: `python/10`, `sql/11`, `html/12`.
- AI không tự lưu, xuất bản, chia sẻ hoặc giao bài.
- Mọi năng lực AI đề xuất được lưu với `status = 'proposed'` và `proposed_by = 'ai'`.
- Không gửi dữ liệu học sinh, họ tên, email hoặc tên lớp tới nhà cung cấp AI.
- HTML/CSS phải đưa rubric thủ công 30% vào cuối Description.
- Không thêm SDK AI; dùng native `fetch` để giảm phụ thuộc và thống nhất timeout.

---

## File Structure

- `backend/src/ai/assignmentDraftSchema.js`: JSON Schema chung và các enum công khai.
- `backend/src/ai/btcodehsPrompt.js`: prompt hệ thống, reference ba môn và prompt sửa JSON.
- `backend/src/ai/assignmentDraftValidator.js`: chuẩn hóa và kiểm tra quy tắc nghiệp vụ thuần.
- `backend/src/ai/providers/openRouterProvider.js`: adapter OpenRouter structured output.
- `backend/src/ai/providers/geminiProvider.js`: adapter Gemini structured output.
- `backend/src/services/aiGateway.js`: retry, fallback, timeout và metadata sử dụng.
- `backend/src/services/aiAssignmentService.js`: điều phối prompt, validation, ghi audit log và gợi ý năng lực.
- `backend/src/controllers/aiAssignmentController.js`: HTTP adapter có dependency injection để test.
- `backend/src/database/migrations/010_ai_generation_logs.sql`: nhật ký tối thiểu, service-role-only.
- `frontend/src/utils/aiAssignmentDraft.js`: chuyển draft API thành state của form mà không làm mất dữ liệu cũ khi lỗi.
- `frontend/src/components/AIAssignmentComposer.jsx`: bảng nhập và trạng thái tạo bài.
- `frontend/src/pages/CreateAssignment.jsx`: tích hợp nút AI, điền form và lưu mapping sau khi tạo bài.

---

### Task 1: Contract và validation bài tập ba môn

**Files:**
- Create: `backend/src/ai/assignmentDraftSchema.js`
- Create: `backend/src/ai/assignmentDraftValidator.js`
- Create: `backend/test/assignmentDraftValidator.test.js`

**Interfaces:**
- Produces: `ASSIGNMENT_DRAFT_SCHEMA`, `SUBJECT_GRADE`, `validateAndNormalizeDraft(raw, expectedSubject?)`.
- Return: `{ draft, warnings }`; lỗi nghiệp vụ dùng `AssignmentDraftValidationError` với `issues: string[]`.
- Test fixtures: định nghĩa tại đầu file `validPythonDraft()`, `validSqlDraft()` và `validHtmlDraft()`; mỗi fixture trả object hoàn chỉnh có đủ ba `test_kind` và tổng điểm 10.

- [ ] **Step 1: Viết test đỏ cho contract chung và nhận diện môn**

```js
test('normalizes a valid Python draft and derives grade 10', () => {
  const { draft } = validateAndNormalizeDraft(validPythonDraft());
  assert.equal(draft.type, 'python');
  assert.equal(draft.grade, '10');
  assert.equal(draft.test_cases.length, 3);
});

test('rejects an ambiguous subject when no subject is confirmed', () => {
  assert.throws(() => validateAndNormalizeDraft({ ...validPythonDraft(), type: 'unknown' }),
    /Không xác định được môn/);
});
```

- [ ] **Step 2: Chạy test và xác nhận RED**

Run: `cd backend; npm test -- test/assignmentDraftValidator.test.js`

Expected: FAIL vì module `assignmentDraftValidator.js` chưa tồn tại.

- [ ] **Step 3: Viết schema tối thiểu và ánh xạ môn/khối**

```js
export const SUBJECT_GRADE = Object.freeze({ python: '10', sql: '11', html: '12' });
export const TEST_KINDS = Object.freeze(['normal', 'boundary', 'anti_hardcode']);
export const ASSIGNMENT_DRAFT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['title', 'type', 'grade', 'difficulty', 'description', 'starter_code',
    'solution_code', 'setup_sql', 'test_code', 'max_score', 'test_cases', 'competencies'],
  properties: {
    title: { type: 'string' },
    type: { type: 'string', enum: ['python', 'sql', 'html'] },
    grade: { type: 'string', enum: ['10', '11', '12'] },
    difficulty: { type: 'integer', minimum: 1, maximum: 5 },
    description: { type: 'string' }, starter_code: { type: 'string' },
    solution_code: { type: 'string' }, setup_sql: { type: 'string' },
    test_code: { type: 'string' }, max_score: { type: 'integer', minimum: 1 },
    test_cases: { type: 'array', minItems: 3, items: { type: 'object' } },
    competencies: { type: 'array', items: { type: 'object' } },
  },
};
```

- [ ] **Step 4: Bổ sung test đỏ cho quy tắc đặc thù**

```js
test('rejects missing normal, boundary, or anti-hardcode coverage', () => {
  const raw = validPythonDraft();
  raw.test_cases = raw.test_cases.filter((item) => item.test_kind !== 'boundary');
  assert.throws(() => validateAndNormalizeDraft(raw), /test biên/);
});
test('rejects test points that do not equal max_score', () => {
  assert.throws(() => validateAndNormalizeDraft({ ...validPythonDraft(), max_score: 99 }), /Tổng điểm/);
});
test('rejects accented or duplicate test names', () => {
  const raw = validPythonDraft(); raw.test_cases[1].test_name = raw.test_cases[0].test_name;
  assert.throws(() => validateAndNormalizeDraft(raw), /test_name/);
});
test('requires setup_sql and two-dimensional expected rows for SQL', () => {
  const raw = validSqlDraft(); raw.setup_sql = ''; raw.test_cases[0].expected_output = '["A"]';
  assert.throws(() => validateAndNormalizeDraft(raw), /setup_sql|hai chiều/);
});
test('requires selectors and appends the 30 percent manual rubric for HTML', () => {
  const { draft } = validateAndNormalizeDraft(validHtmlDraft());
  assert.match(draft.description, /Tiêu chí giáo viên chấm thủ công — 30%/);
  assert.equal(draft.test_cases.every((item) => item.selector.length > 0), true);
});
test('rejects Python input exercises with fewer than two distinct inputs', () => {
  const raw = validPythonDraft(); raw.test_cases.forEach((item) => { item.input_data = '5'; });
  assert.throws(() => validateAndNormalizeDraft(raw), /hai bộ input/);
});
test('rejects a draft whose confirmed subject differs from generated type', () => {
  assert.throws(() => validateAndNormalizeDraft(validPythonDraft(), 'sql'), /không khớp/);
});
```

- [ ] **Step 5: Cài validation tối thiểu để toàn bộ test xanh**

Validation phải kiểm tra kiểu dữ liệu thủ công, trim chuỗi, tổng điểm, `test_kind`, tên ASCII, input khác nhau, JSON array-of-arrays của SQL, selector HTML không rỗng và ánh xạ môn/khối. Không thực thi code AI trong tiến trình backend ở task này.

- [ ] **Step 6: Chạy test và commit**

Run: `cd backend; npm test -- test/assignmentDraftValidator.test.js`

Expected: PASS.

```bash
git add backend/src/ai backend/test/assignmentDraftValidator.test.js
git commit -m "feat: validate AI assignment drafts"
```

---

### Task 2: Prompt BTcodehs có phiên bản cho ba môn

**Files:**
- Create: `backend/src/ai/btcodehsPrompt.js`
- Create: `backend/test/btcodehsPrompt.test.js`

**Interfaces:**
- Consumes: `ASSIGNMENT_DRAFT_SCHEMA`.
- Produces: `PROMPT_VERSION`, `buildAssignmentPrompt(input)`, `buildRepairPrompt({ input, invalidOutput, issues })`.

- [ ] **Step 1: Viết test đỏ cho dữ liệu tối thiểu và không có PII**

```js
test('builds a versioned prompt with only teacher-authored input', () => {
  const prompt = buildAssignmentPrompt({ request: 'Tạo bài vòng lặp', subject: 'python', difficulty: 2 });
  assert.match(prompt.system, /BTcodehs/);
  assert.match(prompt.user, /Tạo bài vòng lặp/);
  assert.doesNotMatch(prompt.user, /teacherId|email|className/);
});
```

- [ ] **Step 2: Chạy test và xác nhận RED**

Run: `cd backend; npm test -- test/btcodehsPrompt.test.js`

Expected: FAIL vì module chưa tồn tại.

- [ ] **Step 3: Cài prompt chung và reference riêng**

Prompt phải chứa quy tắc Description, Starter Code, Solution Code, ba loại test, schema năng lực và đúng reference Python/SQL/HTML từ đặc tả. `buildRepairPrompt` chỉ nhận output lỗi đã giới hạn độ dài và danh sách lỗi validator; không thêm dữ liệu người dùng khác.

- [ ] **Step 4: Bổ sung test cho SQL, HTML và giới hạn đầu vào**

```js
test('includes SQL setup and array-of-arrays requirements', () => {
  const prompt = buildAssignmentPrompt({ request: 'Lọc dữ liệu', subject: 'sql' });
  assert.match(prompt.system, /setup_sql/); assert.match(prompt.system, /mảng hai chiều/);
});
test('includes HTML selector and manual rubric requirements', () => {
  const prompt = buildAssignmentPrompt({ request: 'Trang giới thiệu', subject: 'html' });
  assert.match(prompt.system, /selector/); assert.match(prompt.system, /30%/);
});
test('rejects blank or over-limit teacher input', () => {
  assert.throws(() => buildAssignmentPrompt({ request: '   ' }), /không được để trống/);
  assert.throws(() => buildAssignmentPrompt({ request: 'x'.repeat(12001) }), /12000/);
});
```

- [ ] **Step 5: Chạy test và commit**

Run: `cd backend; npm test -- test/btcodehsPrompt.test.js`

Expected: PASS.

```bash
git add backend/src/ai/btcodehsPrompt.js backend/test/btcodehsPrompt.test.js
git commit -m "feat: add versioned BTcodehs prompts"
```

---

### Task 3: Provider adapters và AI Gateway fallback

**Files:**
- Create: `backend/src/ai/providers/openRouterProvider.js`
- Create: `backend/src/ai/providers/geminiProvider.js`
- Create: `backend/src/services/aiGateway.js`
- Create: `backend/test/aiGateway.test.js`
- Modify: `backend/.env.example`

**Interfaces:**
- Provider: `generateStructured({ system, user, schema, signal }) -> { value, usage, model }`.
- Gateway: `createAIGateway({ openRouter, gemini }).generateAssignment(request)`.
- Errors: `AIConfigurationError`, `AIProviderError`, `AIOutputError`; chỉ hai loại sau được fallback.
- Test fixtures: `validRequest()` trả `{ request: 'Tạo bài tính tổng', subject: 'python', difficulty: 2 }`; `gatewayWithFakes(calls, outcomes)` lấy tuần tự outcome và ghi đúng nhãn lượt gọi; `providerThatWaitsForAbort()` chỉ reject khi signal phát sự kiện `abort`.

- [ ] **Step 1: Viết test đỏ cho OpenRouter-first và Gemini fallback**

```js
test('returns the first valid OpenRouter result without calling Gemini', async () => {
  const calls = []; const gateway = gatewayWithFakes(calls, [validPythonDraft()]);
  const result = await gateway.generateAssignment(validRequest());
  assert.equal(result.provider, 'openrouter'); assert.deepEqual(calls, ['openrouter']);
});
test('repairs invalid OpenRouter output once before fallback', async () => {
  const calls = []; const gateway = gatewayWithFakes(calls, [{ title: '' }, validPythonDraft()]);
  await gateway.generateAssignment(validRequest());
  assert.deepEqual(calls, ['openrouter', 'openrouter:repair']);
});
test('falls back to Gemini after retryable OpenRouter failures', async () => {
  const calls = []; const gateway = gatewayWithFakes(calls, [new AIProviderError('429'), { title: '' }, validPythonDraft()]);
  const result = await gateway.generateAssignment(validRequest());
  assert.equal(result.provider, 'gemini'); assert.equal(result.fallback_used, true);
});
test('does not fallback for invalid teacher input or missing configuration', async () => {
  const calls = []; const gateway = gatewayWithFakes(calls, []);
  await assert.rejects(gateway.generateAssignment({ request: '' }), /để trống/);
  assert.deepEqual(calls, []);
});
test('aborts providers at the configured timeout', async () => {
  const provider = providerThatWaitsForAbort();
  const gateway = createAIGateway({ openRouter: provider, gemini: provider, timeoutMs: 5 });
  await assert.rejects(gateway.generateAssignment(validRequest()), /quá thời gian/);
  assert.equal(provider.receivedAbortedSignal, true);
});
```

- [ ] **Step 2: Chạy test và xác nhận RED**

Run: `cd backend; npm test -- test/aiGateway.test.js`

Expected: FAIL vì gateway chưa tồn tại.

- [ ] **Step 3: Cài OpenRouter adapter bằng Chat Completions structured output**

Gửi `POST https://openrouter.ai/api/v1/chat/completions`, header Bearer, `response_format.type = 'json_schema'`, `strict = true`, và `provider.require_parameters = true`. Parse `choices[0].message.content` và usage. Không log Authorization hoặc toàn bộ response.

- [ ] **Step 4: Cài Gemini adapter bằng REST structured output**

Gửi `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`, header `x-goog-api-key`, JSON response schema trong `generationConfig`, parse `candidates[0].content.parts[].text` và `usageMetadata`. Model lấy từ biến môi trường.

- [ ] **Step 5: Cài gateway với thứ tự gọi hữu hạn**

```js
const attempts = [
  () => openRouter.generateStructured(primaryRequest),
  () => openRouter.generateStructured(repairRequest),
  () => gemini.generateStructured(primaryRequest),
];
```

Mỗi kết quả phải qua `validateAndNormalizeDraft`; chỉ gọi bước kế tiếp cho timeout, HTTP 429/5xx, JSON parse hoặc validation output. Lỗi 400 từ input dừng ngay.

- [ ] **Step 6: Thêm cấu hình mẫu và chạy test**

```dotenv
OPENROUTER_API_KEY=
OPENROUTER_MODEL=
GEMINI_API_KEY=
GEMINI_MODEL=
AI_REQUEST_TIMEOUT_MS=45000
AI_ASSIGNMENT_MAX_INPUT_CHARS=12000
```

Run: `cd backend; npm test -- test/aiGateway.test.js`

Expected: PASS, không gọi mạng thật.

- [ ] **Step 7: Commit**

```bash
git add backend/src/ai/providers backend/src/services/aiGateway.js backend/test/aiGateway.test.js backend/.env.example
git commit -m "feat: add OpenRouter and Gemini AI gateway"
```

---

### Task 4: Audit log service-role-only và dịch vụ tạo bản nháp

**Files:**
- Create: `backend/src/database/migrations/010_ai_generation_logs.sql`
- Modify: `backend/src/database/schema.sql`
- Create: `backend/src/services/aiAssignmentService.js`
- Create: `backend/test/aiAssignmentMigration.test.js`
- Create: `backend/test/aiAssignmentService.test.js`

**Interfaces:**
- Produces: `createAIAssignmentService({ db, gateway }).generateDraft({ teacherId, input })`.
- Produces: `saveProposedCompetencies({ teacherId, assignmentId, suggestions })`.
- Test fixtures: `serviceFixture(options)` cung cấp Supabase query builder giả theo mẫu test service hiện có và thu `queries/inserts`; `pendingServiceFixture()` trả gateway Promise được điều khiển bằng `release()`; `competencyRows()` chứa một kỹ năng chuẩn `PY10.LOOP` đang hoạt động.

- [ ] **Step 1: Viết migration test đỏ**

```js
test('AI log migration creates a service-role-only RLS table', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS ai_generation_logs/i);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/i);
  assert.match(sql, /REVOKE ALL ON ai_generation_logs FROM anon, authenticated/i);
});
```

- [ ] **Step 2: Chạy test và xác nhận RED**

Run: `cd backend; npm test -- test/aiAssignmentMigration.test.js`

Expected: FAIL vì migration chưa tồn tại.

- [ ] **Step 3: Tạo migration và đồng bộ schema**

`ai_generation_logs` gồm: `id`, `teacher_id`, `purpose`, `prompt_version`, `provider`, `model`, `status`, `input_tokens`, `output_tokens`, `estimated_cost`, `latency_ms`, `request_hash`, `error_code`, `created_at`. Không lưu prompt đầy đủ hoặc output chứa solution code. Bật RLS, revoke `anon/authenticated`, grant CRUD cho `service_role`, thêm index `(teacher_id, created_at desc)`.

- [ ] **Step 4: Viết service test đỏ**

```js
test('logs successful generation metadata without prompt or generated code', async () => {
  const { service, inserts } = serviceFixture({ gatewayResult: generatedResult() });
  await service.generateDraft({ teacherId: 'teacher-1', input: validRequest() });
  assert.equal(inserts.ai_generation_logs[0].provider, 'openrouter');
  assert.equal('prompt' in inserts.ai_generation_logs[0], false);
  assert.equal('solution_code' in inserts.ai_generation_logs[0], false);
});
test('logs a stable error code when both providers fail', async () => {
  const { service, inserts } = serviceFixture({ gatewayError: new AIProviderError('down') });
  await assert.rejects(service.generateDraft({ teacherId: 'teacher-1', input: validRequest() }));
  assert.equal(inserts.ai_generation_logs[0].error_code, 'AI_PROVIDERS_UNAVAILABLE');
});
test('rejects a second in-flight request for the same teacher', async () => {
  const { service, release } = pendingServiceFixture();
  const first = service.generateDraft({ teacherId: 'teacher-1', input: validRequest() });
  await assert.rejects(service.generateDraft({ teacherId: 'teacher-1', input: validRequest() }), /đang được xử lý/);
  release(); await first;
});
test('resolves only active competencies matching generated subject and grade', async () => {
  const { service, queries } = serviceFixture({ competencies: competencyRows() });
  await service.saveProposedCompetencies({ teacherId: 'teacher-1', assignmentId: 'assignment-1', suggestions: [{ code: 'PY10.LOOP', difficulty: 2, weight: 1 }] });
  assert.deepEqual(queries.competencies, { codes: ['PY10.LOOP'], subject: 'python', grade: '10', active: true });
});
test('stores AI suggestions as proposed and never approved', async () => {
  const { service, inserts } = serviceFixture({ competencies: competencyRows() });
  await service.saveProposedCompetencies({ teacherId: 'teacher-1', assignmentId: 'assignment-1', suggestions: [{ code: 'PY10.LOOP', difficulty: 2, weight: 1 }] });
  assert.equal(inserts.assignment_competency_mappings[0].status, 'proposed');
  assert.equal(inserts.assignment_competency_mappings[0].proposed_by, 'ai');
  assert.equal(inserts.assignment_competency_mappings[0].reviewed_by, null);
});
```

- [ ] **Step 5: Cài service tối thiểu**

Dùng `Map<teacherId, Promise>` trong tiến trình để chặn request đồng thời, `crypto.createHash('sha256')` cho request hash, và `finally` để giải phóng khóa. Khi ghi mapping, xác minh bài thuộc giáo viên, tra competency theo code + subject + grade + visibility, rồi insert `proposed_by: 'ai'`, `status: 'proposed'`, `reviewed_by: null`.

- [ ] **Step 6: Chạy test và commit**

Run: `cd backend; npm test -- test/aiAssignmentMigration.test.js test/aiAssignmentService.test.js`

Expected: PASS.

```bash
git add backend/src/database backend/src/services/aiAssignmentService.js backend/test/aiAssignmentMigration.test.js backend/test/aiAssignmentService.test.js
git commit -m "feat: audit AI drafts and propose competencies"
```

---

### Task 5: API giáo viên tạo draft và lưu năng lực đề xuất

**Files:**
- Create: `backend/src/controllers/aiAssignmentController.js`
- Create: `backend/test/aiAssignmentController.test.js`
- Modify: `backend/src/routes/index.js`
- Modify: `backend/src/app.js` nếu ứng dụng chưa có error middleware chuẩn cho controller `next(error)`.

**Interfaces:**
- `POST /api/ai/assignment-drafts` body `{ request, subject?, difficulty?, additional_requirements? }`.
- Response `200`: `{ draft, warnings, generation: { provider, model, fallback_used } }`.
- `POST /api/assignments/:assignmentId/ai-competencies` body `{ suggestions }`.
- Test fixtures: `controllerFixture(options)` tạo `req`, response recorder và service spy; `errorWithCode(code)` tạo Error có thuộc tính `code` để kiểm tra ánh xạ HTTP.

- [ ] **Step 1: Viết controller test đỏ**

```js
test('passes only authenticated teacher id and allowlisted input to the service', async () => {
  const { controller, serviceCalls, req, res } = controllerFixture({ body: { request: 'Bài vòng lặp', subject: 'python', provider: 'gemini' } });
  await controller.generateDraft(req, res, assert.fail);
  assert.deepEqual(serviceCalls[0], { teacherId: req.user.id, input: { request: 'Bài vòng lặp', subject: 'python' } });
});
test('returns 409 for a concurrent teacher generation', async () => {
  const { controller, req, res } = controllerFixture({ serviceError: errorWithCode('AI_REQUEST_IN_PROGRESS') });
  await controller.generateDraft(req, res, assert.fail); assert.equal(res.statusCode, 409);
});
test('returns 422 with issues when generated content is invalid', async () => {
  const error = new AssignmentDraftValidationError(['Thiếu test biên']);
  const { controller, req, res } = controllerFixture({ serviceError: error });
  await controller.generateDraft(req, res, assert.fail); assert.equal(res.statusCode, 422);
  assert.deepEqual(res.body.issues, ['Thiếu test biên']);
});
test('passes assignment id and suggestions to AI competency persistence', async () => {
  const suggestions = [{ code: 'PY10.LOOP', difficulty: 2, weight: 1 }];
  const { controller, serviceCalls, req, res } = controllerFixture({ params: { assignmentId: 'assignment-1' }, body: { suggestions } });
  await controller.saveProposedCompetencies(req, res, assert.fail);
  assert.deepEqual(serviceCalls[0], { teacherId: req.user.id, assignmentId: 'assignment-1', suggestions });
});
```

- [ ] **Step 2: Chạy test và xác nhận RED**

Run: `cd backend; npm test -- test/aiAssignmentController.test.js`

Expected: FAIL vì controller chưa tồn tại.

- [ ] **Step 3: Cài controller và route validation**

Route phải dùng `authenticate`, `requireRole('teacher')`, giới hạn `request` 1–12000 ký tự, `subject` chỉ nhận `python|sql|html`, `difficulty` 1–5. Không nhận provider, model, teacher ID hoặc prompt hệ thống từ client.

- [ ] **Step 4: Chạy controller test và toàn bộ backend**

Run: `cd backend; npm test`

Expected: toàn bộ test PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/aiAssignmentController.js backend/src/routes/index.js backend/src/app.js backend/test/aiAssignmentController.test.js
git commit -m "feat: expose teacher AI assignment endpoints"
```

---

### Task 6: Frontend mapping thuần và bảng Soạn bằng AI

**Files:**
- Create: `frontend/src/utils/aiAssignmentDraft.js`
- Create: `frontend/test/aiAssignmentDraft.test.js`
- Create: `frontend/src/components/AIAssignmentComposer.jsx`
- Modify: `frontend/src/pages/CreateAssignment.jsx`

**Interfaces:**
- Produces: `applyAIDraft({ form, draft })`, `draftToTestCases(draft)`, `subjectToCategory(type)`.
- Component props: `onApply(draft)`, `onClose()`, `initialSubject`.
- Test fixtures: `emptyForm()` phản ánh đầy đủ state form trong `CreateAssignment.jsx`; `validPythonDraft()` chứa mọi trường contract và một competency suggestion.

- [ ] **Step 1: Viết utility test đỏ**

```js
test('maps every AI draft field into the existing assignment form', () => {
  const next = applyAIDraft({ form: emptyForm(), draft: validPythonDraft() });
  assert.equal(next.form.title, 'Tính tổng'); assert.equal(next.form.max_score, 10);
  assert.equal(next.testCases.length, 3);
});
test('maps Python, SQL, and HTML to grade_10, grade_11, and grade_12', () => {
  assert.equal(subjectToCategory('python'), 'grade_10');
  assert.equal(subjectToCategory('sql'), 'grade_11');
  assert.equal(subjectToCategory('html'), 'grade_12');
});
test('preserves the current form when no valid draft is supplied', () => {
  const current = { ...emptyForm(), title: 'Đang soạn' };
  assert.deepEqual(applyAIDraft({ form: current, draft: null }).form, current);
});
test('keeps AI competency suggestions outside the assignment payload', () => {
  const next = applyAIDraft({ form: emptyForm(), draft: validPythonDraft() });
  assert.equal('competencies' in next.form, false);
  assert.deepEqual(next.suggestions, validPythonDraft().competencies);
});
```

- [ ] **Step 2: Chạy test và xác nhận RED**

Run: `cd frontend; npm test -- test/aiAssignmentDraft.test.js`

Expected: FAIL vì utility chưa tồn tại.

- [ ] **Step 3: Cài utility thuần và chạy test xanh**

`applyAIDraft` ánh xạ `title`, `description`, `starter_code`, `solution_code`, `setup_sql`, `test_code`, `max_score`; test case ánh xạ `test_name`, `input_data`, `expected_output`, `points`, đồng thời giữ `test_kind` và `competency_codes` trong state AI riêng.

- [ ] **Step 4: Tích hợp component**

`AIAssignmentComposer` có textarea yêu cầu/bài mẫu, select môn gồm “Tự nhận diện”, select độ khó, vùng yêu cầu bổ sung, trạng thái chờ và lỗi. Khi API trả draft, component hiển thị môn/khối nhận diện để giáo viên xác nhận trước khi gọi `onApply`; nút đóng hoặc lỗi không thay form.

- [ ] **Step 5: Tích hợp CreateAssignment**

Thêm nút **Soạn bằng AI**, state `aiSuggestions`, gọi `applyAIDraft`, cập nhật `type/category/testCases`. Sau khi tạo assignment và test cases thành công, gọi endpoint AI competency nếu có suggestions; nếu mapping lỗi, bài vẫn được tạo và hiển thị cảnh báo để giáo viên vào chỉnh năng lực, không xóa bài.

- [ ] **Step 6: Chạy test và build**

Run: `cd frontend; npm test`

Expected: toàn bộ test PASS.

Run: `cd frontend; npm run build`

Expected: Vite build thành công, không lỗi import.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/utils/aiAssignmentDraft.js frontend/test/aiAssignmentDraft.test.js frontend/src/components/AIAssignmentComposer.jsx frontend/src/pages/CreateAssignment.jsx
git commit -m "feat: add AI assignment composer"
```

---

### Task 7: Áp dụng migration, kiểm thử tích hợp và tài liệu vận hành

**Files:**
- Modify: `README.md`
- Modify: `backend/.env.example` nếu kiểm thử phát hiện cấu hình còn thiếu.

**Interfaces:**
- Không tạo interface mới; xác nhận toàn bộ luồng đã định nghĩa ở Task 1–6.

- [ ] **Step 1: Chạy toàn bộ kiểm thử trước triển khai**

Run: `cd backend; npm test`

Expected: PASS.

Run: `cd frontend; npm test; npm run build`

Expected: PASS và build thành công.

- [ ] **Step 2: Áp dụng `010_ai_generation_logs.sql` bằng Supabase migration tool**

Chỉ áp dụng sau khi xác nhận đúng project ref. Sau migration, query `pg_class.relrowsecurity`, `has_table_privilege` và cột bảng để xác nhận RLS bật, `anon/authenticated` không có quyền, `service_role` có CRUD.

- [ ] **Step 3: Chạy Supabase Security và Performance Advisors**

Expected: không có cảnh báo ERROR/WARN mới do `ai_generation_logs`; cảnh báo INFO về RLS không policy là chủ ý vì bảng service-role-only.

- [ ] **Step 4: Smoke test có kiểm soát cho từng môn**

Tạo ba yêu cầu không chứa dữ liệu học sinh: Python vòng lặp lớp 10, SQL `WHERE/ORDER BY` lớp 11, HTML/CSS trang giới thiệu lớp 12. Xác nhận draft không tự lưu, đủ ba loại test, tổng điểm đúng, SQL có setup và HTML có rubric 30%.

- [ ] **Step 5: Smoke test fallback**

Trong môi trường kiểm thử, cấu hình tạm model OpenRouter không hợp lệ hoặc dùng provider fake để xác nhận Gemini được gọi đúng một lần và UI báo `fallback_used`; khôi phục cấu hình ngay sau test. Không in khóa API ra log.

- [ ] **Step 6: Cập nhật README**

Tài liệu hóa sáu biến môi trường, thứ tự fallback, giới hạn input, cách xác nhận draft, cách duyệt năng lực và cách đọc audit log không chứa nội dung bài giải.

- [ ] **Step 7: Kiểm tra thay đổi và commit**

Run: `git diff --check; git status --short`

Expected: không có lỗi whitespace; chỉ các tệp thuộc tính năng này thay đổi.

```bash
git add README.md backend/.env.example
git commit -m "docs: document AI assignment operations"
```

---

## Final Verification Checklist

- [ ] Mỗi hàm mới đã có test thất bại đúng lý do trước khi viết implementation.
- [ ] Backend tests PASS.
- [ ] Frontend tests PASS.
- [ ] Frontend production build PASS.
- [ ] OpenRouter thành công không gọi Gemini.
- [ ] OpenRouter lỗi có thể retry mới chuyển Gemini và không vượt ba lượt tổng cộng.
- [ ] Input sai không tiêu tốn lượt fallback.
- [ ] Cả ba môn sinh đúng quy tắc BTcodehs.
- [ ] Form không thay đổi khi AI thất bại và draft không tự lưu.
- [ ] Năng lực AI chỉ ở trạng thái chờ duyệt.
- [ ] Không có khóa hoặc PII trong frontend, payload log hay output test.
- [ ] Supabase migration và advisors đã được xác minh.
