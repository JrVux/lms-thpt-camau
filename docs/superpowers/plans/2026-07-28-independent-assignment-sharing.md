# Independent Assignment Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép giáo viên sao chép bài tập thành các bản nháp độc lập sang những lớp cùng khối do chính mình quản lý.

**Architecture:** Tách luật chia sẻ và quy trình sao chép khỏi Supabase adapter để kiểm thử bằng `node:test` không cần kết nối mạng. Backend là nguồn kiểm soát quyền và tính toàn vẹn; frontend chỉ lọc sớm danh sách lớp cùng khối để trải nghiệm rõ ràng hơn.

**Tech Stack:** Node.js ES modules, `node:test`, Express, Supabase JS, React 18, Vite.

## Global Constraints

- Chỉ lớp đích cùng khối, cùng giáo viên và khác lớp nguồn được phép nhận bản sao.
- Mỗi bản sao có assignment ID và test-case ID riêng, luôn có `is_published = false`.
- Giữ dữ liệu ban đầu, gồm hạn nộp; giáo viên chỉnh sửa và publish riêng sau khi sao chép.
- Không sao chép submissions hoặc submission results.
- Không để lại assignment thiếu test case nếu sao chép test case thất bại.
- Không thêm dependency kiểm thử mới; dùng test runner tích hợp của Node.js.

---

### Task 1: Luật chia sẻ và quy trình sao chép độc lập ở backend

**Files:**
- Create: `backend/src/services/assignmentSharing.js`
- Create: `backend/test/assignmentSharing.test.js`
- Modify: `backend/package.json`

**Interfaces:**
- Produces: `normalizeIds(ids: string[]): string[]`
- Produces: `validateShareRequest({ sourceClass, targetClasses, targetClassIds, assignments, assignmentIds, teacherId }): void`
- Produces: `copyAssignmentsIndependently({ targetClassIds, assignments, repository }): Promise<{copied: number, failed: number, targetCount: number, failures: Array<{assignmentId: string, targetClassId: string, message: string}>}>`
- Repository contract:

```js
{
  createAssignment(copyData): Promise<{ id: string }>,
  createTestCases(rows): Promise<void>,
  updateAssignmentMaxScore(assignmentId, maxScore): Promise<void>,
  deleteAssignment(assignmentId): Promise<void>
}
```

- [ ] **Step 1: Add the backend test command**

In `backend/package.json`, add:

```json
"test": "node --test"
```

- [ ] **Step 2: Write failing unit tests for authorization and grade rules**

Create `backend/test/assignmentSharing.test.js` with table-driven tests that call `validateShareRequest` and assert:

```js
assert.throws(
  () => validateShareRequest({
    sourceClass: { id: 'source', teacher_id: 'teacher-1', grade: '10' },
    targetClasses: [{ id: 'target', teacher_id: 'teacher-1', grade: '11' }],
    targetClassIds: ['target'],
    assignments: [{ id: 'assignment-1', class_id: 'source' }],
    assignmentIds: ['assignment-1'],
    teacherId: 'teacher-1',
  }),
  /cùng khối/
);
```

Add equivalent cases for another teacher, source class as target, missing target, and an assignment not belonging to the source class. Add a passing case for a valid same-grade request.

- [ ] **Step 3: Run the tests and verify RED**

Run:

```powershell
cd backend
npm.cmd test -- test/assignmentSharing.test.js
```

Expected: FAIL because `assignmentSharing.js` does not exist.

- [ ] **Step 4: Implement normalization and validation**

Create `backend/src/services/assignmentSharing.js`. `normalizeIds` removes falsy and duplicate IDs while preserving order. `validateShareRequest` checks source ownership, exact target coverage, same ownership, same grade, source exclusion, exact assignment coverage, and source membership. Use stable Vietnamese messages:

```js
throw new Error('Chỉ có thể chia sẻ bài tập sang lớp cùng khối');
```

- [ ] **Step 5: Run authorization tests and verify GREEN**

Run:

```powershell
cd backend
npm.cmd test -- test/assignmentSharing.test.js
```

Expected: all validation tests PASS.

- [ ] **Step 6: Write failing tests for independent copy and cleanup**

