# Competency Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the versioned competency framework, teacher-approved assignment/test mappings, deterministic mastery calculation, and teacher-facing competency dashboard that later AI analysis and personalized plans can safely consume.

**Architecture:** Add service-role-only Supabase tables for competencies, mappings, evidence, and snapshots. Keep scoring in a pure deterministic module, expose teacher-owned endpoints through focused controller/service files, and add a new class tab whose UI consumes only approved mappings and explainable mastery results. This phase makes no external AI calls.

**Tech Stack:** PostgreSQL/Supabase, Node.js 18+, Express 4, `@supabase/supabase-js` 2.49.1, React 18, Vite 6, Tailwind CSS, Node test runner.

## Global Constraints

- The pilot scope is Python grade 10.
- AI does not assign mastery scores; all mastery and confidence values are deterministic.
- Every mastery contribution must be traceable to a submission and test result.
- Unapproved assignment/test skill mappings must never affect mastery.
- Low-confidence skills display `Chưa đủ dữ liệu`, never a weak label.
- Existing submission, grading, regrading, gradebook, assignment delivery, and assignment-library flows must remain compatible.
- All new public-schema tables enable RLS, revoke `anon`/`authenticated`, and grant only the required service-role access.
- Frontend code never receives the Supabase service-role key.
- Existing untracked files are user-owned and must not be staged.
- Schema, rubric, threshold, and snapshot records are versioned; historical snapshots retain the version used to compute them.

---

## Scope and Follow-on Plans

This plan implements the prerequisite foundation only. Separate plans will implement:

1. AI assignment authoring from BTcodehs templates.
2. Anonymized AI comments with teacher review.
3. Personalized learning plans and assignment recommendations.

The foundation is independently useful and deployable: teachers can map skills, calculate mastery, inspect evidence, and view class/student competency summaries without an AI provider.

## File Structure

### Create

- `backend/src/database/migrations/009_competency_foundation.sql` — tables, constraints, indexes, RLS and service-role grants.
- `backend/test/competencyMigration.test.js` — static migration security/schema contract.
- `backend/src/services/masteryEngine.js` — pure weighting, mastery, confidence, label, and trend functions.
- `backend/test/masteryEngine.test.js` — deterministic calculation tests.
- `backend/src/services/competencyRules.js` — request normalization and mapping validation.
- `backend/test/competencyRules.test.js` — validation tests.
- `backend/src/services/competencyService.js` — teacher ownership checks, framework/mapping queries, evidence loading, snapshot persistence.
- `backend/test/competencyService.test.js` — fake-Supabase service tests.
- `backend/src/controllers/competencyController.js` — HTTP translation only.
- `frontend/src/utils/competency.js` — presentation labels, sorting, and low-confidence display rules.
- `frontend/test/competency.test.js` — pure frontend behavior tests.
- `frontend/src/components/CompetencyMappingPanel.jsx` — teacher review/edit UI for assignment/test mappings.
- `frontend/src/components/ClassCompetencyDashboard.jsx` — class summary and per-student competency detail.

### Modify

- `backend/src/database/schema.sql` — canonical fresh-database schema parity.
- `backend/src/routes/index.js` — teacher-only competency routes and validators.
- `backend/src/services/submissionService.js` — return enough submission detail for evidence generation without changing grading.
- `backend/test/teacherSubmissionView.test.js` — protect submission detail compatibility.
- `frontend/src/pages/CreateAssignment.jsx` — show competency mapping panel after assignment/test content exists.
- `frontend/src/pages/ClassDetail.jsx` — add the `Phân tích năng lực` tab.
- `README.md` — migration order, endpoints, and pilot behavior.

## Stable Interfaces

```js
// backend/src/services/masteryEngine.js
export const DEFAULT_MASTERY_CONFIG = {
  version: 1,
  recentHalfLifeDays: 45,
  confidenceEvidenceTarget: 6,
  confidenceAssignmentTarget: 3,
  lowConfidenceThreshold: 40,
};

export function calculateSkillSnapshot(evidence, config = DEFAULT_MASTERY_CONFIG)
// => { mastery, confidence, label, trend, evidence_count, assignment_count }

// backend/src/services/competencyRules.js
export function normalizeMappings(input)
// => [{ competency_id, assignment_id, test_case_id, difficulty, weight, status }]

export function validateMappings({ mappings, assignment, competencies })
// => void; throws Error with a Vietnamese user-facing message

// backend/src/services/competencyService.js
export function createCompetencyService(db)
// => {
//   listFramework({ teacherId, grade, subject }),
//   createCustomCompetency({ teacherId, input }),
//   updateCustomCompetency({ teacherId, competencyId, input }),
//   getAssignmentMappings({ teacherId, assignmentId }),
//   replaceAssignmentMappings({ teacherId, assignmentId, mappings }),
//   calculateClassSnapshots({ teacherId, classId, now }),
//   getClassDashboard({ teacherId, classId }),
//   getStudentProfile({ teacherId, classId, studentId })
// }
```

### Task 1: Secure competency schema and seed framework

**Files:**
- Create: `backend/src/database/migrations/009_competency_foundation.sql`
- Create: `backend/test/competencyMigration.test.js`
- Modify: `backend/src/database/schema.sql`

