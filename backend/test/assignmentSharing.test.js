import test from 'node:test';
import assert from 'node:assert/strict';
import {
  copyAssignmentsIndependently,
  normalizeIds,
  validateShareRequest,
} from '../src/services/assignmentSharing.js';

const validRequest = (overrides = {}) => ({
  sourceClass: { id: 'source', teacher_id: 'teacher-1', grade: '10' },
  targetClasses: [{ id: 'target', teacher_id: 'teacher-1', grade: '10' }],
  targetClassIds: ['target'],
  assignments: [{ id: 'assignment-1', class_id: 'source' }],
  assignmentIds: ['assignment-1'],
  teacherId: 'teacher-1',
  ...overrides,
});

test('normalizeIds removes empty and duplicate IDs while preserving order', () => {
  assert.deepEqual(normalizeIds(['a', '', 'b', 'a', null, 'c']), ['a', 'b', 'c']);
});

test('accepts owned target classes in the same grade', () => {
  assert.doesNotThrow(() => validateShareRequest(validRequest()));
});

test('rejects a source class not owned by the teacher', () => {
  assert.throws(
    () => validateShareRequest(validRequest({
      sourceClass: { id: 'source', teacher_id: 'teacher-2', grade: '10' },
    })),
    /lớp nguồn/
  );
});

test('rejects target classes owned by another teacher', () => {
  assert.throws(
    () => validateShareRequest(validRequest({
      targetClasses: [{ id: 'target', teacher_id: 'teacher-2', grade: '10' }],
    })),
    /không phải giáo viên/
  );
});

test('rejects target classes in another grade', () => {
  assert.throws(
    () => validateShareRequest(validRequest({
      targetClasses: [{ id: 'target', teacher_id: 'teacher-1', grade: '11' }],
    })),
    /cùng khối/
  );
});

test('rejects the source class as a target', () => {
  assert.throws(
    () => validateShareRequest(validRequest({
      targetClasses: [{ id: 'source', teacher_id: 'teacher-1', grade: '10' }],
      targetClassIds: ['source'],
    })),
    /lớp nguồn/
  );
});

test('rejects missing target classes', () => {
  assert.throws(
    () => validateShareRequest(validRequest({ targetClasses: [] })),
    /không tồn tại/
  );
});

test('rejects assignments not belonging to the source class', () => {
  assert.throws(
    () => validateShareRequest(validRequest({
      assignments: [{ id: 'assignment-1', class_id: 'another-class' }],
    })),
    /không thuộc lớp nguồn/
  );
});

test('rejects missing requested assignments', () => {
  assert.throws(
    () => validateShareRequest(validRequest({ assignments: [] })),
    /không tồn tại/
  );
});

test('rejects an empty assignment selection', () => {
  assert.throws(
    () => validateShareRequest(validRequest({
      assignments: [],
      assignmentIds: [],
    })),
    /chọn ít nhất một bài tập/
  );
});

const makeRepository = ({ failTestCasesFor } = {}) => {
  const calls = {
    assignments: [],
    testCases: [],
    maxScores: [],
    deleted: [],
  };

  return {
    calls,
    repository: {
      async createAssignment(data) {
        calls.assignments.push(data);
        return { id: `copy-${calls.assignments.length}` };
      },
      async createTestCases(rows) {
        if (rows[0]?.assignment_id === failTestCasesFor) {
          throw new Error('Không thể sao chép test case');
        }
        calls.testCases.push(rows);
      },
      async updateAssignmentMaxScore(assignmentId, maxScore) {
        calls.maxScores.push({ assignmentId, maxScore });
      },
      async deleteAssignment(assignmentId) {
        calls.deleted.push(assignmentId);
      },
    },
  };
};

const sourceAssignment = {
  id: 'assignment-1',
  class_id: 'source',
  title: 'Vòng lặp',
  description: 'Bài luyện tập',
  type: 'python',
  due_date: '2026-08-01T00:00:00Z',
  is_published: true,
  created_at: '2026-07-28T00:00:00Z',
  test_cases: [{
    id: 'test-1',
    assignment_id: 'assignment-1',
    input_data: '2',
    expected_output: '4',
    test_name: 'Bình phương',
    points: 2,
    order_index: 0,
  }],
};

test('creates independent draft assignments and test cases for every target class', async () => {
  const { calls, repository } = makeRepository();

  const result = await copyAssignmentsIndependently({
    targetClassIds: ['class-a', 'class-b'],
    assignments: [sourceAssignment],
    repository,
  });

  assert.deepEqual(result, {
    copied: 2,
    failed: 0,
    targetCount: 2,
    failures: [],
  });
  assert.deepEqual(
    calls.assignments.map(({ class_id, is_published }) => ({ class_id, is_published })),
    [
      { class_id: 'class-a', is_published: false },
      { class_id: 'class-b', is_published: false },
    ]
  );
  assert.equal(calls.assignments[0].id, undefined);
  assert.equal(calls.assignments[0].created_at, undefined);
  assert.equal(calls.assignments[0].test_cases, undefined);
  assert.equal(calls.assignments[0].due_date, sourceAssignment.due_date);
  assert.deepEqual(calls.testCases.map((rows) => rows[0].assignment_id), ['copy-1', 'copy-2']);
  assert.equal(calls.testCases[0][0].id, undefined);
  assert.deepEqual(calls.maxScores, [
    { assignmentId: 'copy-1', maxScore: 2 },
    { assignmentId: 'copy-2', maxScore: 2 },
  ]);
});

test('deletes an incomplete assignment and reports a test-case copy failure', async () => {
  const { calls, repository } = makeRepository({ failTestCasesFor: 'copy-1' });

  const result = await copyAssignmentsIndependently({
    targetClassIds: ['class-a'],
    assignments: [sourceAssignment],
    repository,
  });

  assert.equal(result.copied, 0);
  assert.equal(result.failed, 1);
  assert.deepEqual(calls.deleted, ['copy-1']);
  assert.deepEqual(result.failures, [{
    assignmentId: 'assignment-1',
    targetClassId: 'class-a',
    message: 'Không thể sao chép test case',
  }]);
});

test('creates assignments that have no test cases without extra writes', async () => {
  const { calls, repository } = makeRepository();

  const result = await copyAssignmentsIndependently({
    targetClassIds: ['class-a'],
    assignments: [{ ...sourceAssignment, test_cases: [] }],
    repository,
  });

  assert.equal(result.copied, 1);
  assert.equal(result.failed, 0);
  assert.deepEqual(calls.testCases, []);
  assert.deepEqual(calls.maxScores, []);
});