Extend the test file with an in-memory repository. Verify:

- two target classes create two different assignments;
- copied rows have `is_published: false` and the target `class_id`;
- `id`, original `class_id`, `created_at`, `is_published`, and nested `test_cases` are not copied into assignment data;
- test-case rows receive the new assignment ID and omit original test-case IDs;
- a test-case insert failure calls `deleteAssignment(newId)`;
- the failed copy is not included in `copied` and appears in `failures`;
- empty test-case arrays still create a valid independent assignment.

- [ ] **Step 7: Run copy tests and verify RED**

Run:

```powershell
cd backend
npm.cmd test -- test/assignmentSharing.test.js
```

Expected: FAIL because `copyAssignmentsIndependently` is not exported.

- [ ] **Step 8: Implement the minimal copy orchestrator**

For each unique target ID and assignment:

```js
const { test_cases: testCases = [], id, class_id, created_at, is_published, ...copyData } = assignment;
const created = await repository.createAssignment({
  ...copyData,
  class_id: targetClassId,
  is_published: false,
});
```

Map test cases without `id`, insert them with `assignment_id: created.id`, update `max_score`, and delete the created assignment inside `catch` before recording the failure. Return exact copied/failed counts.

- [ ] **Step 9: Run backend unit tests and commit**

Run:

```powershell
cd backend
npm.cmd test
```

Expected: all tests PASS.

Commit:

```powershell
git add backend/package.json backend/src/services/assignmentSharing.js backend/test/assignmentSharing.test.js
git commit -m "test: define independent assignment sharing rules"
```

---

### Task 2: Integrate validated sharing with Supabase

**Files:**
- Modify: `backend/src/services/assignmentService.js`
- Create: `backend/test/assignmentShareService.test.js`

**Interfaces:**
- Consumes: `normalizeIds`, `validateShareRequest`, `copyAssignmentsIndependently`
- Produces: `createShareAssignmentsService(supabaseClient): (sourceClassId: string, targetClassIds: string[], assignmentIds: string[], teacherId: string) => Promise<{copied: number, failed: number, targetCount: number, failures: Array<{assignmentId: string, targetClassId: string, message: string}>}>`
- Preserves: `shareAssignments(sourceClassId, targetClassIds, assignmentIds, teacherId)`
- Produces response:

```js
{
  copied: 2,
  failed: 0,
  targetCount: 2,
  failures: []
}
```

- [ ] **Step 1: Write a failing service integration test**

Create a fluent Supabase fake in `backend/test/assignmentShareService.test.js`, pass it to `createShareAssignmentsService(fakeSupabase)`, and verify the returned function:

- queries source and target classes with `id, teacher_id, grade`;
- normalizes duplicate target and assignment IDs;
- loads only requested assignments from the source class;
- validates everything before the first insert;
- delegates inserts and cleanup through the repository adapter.

The test must assert that a target-class validation error produces zero inserts.

- [ ] **Step 2: Run the service test and verify RED**

Run:

```powershell
cd backend
npm.cmd test -- test/assignmentShareService.test.js
```

Expected: FAIL because the current service neither queries `grade` nor rejects cross-grade targets.

- [ ] **Step 3: Replace the existing copy loop with the tested module**

In `assignmentService.js`:

1. import the three sharing functions;
2. export a `createShareAssignmentsService(supabaseClient)` factory so tests can inject the fluent fake;
3. inside the returned function, normalize input IDs immediately;
4. load source `id, teacher_id, grade`;
5. load target `id, teacher_id, grade`;
6. load requested source assignments including `test_cases(*)`;
7. call `validateShareRequest`;
8. create a repository adapter around the injected client's insert/update/delete calls;
9. return:

```js
return copyAssignmentsIndependently({
  targetClassIds: normalizedTargetIds,
  assignments,
  repository,
});
```
10. preserve the public service export with:

```js
export const shareAssignments = createShareAssignmentsService(supabase);
```

All validation must finish before any insert. The cleanup adapter must call:

```js
await supabase.from('assignments').delete().eq('id', assignmentId);
```

- [ ] **Step 4: Run backend tests and verify GREEN**

