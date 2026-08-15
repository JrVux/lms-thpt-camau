import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudentEvidenceService, normalizeAnalysisScope } from '../src/services/studentEvidenceService.js';

const classRow = (teacherId) => ({ data: { id: 'class-1', teacher_id: teacherId, name: 'Lớp 10 Python', grade: '10', subject: 'python' }, error: null });
const enrolledRow = () => ({ data: { id: 'enr-1', user_id: 'student-1', class_id: 'class-1' }, error: null });
const noEnroll = () => ({ data: null, error: null });

const submission = (id, submittedAt, results) => ({
  id, user_id: 'student-1', assignment_id: 'a-1', delivery_id: 'd-1', submitted_at: submittedAt,
  score: 10, max_score: 10,
  assignment: { id: 'a-1', title: 'Vòng lặp', type: 'python', description: 'Làm quen vòng lặp' },
  submission_results: results,
});

const result = (rid, passed) => ({
  id: rid, test_case_id: 't-1', test_name: 'bien_nho', passed,
  points: 5, actual_output: 'ok', error_message: null,
});

const fakeDb = (responses) => {
  const calls = [];
  return {
    calls,
    from(table) {
      const response = responses.shift() ?? { data: null, error: null };
      const chain = new Proxy({}, {
        get(_target, method) {
          if (method === 'then') return (resolve, reject) => Promise.resolve(response).then(resolve, reject);
          return (...args) => {
            calls.push({ table, method, args });
            if (['single', 'maybeSingle'].includes(method)) return Promise.resolve(response);
            return chain;
          };
        },
      });
      return chain;
    },
  };
};

test('teacher must own the class', async () => {
  const db = fakeDb([classRow('other')]);
  const service = createStudentEvidenceService(db);
  await assert.rejects(service.preview({ teacherId: 'teacher-1', classId: 'class-1', studentId: 'student-1', scope: { mode: 'latest', limit: 5 } }), /không có quyền/);
});

test('student must be enrolled', async () => {
  const db = fakeDb([classRow('teacher-1'), noEnroll()]);
  const service = createStudentEvidenceService(db);
  await assert.rejects(service.preview({ teacherId: 'teacher-1', classId: 'class-1', studentId: 's-x', scope: { mode: 'latest', limit: 5 } }), /không thuộc lớp/);
});

const previewFixture = (submissions, teacherId = 'teacher-1') => {
  const responses = [classRow(teacherId), enrolledRow(), { data: submissions, error: null }];
  return createStudentEvidenceService(fakeDb([...responses, ...responses]));
};

test('enforces latest limit and never returns pii', async () => {
  const sub1 = submission('s-1', '2026-08-01T00:00:00Z', [result('r-1', true), result('r-2', false)]);
  const sub2 = submission('s-2', '2026-08-02T00:00:00Z', [result('r-3', true), result('r-4', false)]);
  const service = previewFixture([sub1, sub2]);
  const preview = await service.preview({ teacherId: 'teacher-1', classId: 'class-1', studentId: 'student-1', scope: { mode: 'latest', limit: 5 } });
  assert.equal(preview.counts.submission_count, 2);
  const bundle = await service.buildBundle({ teacherId: 'teacher-1', classId: 'class-1', studentId: 'student-1', scope: { mode: 'latest', limit: 5 } });
  const json = JSON.stringify(bundle.bundle).toLowerCase();
  assert.doesNotMatch(json, /student-1|teacher-1|@/);
  assert.match(json, /student_01/);
});

test('date range scope is accepted and inclusive on the boundary', async () => {
  const sub = submission('s-1', '2026-08-01T00:00:00Z', [result('r-1', true), result('r-2', false)]);
  const sub2 = submission('s-2', '2026-08-15T00:00:00Z', [result('r-3', true), result('r-4', false)]);
  const service = previewFixture([sub, sub2]);
  const preview = await service.preview({ teacherId: 'teacher-1', classId: 'class-1', studentId: 'student-1', scope: { mode: 'dates', from: '2026-08-01', to: '2026-08-31' } });
  assert.equal(preview.counts.submission_count, 2);
  await assert.doesNotReject(service.buildBundle({ teacherId: 'teacher-1', classId: 'class-1', studentId: 'student-1', scope: { mode: 'dates', from: '2026-08-01', to: '2026-08-31' } }));
});

test('sparse evidence throws unless confirmed', async () => {
  const service = previewFixture([]);
  await assert.rejects(
    service.buildBundle({ teacherId: 'teacher-1', classId: 'class-1', studentId: 'student-1', scope: { mode: 'latest', limit: 5 } }),
    (err) => err.code === 'SPARSE_EVIDENCE_CONFIRMATION_REQUIRED'
  );
  const sub = submission('s-1', '2026-08-01T00:00:00Z', [result('r-1', true), result('r-2', false)]);
  const sub2 = submission('s-2', '2026-08-02T00:00:00Z', [result('r-3', true), result('r-4', false)]);
  const svc2 = previewFixture([sub, sub2]);
  const ok = await svc2.buildBundle({ teacherId: 'teacher-1', classId: 'class-1', studentId: 'student-1', scope: { mode: 'latest', limit: 5 } });
  assert.equal(ok.counts.submission_count, 2);
  assert.equal(ok.counts.test_result_count, 4);
});

test('fingerprint changes when selected submission changes', async () => {
  const subA = submission('s-1', '2026-08-01T00:00:00Z', [result('r-1', true), result('r-9', false)]);
  const subB = submission('s-2', '2026-08-02T00:00:00Z', [result('r-2', true), result('r-8', false)]);
  const subC = submission('s-3', '2026-08-03T00:00:00Z', [result('r-3', true), result('r-7', false)]);
  const service = previewFixture([subA, subB, subC]);
  const b1 = await service.buildBundle({ teacherId: 'teacher-1', classId: 'class-1', studentId: 'student-1', scope: { mode: 'latest', limit: 5 } });
  const svc2 = previewFixture([subB, subC, subA]);
  const b2 = await svc2.buildBundle({ teacherId: 'teacher-1', classId: 'class-1', studentId: 'student-1', scope: { mode: 'latest', limit: 3 } });
  assert.notEqual(b1.fingerprint, b2.fingerprint);
});

test('normalizeAnalysisScope rejects invalid inputs', () => {
  assert.throws(() => normalizeAnalysisScope({ mode: 'latest', limit: 7 }), /Số bài/);
  assert.throws(() => normalizeAnalysisScope({ mode: 'dates', from: '2026-08-02', to: '2026-08-01' }), /Khoảng/);
  assert.deepEqual(normalizeAnalysisScope({}), { mode: 'latest', limit: 5 });
  assert.deepEqual(normalizeAnalysisScope({ limit: 10 }), { mode: 'latest', limit: 10 });
});