**Interfaces:**
- Consumes: existing `users`, `classes`, `assignments`, `test_cases`, `submissions`, and `submission_results` UUID keys.
- Produces: `competency_framework_versions`, `competencies`, `assignment_competency_mappings`, `competency_evidence`, `student_competency_snapshots`, and `mastery_config_versions`.

- [ ] **Step 1: Write the failing migration contract test**

```js
// backend/test/competencyMigration.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL(
  '../src/database/migrations/009_competency_foundation.sql',
  import.meta.url
);

test('competency migration creates versioned service-role-only tables', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  for (const table of [
    'competency_framework_versions',
    'competencies',
    'assignment_competency_mappings',
    'competency_evidence',
    'student_competency_snapshots',
    'mastery_config_versions',
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
    assert.match(sql, new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`));
    assert.match(sql, new RegExp(`REVOKE ALL ON ${table} FROM anon, authenticated`));
  }
  assert.match(sql, /idx_global_competency_code/);
  assert.match(sql, /idx_teacher_competency_code/);
  assert.match(sql, /idx_mapping_assignment_skill/);
  assert.match(sql, /idx_mapping_test_skill/);
  assert.match(sql, /UNIQUE\(submission_result_id, competency_id\)/);
  assert.match(sql, /CHECK \(status IN \('proposed', 'approved', 'rejected'\)\)/);
  assert.match(sql, /idx_competency_evidence_student_skill_time/);
});
```

- [ ] **Step 2: Run the migration test and verify it fails**

Run: `npm test --prefix backend -- --test-name-pattern="competency migration"`

Expected: FAIL with `ENOENT` for `009_competency_foundation.sql`.

- [ ] **Step 3: Create the migration with explicit security and indexes**

Create `backend/src/database/migrations/009_competency_foundation.sql` with these exact table contracts:

```sql
CREATE TABLE IF NOT EXISTS competency_framework_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version INTEGER NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('draft', 'active', 'retired')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS competencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_version_id UUID NOT NULL REFERENCES competency_framework_versions(id),
  code VARCHAR(80) NOT NULL,
  name VARCHAR(160) NOT NULL,
  description TEXT NOT NULL,
  subject VARCHAR(20) NOT NULL CHECK (subject IN ('python', 'sql', 'html')),
  grade VARCHAR(2) NOT NULL CHECK (grade IN ('10', '11', '12')),
  parent_id UUID REFERENCES competencies(id),
  owner_teacher_id UUID REFERENCES users(id) ON DELETE CASCADE,
  source_competency_id UUID REFERENCES competencies(id),
  prerequisite_ids UUID[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS assignment_competency_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  test_case_id UUID REFERENCES test_cases(id) ON DELETE CASCADE,
  competency_id UUID NOT NULL REFERENCES competencies(id),
  difficulty SMALLINT NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
  weight NUMERIC(6,3) NOT NULL CHECK (weight > 0 AND weight <= 10),
  status VARCHAR(20) NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'approved', 'rejected')),
  proposed_by VARCHAR(20) NOT NULL DEFAULT 'teacher'
    CHECK (proposed_by IN ('teacher', 'ai')),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
);

CREATE TABLE IF NOT EXISTS mastery_config_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version INTEGER NOT NULL UNIQUE,
  config JSONB NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('draft', 'active', 'retired')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS competency_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  competency_id UUID NOT NULL REFERENCES competencies(id),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  submission_result_id UUID NOT NULL REFERENCES submission_results(id) ON DELETE CASCADE,
  passed BOOLEAN NOT NULL,
  score_ratio NUMERIC(6,5) NOT NULL CHECK (score_ratio BETWEEN 0 AND 1),
  difficulty SMALLINT NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
  weight NUMERIC(6,3) NOT NULL CHECK (weight > 0 AND weight <= 10),
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(submission_result_id, competency_id)
);

CREATE TABLE IF NOT EXISTS student_competency_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  competency_id UUID NOT NULL REFERENCES competencies(id),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  mastery_config_version_id UUID NOT NULL REFERENCES mastery_config_versions(id),
  mastery SMALLINT NOT NULL CHECK (mastery BETWEEN 0 AND 100),
  confidence SMALLINT NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  label VARCHAR(30) NOT NULL,
  trend VARCHAR(20) NOT NULL CHECK (trend IN ('improving', 'stable', 'declining', 'insufficient')),
  evidence_count INTEGER NOT NULL CHECK (evidence_count >= 0),
  assignment_count INTEGER NOT NULL CHECK (assignment_count >= 0),
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, competency_id, class_id, mastery_config_version_id)
);

