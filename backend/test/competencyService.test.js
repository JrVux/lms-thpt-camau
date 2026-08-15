import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEvidenceRows,
  createCompetencyService,
  filterVisibleCompetencies,
} from '../src/services/competencyService.js';

const fakeSupabase = (responses) => {
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

test('rejects mapping replacement when the teacher does not own the assignment', async () => {
  const db = fakeSupabase([{ data: { id: 'a1', teacher_id: 'other' }, error: null }]);
  const service = createCompetencyService(db);
  await assert.rejects(
    service.replaceAssignmentMappings({ teacherId: 't1', assignmentId: 'a1', mappings: [] }),
    /không có quyền/
  );
  assert.equal(db.calls.some((call) => call.method === 'insert'), false);
});

test('builds evidence only from approved mappings and matching test results', () => {
  const rows = buildEvidenceRows({
    submissions: [{
      id: 'sub1', user_id: 's1', assignment_id: 'a1', submitted_at: '2026-08-15T00:00:00Z',
      submission_results: [
        { id: 'r-approved', test_case_id: 't1', passed: true },
        { id: 'r-proposed', test_case_id: 't2', passed: false },
      ],
    }],
    mappings: [
      { assignment_id: 'a1', test_case_id: 't1', competency_id: 'c1', difficulty: 2, weight: 1, status: 'approved' },
      { assignment_id: 'a1', test_case_id: 't2', competency_id: 'c1', difficulty: 3, weight: 1, status: 'proposed' },
    ],
  });
  assert.deepEqual(rows, [{
    student_id: 's1', competency_id: 'c1', assignment_id: 'a1', submission_id: 'sub1',
    submission_result_id: 'r-approved', passed: true, score_ratio: 1,
    difficulty: 2, weight: 1, occurred_at: '2026-08-15T00:00:00Z',
  }]);
});

test('applies approved assignment-level mappings to browser test results without test-case IDs', () => {
  const rows = buildEvidenceRows({
    submissions: [{
      id: 'sub1', user_id: 's1', assignment_id: 'a1', submitted_at: '2026-08-15T00:00:00Z',
      submission_results: [{ id: 'browser-result', test_case_id: null, passed: true }],
    }],
    mappings: [{ assignment_id: 'a1', test_case_id: null, competency_id: 'c1', difficulty: 2, weight: 1, status: 'approved' }],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].submission_result_id, 'browser-result');
  assert.equal(rows[0].competency_id, 'c1');
});

test('returns standard skills and only custom skills owned by the teacher', () => {
  const visible = filterVisibleCompetencies([
    { id: 'standard', owner_teacher_id: null },
    { id: 'mine', owner_teacher_id: 't1' },
    { id: 'other', owner_teacher_id: 't2' },
  ], 't1');
  assert.deepEqual(visible.map((row) => row.id), ['standard', 'mine']);
});