Run:

```powershell
cd backend
npm.cmd test
```

Expected: all tests PASS.

- [ ] **Step 5: Commit backend integration**

```powershell
git add backend/src/services/assignmentService.js backend/test/assignmentShareService.test.js
git commit -m "feat: restrict assignment sharing to owned same-grade classes"
```

---

### Task 3: Filter same-grade destinations and report partial results in the UI

**Files:**
- Create: `frontend/src/utils/assignmentSharing.js`
- Create: `frontend/test/assignmentSharing.test.js`
- Modify: `frontend/src/pages/ClassDetail.jsx`
- Modify: `frontend/package.json`

**Interfaces:**
- Produces: `getEligibleTargetClasses(classes, sourceClassId): Class[]`
- `Class` fields used: `{ id: string, grade: string|number, name: string, subject?: string }`

- [ ] **Step 1: Add the frontend test command and failing filter tests**

In `frontend/package.json`, add:

```json
"test": "node --test"
```

Create `frontend/test/assignmentSharing.test.js`. Verify the helper:

- finds the source class by ID;
- excludes the source;
- includes only matching grades using string comparison;
- returns `[]` if the source is unavailable;
- does not mutate the input array.

- [ ] **Step 2: Run frontend tests and verify RED**

Run:

```powershell
cd frontend
npm.cmd test -- test/assignmentSharing.test.js
```

Expected: FAIL because the utility module does not exist.

- [ ] **Step 3: Implement the pure eligibility helper**

Create `frontend/src/utils/assignmentSharing.js`:

```js
export const getEligibleTargetClasses = (classes, sourceClassId) => {
  const source = classes.find((item) => item.id === sourceClassId);
  if (!source) return [];
  return classes.filter(
    (item) => item.id !== sourceClassId && String(item.grade) === String(source.grade)
  );
};
```

- [ ] **Step 4: Run frontend tests and verify GREEN**

Run:

```powershell
cd frontend
npm.cmd test
```

Expected: all tests PASS.

- [ ] **Step 5: Integrate filtering and result copy**

In `ClassDetail.jsx`:

- import `getEligibleTargetClasses`;
- replace `data.filter((c) => c.id !== classId)` with the helper;
- change the empty state to `Bạn chưa có lớp nào khác cùng khối`;
- explain in the modal that copies are independent drafts;
- display `copied`, `failed`, and each concise failure when `failed > 0`;
- keep the close action refreshing the source list without implying target drafts are published.

- [ ] **Step 6: Build and run all tests**

Run:

```powershell
cd frontend
npm.cmd test
npm.cmd run build
cd ..\backend
npm.cmd test
```

Expected: frontend tests PASS, Vite exits 0, backend tests PASS.

- [ ] **Step 7: Commit the frontend behavior**

```powershell
git add frontend/package.json frontend/src/utils/assignmentSharing.js frontend/test/assignmentSharing.test.js frontend/src/pages/ClassDetail.jsx
git commit -m "feat: show same-grade assignment share targets"
```

---

### Task 4: Final verification and production-readiness review

**Files:**
- Verify only; no required source changes.

- [ ] **Step 1: Inspect the complete diff**

Run:

```powershell
git diff HEAD~3 --check
git diff HEAD~3 --stat
git status --short
```

Expected: no whitespace errors; only planned source/test files plus pre-existing unrelated workspace changes.

- [ ] **Step 2: Run the complete verification suite fresh**

Run:

```powershell
cd backend
npm.cmd test
cd ..\frontend
npm.cmd test
npm.cmd run build
```

Expected: every test passes and build exits 0.

- [ ] **Step 3: Manually verify the sharing contract**

Using two owned classes in the same grade and one class in another grade:

1. open the source class assignment tab;
2. verify only the same-grade class appears in the share modal;
3. share one assignment;
4. open the target class and verify the copy is a draft;
5. edit its due date and verify the source assignment remains unchanged;
6. confirm different-grade targets are rejected when the API is called directly.

- [ ] **Step 4: Report deployment readiness**

Record the test counts, build status, new commit SHAs, and any manual-verification limitation. Do not deploy production until the user separately authorizes the live deployment.