CREATE INDEX IF NOT EXISTS idx_mapping_assignment_status
  ON assignment_competency_mappings(assignment_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_global_competency_code
  ON competencies(framework_version_id, code)
  WHERE owner_teacher_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_teacher_competency_code
  ON competencies(framework_version_id, owner_teacher_id, code)
  WHERE owner_teacher_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mapping_assignment_skill
  ON assignment_competency_mappings(assignment_id, competency_id)
  WHERE test_case_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mapping_test_skill
  ON assignment_competency_mappings(assignment_id, test_case_id, competency_id)
  WHERE test_case_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_competency_evidence_student_skill_time
  ON competency_evidence(student_id, competency_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshot_class_student
  ON student_competency_snapshots(class_id, student_id, calculated_at DESC);

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'competency_framework_versions', 'competencies',
    'assignment_competency_mappings', 'mastery_config_versions',
    'competency_evidence', 'student_competency_snapshots'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON %I FROM anon, authenticated', table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO service_role', table_name);
  END LOOP;
END $$;
```

Append an idempotent framework version `1`, a mastery config version `1`, and the first Python grade-10 competencies covering input/output, variables/data types, conditionals, loops, strings, lists, functions, and decomposition. Use stable codes prefixed `PY10.`. Standard rows have `owner_teacher_id = NULL`; teacher-created rows use codes prefixed `CUSTOM.` and are visible only to their owner through the backend.

- [ ] **Step 4: Mirror the six tables and indexes in the canonical schema**

Copy the final table definitions, indexes, RLS statements, grants, and version-1 seed records into `backend/src/database/schema.sql` after `submission_results`. Do not remove or reorder existing schema objects.

- [ ] **Step 5: Run the migration contract and full backend tests**

Run: `npm test --prefix backend`

Expected: all tests PASS, including `competency migration creates versioned service-role-only tables`.

- [ ] **Step 6: Commit only Task 1 files**

```bash
git add backend/src/database/migrations/009_competency_foundation.sql backend/src/database/schema.sql backend/test/competencyMigration.test.js
git commit -m "feat: add competency foundation schema"
```

### Task 2: Deterministic mastery engine

**Files:**
- Create: `backend/src/services/masteryEngine.js`
- Create: `backend/test/masteryEngine.test.js`

**Interfaces:**
- Consumes: evidence rows shaped as `{ assignment_id, passed, score_ratio, difficulty, weight, occurred_at }`.
- Produces: `calculateSkillSnapshot(evidence, config)` as defined in Stable Interfaces.

- [ ] **Step 1: Write failing mastery tests**

```js
// backend/test/masteryEngine.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSkillSnapshot } from '../src/services/masteryEngine.js';

const config = {
  version: 1,
  recentHalfLifeDays: 30,
  confidenceEvidenceTarget: 4,
  confidenceAssignmentTarget: 2,
  lowConfidenceThreshold: 40,
  now: '2026-08-15T00:00:00.000Z',
};

test('returns insufficient for no evidence', () => {
  assert.deepEqual(calculateSkillSnapshot([], config), {
    mastery: 0,
    confidence: 0,
    label: 'Chưa đủ dữ liệu',
    trend: 'insufficient',
    evidence_count: 0,
    assignment_count: 0,
  });
});

test('weights recent, difficult, and approved evidence deterministically', () => {
  const snapshot = calculateSkillSnapshot([
    { assignment_id: 'a1', passed: false, score_ratio: 0, difficulty: 1, weight: 1, occurred_at: '2026-05-01T00:00:00Z' },
    { assignment_id: 'a2', passed: true, score_ratio: 1, difficulty: 3, weight: 2, occurred_at: '2026-08-14T00:00:00Z' },
  ], config);
  assert.ok(snapshot.mastery >= 75);
  assert.equal(snapshot.assignment_count, 2);
  assert.equal(snapshot.confidence, 75);
  assert.equal(snapshot.label, 'Thành thạo');
  assert.equal(snapshot.trend, 'improving');
});

test('never emits a weak label below the confidence threshold', () => {
  const snapshot = calculateSkillSnapshot([
    { assignment_id: 'a1', passed: false, score_ratio: 0, difficulty: 2, weight: 1, occurred_at: '2026-08-14T00:00:00Z' },
  ], config);
  assert.equal(snapshot.label, 'Chưa đủ dữ liệu');
  assert.equal(snapshot.confidence, 38);
});
```

- [ ] **Step 2: Run and verify the tests fail**

Run: `node --test backend/test/masteryEngine.test.js`

Expected: FAIL with module-not-found for `masteryEngine.js`.

- [ ] **Step 3: Implement the pure calculation**

Create `backend/src/services/masteryEngine.js` with:

```js
export const DEFAULT_MASTERY_CONFIG = Object.freeze({
  version: 1,
  recentHalfLifeDays: 45,
  confidenceEvidenceTarget: 6,
  confidenceAssignmentTarget: 3,
  lowConfidenceThreshold: 40,
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (value) => Math.round(clamp(value, 0, 100));
const masteryLabel = (mastery) => mastery < 40
  ? 'Chưa hình thành'
  : mastery < 60 ? 'Đang hình thành' : mastery < 80 ? 'Đạt' : 'Thành thạo';

export const calculateSkillSnapshot = (evidence, supplied = {}) => {
  const config = { ...DEFAULT_MASTERY_CONFIG, ...supplied };
  if (!evidence.length) return {
    mastery: 0, confidence: 0, label: 'Chưa đủ dữ liệu', trend: 'insufficient',
    evidence_count: 0, assignment_count: 0,
  };
  const nowMs = new Date(config.now ?? Date.now()).getTime();
  const weighted = evidence.map((item) => {
    const ageDays = Math.max(0, (nowMs - new Date(item.occurred_at).getTime()) / 86400000);
    const recency = 2 ** (-ageDays / config.recentHalfLifeDays);
    const difficulty = 0.8 + (Number(item.difficulty) * 0.1);
    const weight = recency * difficulty * Number(item.weight);
    return { ...item, calculatedWeight: weight, value: clamp(Number(item.score_ratio), 0, 1) };
  });
  const totalWeight = weighted.reduce((sum, item) => sum + item.calculatedWeight, 0);
  const mastery = round(100 * weighted.reduce(
    (sum, item) => sum + item.value * item.calculatedWeight, 0
  ) / totalWeight);
  const assignments = new Set(evidence.map((item) => item.assignment_id));
  const evidenceCoverage = Math.min(1, evidence.length / config.confidenceEvidenceTarget);
  const assignmentCoverage = Math.min(1, assignments.size / config.confidenceAssignmentTarget);
  const confidence = round(100 * ((evidenceCoverage + assignmentCoverage) / 2));
  const chronological = [...weighted].sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at));
  const midpoint = Math.ceil(chronological.length / 2);
  const average = (rows) => rows.reduce((sum, row) => sum + row.value, 0) / rows.length;
  const delta = chronological.length < 2 ? 0 : average(chronological.slice(midpoint)) - average(chronological.slice(0, midpoint));
  const trend = chronological.length < 2 ? 'insufficient' : delta > 0.1 ? 'improving' : delta < -0.1 ? 'declining' : 'stable';
  return {
    mastery,
    confidence,
    label: confidence < config.lowConfidenceThreshold ? 'Chưa đủ dữ liệu' : masteryLabel(mastery),
    trend,
    evidence_count: evidence.length,
    assignment_count: assignments.size,
  };
};
```

- [ ] **Step 4: Run targeted and full backend tests**

Run: `node --test backend/test/masteryEngine.test.js`

Expected: 3 tests PASS.

Run: `npm test --prefix backend`

Expected: all backend tests PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add backend/src/services/masteryEngine.js backend/test/masteryEngine.test.js
git commit -m "feat: calculate deterministic competency mastery"
```

### Task 3: Mapping validation rules

**Files:**
- Create: `backend/src/services/competencyRules.js`
- Create: `backend/test/competencyRules.test.js`

**Interfaces:**
- Consumes: assignment, framework competencies, and proposed mapping rows.
- Produces: normalized unique mappings or a Vietnamese validation error.

- [ ] **Step 1: Write failing validation tests**

```js
// backend/test/competencyRules.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMappings, validateMappings } from '../src/services/competencyRules.js';

test('normalizes identifiers and numeric mapping fields', () => {
  assert.deepEqual(normalizeMappings([{
    competency_id: ' c1 ', assignment_id: ' a1 ', test_case_id: '',
    difficulty: '3', weight: '1.5', status: 'approved',
  }]), [{
    competency_id: 'c1', assignment_id: 'a1', test_case_id: null,
    difficulty: 3, weight: 1.5, status: 'approved',
  }]);
});

test('rejects cross-subject and unowned test mappings', () => {
  const assignment = { id: 'a1', type: 'python', test_cases: [{ id: 't1' }] };
  assert.throws(() => validateMappings({
    assignment,
    competencies: [{ id: 'sql1', subject: 'sql', grade: '11', is_active: true }],
    mappings: [{ assignment_id: 'a1', test_case_id: 'missing', competency_id: 'sql1', difficulty: 2, weight: 1, status: 'approved' }],
  }), /không thuộc bài|không phù hợp môn/);
});

test('rejects duplicate competency and test pairs', () => {
  const base = { assignment_id: 'a1', test_case_id: 't1', competency_id: 'c1', difficulty: 2, weight: 1, status: 'approved' };
  assert.throws(() => validateMappings({
    assignment: { id: 'a1', type: 'python', test_cases: [{ id: 't1' }] },
    competencies: [{ id: 'c1', subject: 'python', grade: '10', is_active: true }],
    mappings: [base, base],
  }), /bị trùng/);
});

test('rejects a competency owned by another teacher', () => {
  assert.throws(() => validateCompetencyScope({
    competency: { owner_teacher_id: 't2', subject: 'python', grade: '10' },
    teacherId: 't1', subject: 'python', grade: '10',
  }), /không có quyền/);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test backend/test/competencyRules.test.js`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement exact validation behavior**

Create `backend/src/services/competencyRules.js`. `normalizeMappings` trims IDs, maps empty `test_case_id` to `null`, converts numeric fields, and defaults status to `proposed`. `validateMappings` must reject: missing competencies, inactive competencies, competencies owned by another teacher, subject mismatch, grades outside the assignment category, test IDs not belonging to the assignment, difficulty outside 1–5, weight outside `(0, 10]`, unknown status, and duplicate `(test_case_id, competency_id)` pairs. It returns nothing on success. Export `validateCompetencyScope({ competency, teacherId, subject, grade })` so create/update and mapping paths share the same ownership/subject/grade rule.

```js
const allowedStatuses = new Set(['proposed', 'approved', 'rejected']);
export const normalizeMappings = (rows = []) => rows.map((row) => ({
  competency_id: String(row.competency_id ?? '').trim(),
  assignment_id: String(row.assignment_id ?? '').trim(),
  test_case_id: String(row.test_case_id ?? '').trim() || null,
  difficulty: Number(row.difficulty),
  weight: Number(row.weight),
  status: row.status ?? 'proposed',
}));
```

- [ ] **Step 4: Run targeted and full backend tests**

Run: `node --test backend/test/competencyRules.test.js`

Expected: 3 tests PASS.

Run: `npm test --prefix backend`

Expected: all backend tests PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add backend/src/services/competencyRules.js backend/test/competencyRules.test.js
git commit -m "feat: validate assignment competency mappings"
```

### Task 4: Teacher-owned competency service

**Files:**
- Create: `backend/src/services/competencyService.js`
- Create: `backend/test/competencyService.test.js`

**Interfaces:**
- Consumes: Supabase-like `db`, teacher ID, assignment/class/student IDs, normalized mappings.
- Produces: the six methods listed in Stable Interfaces.

- [ ] **Step 1: Write fake-database service tests**

Create `backend/test/competencyService.test.js` using the Proxy-chain pattern from `backend/test/assignmentDeliveryService.test.js`. Cover these exact behaviors:

```js
test('rejects mapping replacement when the teacher does not own the assignment', async () => {
  const db = fakeSupabase([{ data: { id: 'a1', teacher_id: 'other' }, error: null }]);
  const service = createCompetencyService(db);
  await assert.rejects(
    service.replaceAssignmentMappings({ teacherId: 't1', assignmentId: 'a1', mappings: [] }),
    /không có quyền/
  );
  assert.equal(db.calls.some((call) => call.method === 'insert'), false);
});

test('persists evidence only from approved mappings', async () => {
  const db = competencyEvidenceFixture();
  const service = createCompetencyService(db);
  await service.calculateClassSnapshots({ teacherId: 't1', classId: 'c1', now: '2026-08-15T00:00:00Z' });
  const upsert = db.calls.find((call) => call.table === 'competency_evidence' && call.method === 'upsert');
  assert.equal(upsert.args[0].length, 1);
  assert.equal(upsert.args[0][0].submission_result_id, 'r-approved');
});

test('returns only students enrolled in the owned class', async () => {
  const service = createCompetencyService(classDashboardFixture());
  const result = await service.getStudentProfile({ teacherId: 't1', classId: 'c1', studentId: 's1' });
  assert.equal(result.student.id, 's1');
  assert.equal(result.skills[0].evidence[0].submission_id, 'sub1');
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test backend/test/competencyService.test.js`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement ownership and framework/mapping queries**

Create `backend/src/services/competencyService.js` exporting `createCompetencyService(db)`. Add these private helpers:

```js
const requireOwnedClass = async (db, classId, teacherId) => {
  const { data, error } = await db.from('classes')
    .select('id,name,grade,subject,teacher_id').eq('id', classId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.teacher_id !== teacherId) throw new Error('Bạn không có quyền truy cập lớp này.');
  return data;
};

const requireOwnedAssignment = async (db, assignmentId, teacherId) => {
  const { data, error } = await db.from('assignments')
    .select('id,teacher_id,type,category,test_cases(id)').eq('id', assignmentId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.teacher_id !== teacherId) throw new Error('Bạn không có quyền chỉnh sửa bài tập này.');
  return data;
};

const requireEnrollment = async (db, classId, studentId) => {
  const { data, error } = await db.from('enrollments')
    .select('id').eq('class_id', classId).eq('user_id', studentId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Học sinh không thuộc lớp này.');
  return data;
};
```

`replaceAssignmentMappings` must validate all rows before the first delete, delete only rows for the owned assignment, and insert reviewer fields as:

```js
{
  ...mapping,
  reviewed_by: mapping.status === 'approved' ? teacherId : null,
  reviewed_at: mapping.status === 'approved' ? new Date().toISOString() : null,
}
```

`listFramework` must return active standard competencies plus custom competencies where `owner_teacher_id = teacherId`; it must never return another teacher's custom rows. `createCustomCompetency` inserts an active row owned by `teacherId` in the active framework version after validating Python/10 pilot scope. `updateCustomCompetency` may update only rows whose `owner_teacher_id` equals `teacherId`; standard rows are immutable. Both methods accept only `name`, `description`, `subject`, `grade`, `parent_id`, and `prerequisite_ids`; the service generates a stable `CUSTOM.<UUID>` code.

- [ ] **Step 4: Implement evidence and snapshot calculation**

`calculateClassSnapshots` must:

1. Verify class ownership.
2. Load enrolled students, class deliveries, all submissions/results, and only `approved` mappings.
3. Convert each mapped result into one idempotent evidence row using `score_ratio = passed ? 1 : 0`.
4. Upsert evidence on `submission_result_id,competency_id`.
5. Group evidence by `(student_id, competency_id)`.
6. Call `calculateSkillSnapshot` with the active mastery config.
7. Upsert snapshots on `student_id,competency_id,class_id,mastery_config_version_id`.
8. Return `{ calculated_at, student_count, skill_count, snapshot_count }`.

Do not alter submission scores or submission results.

- [ ] **Step 5: Implement dashboard/profile reads with evidence links**

`getClassDashboard` returns:

```js
{
  class: { id, name, grade, subject },
  calculated_at,
  skills: [{ competency_id, code, name, student_counts: { insufficient, emerging, achieved, mastered } }],
  students: [{ id, full_name, skills: [{ competency_id, mastery, confidence, label, trend }] }],
}
```

`getStudentProfile` returns the same snapshot fields plus evidence rows containing `submission_id`, `submission_result_id`, `assignment_id`, assignment title, test name, passed state, and occurrence time.

- [ ] **Step 6: Run targeted and full tests**

Run: `node --test backend/test/competencyService.test.js`

Expected: all competency service tests PASS.

Run: `npm test --prefix backend`

Expected: all backend tests PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add backend/src/services/competencyService.js backend/test/competencyService.test.js
git commit -m "feat: add teacher-owned competency service"
```

### Task 5: Competency HTTP API

**Files:**
- Create: `backend/src/controllers/competencyController.js`
- Modify: `backend/src/routes/index.js`
- Create: `backend/test/competencyController.test.js`

**Interfaces:**
- Consumes: `createCompetencyService(supabase)` and authenticated `req.user.id`.
- Produces: teacher-only JSON endpoints.

- [ ] **Step 1: Write failing controller tests**

Use injected controller handlers so tests do not start Express:

```js
test('replace mappings passes only the authenticated teacher identity', async () => {
  const calls = [];
  const controller = createCompetencyController({
    async replaceAssignmentMappings(args) { calls.push(args); return [{ id: 'm1' }]; },
  });
  const req = { user: { id: 'teacher-1' }, params: { assignmentId: 'a1' }, body: { mappings: [] } };
  const res = responseRecorder();
  await controller.replaceAssignmentMappings(req, res, res.next);
  assert.deepEqual(calls[0], { teacherId: 'teacher-1', assignmentId: 'a1', mappings: [] });
  assert.equal(res.body[0].id, 'm1');
});
```

Also test that a service error reaches `next(error)` and does not emit a 200 response.

- [ ] **Step 2: Run and verify failure**

Run: `node --test backend/test/competencyController.test.js`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement controller factory and default instance**

`backend/src/controllers/competencyController.js` exports `createCompetencyController(service)` and default named handlers wired to `createCompetencyService(supabase)`. Every handler wraps the awaited service call in `try/catch` and calls `next(error)`.

- [ ] **Step 4: Add validated teacher routes**

Add these routes to `backend/src/routes/index.js`, before the generic `/api/assignments/:id` route:

```js
router.get('/api/competencies', authenticate, requireRole('teacher'), competencyController.listFramework);
router.post('/api/competencies', authenticate, requireRole('teacher'), [
  body('name').trim().isLength({ min: 3, max: 160 }).withMessage('Tên kỹ năng không hợp lệ'),
  body('description').trim().isLength({ min: 10 }).withMessage('Mô tả kỹ năng quá ngắn'),
  body('subject').equals('python').withMessage('Thử nghiệm hiện chỉ hỗ trợ Python'),
  body('grade').equals('10').withMessage('Thử nghiệm hiện chỉ hỗ trợ khối 10'),
  validate,
], competencyController.createCustomCompetency);
router.patch('/api/competencies/:competencyId', authenticate, requireRole('teacher'), competencyController.updateCustomCompetency);
router.get('/api/assignments/:assignmentId/competencies', authenticate, requireRole('teacher'), competencyController.getAssignmentMappings);
router.put('/api/assignments/:assignmentId/competencies', authenticate, requireRole('teacher'), [
  body('mappings').isArray({ min: 1 }).withMessage('Cần ít nhất một kỹ năng'),
  body('mappings.*.competency_id').isUUID().withMessage('Kỹ năng không hợp lệ'),
  body('mappings.*.difficulty').isInt({ min: 1, max: 5 }).withMessage('Độ khó phải từ 1 đến 5'),
  body('mappings.*.weight').isFloat({ gt: 0, max: 10 }).withMessage('Trọng số không hợp lệ'),
  body('mappings.*.status').isIn(['proposed', 'approved', 'rejected']).withMessage('Trạng thái không hợp lệ'),
  validate,
], competencyController.replaceAssignmentMappings);
router.post('/api/classes/:id/competencies/calculate', authenticate, requireRole('teacher'), competencyController.calculateClassSnapshots);
router.get('/api/classes/:id/competencies', authenticate, requireRole('teacher'), competencyController.getClassDashboard);
router.get('/api/classes/:id/students/:studentId/competencies', authenticate, requireRole('teacher'), competencyController.getStudentProfile);
```

- [ ] **Step 5: Run targeted and full backend tests**

Run: `node --test backend/test/competencyController.test.js`

Expected: controller tests PASS.

Run: `npm test --prefix backend`

Expected: all backend tests PASS.

- [ ] **Step 6: Commit Task 5**

```bash
git add backend/src/controllers/competencyController.js backend/src/routes/index.js backend/test/competencyController.test.js
git commit -m "feat: expose teacher competency API"
```

### Task 6: Protect evidence detail compatibility

**Files:**
- Modify: `backend/src/services/submissionService.js`
- Modify: `backend/test/teacherSubmissionView.test.js`

**Interfaces:**
- Consumes: existing teacher submission detail query.
- Produces: stable result IDs/test-case IDs required for evidence links.

- [ ] **Step 1: Extend the failing detail contract test**

Add a pure mapper export named `mapSubmissionDetail` and this test:

```js
test('submission detail preserves IDs required by competency evidence', () => {
  const detail = mapSubmissionDetail({
    submission: { id: 'sub1', user_id: 's1', assignment_id: 'a1' },
    student: { id: 's1' },
    assignment: { id: 'a1', title: 'Vòng lặp' },
    results: [{ id: 'r1', test_case_id: 't1', test_name: 'bien_nho', passed: false }],
  });
  assert.equal(detail.results[0].id, 'r1');
  assert.equal(detail.results[0].test_case_id, 't1');
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test backend/test/teacherSubmissionView.test.js`

Expected: FAIL because `mapSubmissionDetail` is not exported.

- [ ] **Step 3: Add the pure mapper and query field**

Export:

```js
export const mapSubmissionDetail = ({ submission, student, assignment, results }) => ({
  ...submission,
  student,
  assignment,
  results: results ?? [],
});
```

Update the `submission_results` select in `getSubmissionForTeacher` to include `test_case_id`, and return `mapSubmissionDetail(...)`. Do not change authorization checks.

- [ ] **Step 4: Run backend tests**

Run: `npm test --prefix backend`

Expected: all backend tests PASS.

- [ ] **Step 5: Commit Task 6**

```bash
git add backend/src/services/submissionService.js backend/test/teacherSubmissionView.test.js
git commit -m "feat: expose competency evidence identifiers"
```

### Task 7: Frontend competency presentation rules

**Files:**
- Create: `frontend/src/utils/competency.js`
- Create: `frontend/test/competency.test.js`

**Interfaces:**
- Consumes: API snapshot and mapping records.
- Produces: stable Vietnamese display labels and deterministic sorting.

- [ ] **Step 1: Write failing utility tests**

```js
// frontend/test/competency.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { displayMastery, sortCompetencies } from '../src/utils/competency.js';

test('hides mastery labels when confidence is low', () => {
  assert.deepEqual(displayMastery({ mastery: 18, confidence: 39, label: 'Chưa hình thành' }), {
    label: 'Chưa đủ dữ liệu', tone: 'neutral', value: null,
  });
});

test('shows approved mastery when confidence is sufficient', () => {
  assert.deepEqual(displayMastery({ mastery: 82, confidence: 70, label: 'Thành thạo' }), {
    label: 'Thành thạo', tone: 'success', value: 82,
  });
});

test('sorts competencies by framework code', () => {
  assert.deepEqual(sortCompetencies([{ code: 'PY10.2' }, { code: 'PY10.1' }]).map((x) => x.code), ['PY10.1', 'PY10.2']);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test frontend/test/competency.test.js`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement presentation helpers**

Create `frontend/src/utils/competency.js` with a confidence threshold of `40`, neutral display below threshold, tone mapping for the four approved labels, and locale-independent sorting by `code`.

- [ ] **Step 4: Run frontend tests**

Run: `npm test --prefix frontend`

Expected: all frontend tests PASS.

- [ ] **Step 5: Commit Task 7**

```bash
git add frontend/src/utils/competency.js frontend/test/competency.test.js
git commit -m "feat: add competency presentation rules"
```

### Task 8: Teacher mapping panel in assignment form

**Files:**
- Create: `frontend/src/components/CompetencyMappingPanel.jsx`
- Modify: `frontend/src/pages/CreateAssignment.jsx`
- Create: `frontend/test/competencyMappingForm.test.js`

**Interfaces:**
- Consumes: `GET /api/competencies`, `GET/PUT /api/assignments/:assignmentId/competencies`, current assignment ID and test cases.
- Produces: approved mappings saved only after assignment/test content exists.

- [ ] **Step 1: Write failing mapping-state tests**

Extract and test a pure helper in `frontend/src/utils/competency.js`:

```js
test('buildMappingPayload binds selected tests and numeric fields', () => {
  assert.deepEqual(buildMappingPayload('a1', [{
    competency_id: 'c1', test_case_id: 't1', difficulty: '2', weight: '1', approved: true,
  }]), [{
    assignment_id: 'a1', competency_id: 'c1', test_case_id: 't1',
    difficulty: 2, weight: 1, status: 'approved',
  }]);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test frontend/test/competencyMappingForm.test.js`

Expected: FAIL because `buildMappingPayload` is absent.

- [ ] **Step 3: Implement `CompetencyMappingPanel`**

The component must render:

- Framework skills filtered by current assignment type/category.
- `Thêm kỹ năng riêng` form for a teacher-owned Python grade-10 skill; standard skills remain read-only.
- Assignment-level or individual test-case mapping selector.
- Difficulty 1–5 and weight inputs.
- Status badge: `AI đề xuất`, `Đã duyệt`, or `Đã từ chối`.
- `Duyệt tất cả`, `Lưu kỹ năng`, and retry/error states.
- A blocking note when no persisted assignment ID exists: `Hãy lưu nội dung bài trước khi gắn kỹ năng.`

Use existing `Button`, `Badge`, and form styles. Do not create a second assignment-save implementation.

- [ ] **Step 4: Integrate after test cases in `CreateAssignment.jsx`**

Render the panel only in edit mode after the assignment and its test cases have loaded:

```jsx
{isEdit && assignmentId && (
  <CompetencyMappingPanel
    assignmentId={assignmentId}
    assignmentType={form.type}
    category={form.category}
    testCases={testCases}
  />
)}
```

- [ ] **Step 5: Run frontend tests and build**

Run: `npm test --prefix frontend`

Expected: all frontend tests PASS.

Run: `npm run build --prefix frontend`

Expected: Vite build exits 0.

- [ ] **Step 6: Commit Task 8**

```bash
git add frontend/src/components/CompetencyMappingPanel.jsx frontend/src/pages/CreateAssignment.jsx frontend/src/utils/competency.js frontend/test/competencyMappingForm.test.js
git commit -m "feat: let teachers approve assignment skills"
```

### Task 9: Class competency dashboard and student evidence view

**Files:**
- Create: `frontend/src/components/ClassCompetencyDashboard.jsx`
- Modify: `frontend/src/pages/ClassDetail.jsx`
- Create: `frontend/test/competencyDashboard.test.js`

**Interfaces:**
- Consumes: class dashboard/profile/calculation endpoints.
- Produces: a teacher-only `Phân tích năng lực` tab with evidence links.

- [ ] **Step 1: Add failing summary transformation tests**

Add `buildCompetencySummary` to `frontend/src/utils/competency.js` and test:

```js
test('class summary counts low-confidence students separately', () => {
  const summary = buildCompetencySummary([{ competency_id: 'c1', mastery: 20, confidence: 10 }]);
  assert.deepEqual(summary.c1, { insufficient: 1, emerging: 0, achieved: 0, mastered: 0 });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test frontend/test/competencyDashboard.test.js`

Expected: FAIL because `buildCompetencySummary` is absent.

- [ ] **Step 3: Implement `ClassCompetencyDashboard`**

The component loads `/api/classes/:id/competencies` and renders:

- Last-calculated timestamp and `Cập nhật chỉ số` button.
- Skill cards showing counts for insufficient/emerging/achieved/mastered.
- Student table with mastery, confidence, trend, and no rank column.
- Student detail modal loaded from `/api/classes/:id/students/:studentId/competencies`.
- Evidence rows linking to the existing submission-detail modal/API by `submission_id`.
- Empty states for no approved mappings, no submissions, and calculation not run.

After `POST /api/classes/:id/competencies/calculate`, reload the dashboard. Disable the button during calculation and show the backend error without discarding the last successful data.

- [ ] **Step 4: Add the class tab**

Modify the tab list in `frontend/src/pages/ClassDetail.jsx`:

```jsx
{ key: 'competencies', label: 'Phân tích năng lực' }
```

Map it to a suitable icon already available from `lucide-react`, and render:

```jsx
{tab === 'competencies' && <ClassCompetencyDashboard classId={classId} />}
```

- [ ] **Step 5: Run frontend tests and build**

Run: `npm test --prefix frontend`

Expected: all frontend tests PASS.

Run: `npm run build --prefix frontend`

Expected: Vite build exits 0.

- [ ] **Step 6: Commit Task 9**

```bash
git add frontend/src/components/ClassCompetencyDashboard.jsx frontend/src/pages/ClassDetail.jsx frontend/src/utils/competency.js frontend/test/competencyDashboard.test.js
git commit -m "feat: show class competency dashboard"
```

### Task 10: Documentation and end-to-end verification

**Files:**
- Modify: `README.md`
- Modify: `test/documentation.test.js`

**Interfaces:**
- Consumes: completed foundation behavior.
- Produces: deployment and user-facing operational instructions.

- [ ] **Step 1: Extend the documentation contract test**

Require the README to mention:

```js
for (const phrase of [
  '009_competency_foundation.sql',
  'Phân tích năng lực',
  'Chưa đủ dữ liệu',
  '/api/classes/:id/competencies',
]) {
  assert.match(readme, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
```

- [ ] **Step 2: Run and verify documentation test failure**

Run: `npm run test:docs`

Expected: FAIL because the new migration and feature are not documented.

- [ ] **Step 3: Update README**

Add migration 009 to the database sequence, document that the pilot is Python grade 10, explain teacher approval of mappings, explain mastery/confidence and `Chưa đủ dữ liệu`, and add the five competency endpoints to the API table.

- [ ] **Step 4: Run all automated checks**

Run:

```bash
npm run test:docs
npm test --prefix backend
npm test --prefix frontend
npm run build --prefix frontend
```

Expected: every command exits 0.

- [ ] **Step 5: Verify database security before production migration**

Against a disposable Supabase environment, apply the migration and verify:

```sql
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname IN (
  'competency_framework_versions', 'competencies',
  'assignment_competency_mappings', 'mastery_config_versions',
  'competency_evidence', 'student_competency_snapshots'
)
ORDER BY relname;
```

Expected: six rows with `relrowsecurity = true`.

Then verify `anon` and `authenticated` have no table privileges and run the available Supabase database/security advisors. Do not apply the migration to production as part of this task.

- [ ] **Step 6: Perform the pilot acceptance walkthrough**

Using a teacher-owned Python grade-10 class:

1. Open an assignment and approve at least one skill per test.
2. Submit two attempts as a student, first failing and then passing the mapped tests.
3. Calculate class competency snapshots.
4. Confirm the recent successful attempt raises mastery and the trend is `improving`.
5. Confirm evidence links open the exact submission/test.
6. Confirm another teacher cannot access the class dashboard endpoint.
7. Confirm a skill with insufficient evidence displays `Chưa đủ dữ liệu`.

- [ ] **Step 7: Commit Task 10**

```bash
git add README.md test/documentation.test.js
git commit -m "docs: document competency foundation"
```

## Final Review Gate

Before calling the foundation complete:

- Confirm `git status --short` contains no accidentally staged user-owned files.
- Review the full diff from the first foundation commit through HEAD.
- Re-run the four automated commands from Task 10.
- Record the disposable-database verification results in the implementation handoff.
- Do not begin AI assignment authoring until this foundation is accepted.
