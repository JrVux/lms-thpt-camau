import test from 'node:test';
import assert from 'node:assert/strict';

import { createAssignmentLibraryService } from '../src/services/assignmentLibraryService.js';

const fakeSupabase = (responses) => {
  const calls = [];
  return {
    calls,
    from(table) {
      const response = responses.shift() ?? { data: null, error: null };
      const chain = new Proxy({}, {
        get(_target, method) {
          if (method === 'then') {
            return (resolve, reject) => Promise.resolve(response).then(resolve, reject);
          }
          return (...args) => {
            calls.push({ table, method, args });
            return chain;
          };
        },
      });
      return chain;
    },
  };
};

test('list filters by owner, library flag, and category', async () => {
  const db = fakeSupabase([{ data: [{ id: 'a1' }], error: null }]);
  const service = createAssignmentLibraryService(db);

  assert.deepEqual(await service.list({ teacherId: 't1', category: 'grade_10' }), [{ id: 'a1', delivery_count: 0 }]);
  assert.ok(db.calls.some((call) => call.method === 'eq' && call.args[0] === 'teacher_id' && call.args[1] === 't1'));
  assert.ok(db.calls.some((call) => call.method === 'eq' && call.args[0] === 'is_library' && call.args[1] === true));
  assert.ok(db.calls.some((call) => call.method === 'eq' && call.args[0] === 'category' && call.args[1] === 'grade_10'));
});

test('create sets ownership, category, and initial version', async () => {
  const db = fakeSupabase([{ data: { id: 'a1' }, error: null }]);
  const service = createAssignmentLibraryService(db);

  await service.create({
    teacherId: 't1',
    input: { title: 'Vòng lặp', category: 'grade_10', type: 'python' },
  });

  const payload = db.calls.find((call) => call.method === 'insert').args[0][0];
  assert.equal(payload.teacher_id, 't1');
  assert.equal(payload.category, 'grade_10');
  assert.equal(payload.content_version, 1);
  assert.equal(payload.is_library, true);
});

test('update ignores teacher_id and increments version for scoring content', async () => {
  const db = fakeSupabase([
    { data: { id: 'a1', content_version: 2 }, error: null },
    { data: { id: 'a1', content_version: 3 }, error: null },
    { data: [{ id: 'd1' }], error: null },
    { data: null, error: null },
  ]);
  const service = createAssignmentLibraryService(db);

  await service.update({
    teacherId: 't1',
    assignmentId: 'a1',
    input: { teacher_id: 'attacker', starter_code: 'print(2)' },
  });

  const updatePayload = db.calls.find((call) => call.table === 'assignments' && call.method === 'update').args[0];
  assert.equal(updatePayload.teacher_id, undefined);
  assert.deepEqual(
    { starter_code: updatePayload.starter_code, content_version: updatePayload.content_version },
    { starter_code: 'print(2)', content_version: 3 }
  );
  assert.match(updatePayload.updated_at, /^\d{4}-\d{2}-\d{2}T/);
  assert.ok(db.calls.some((call) => call.table === 'submissions' && call.method === 'update'));
});

test('title-only update does not mark submissions', async () => {
  const db = fakeSupabase([
    { data: { id: 'a1', content_version: 2 }, error: null },
    { data: { id: 'a1', title: 'Mới' }, error: null },
  ]);
  const service = createAssignmentLibraryService(db);

  await service.update({ teacherId: 't1', assignmentId: 'a1', input: { title: 'Mới' } });

  assert.equal(db.calls.some((call) => call.table === 'submissions'), false);
});

test('replacing tests recalculates max score, increments version, and marks linked submissions', async () => {
  const db = fakeSupabase([
    { data: { id: 'a1', content_version: 4 }, error: null },
    { data: [{ id: 'old-tc' }], error: null },
    { data: [{ id: 'new-tc' }], error: null },
    { data: { id: 'a1', content_version: 5 }, error: null },
    { data: [{ id: 'd1' }], error: null },
    { data: null, error: null },
    { data: null, error: null },
  ]);
  const service = createAssignmentLibraryService(db);

  await service.replaceTestCases({
    teacherId: 't1',
    assignmentId: 'a1',
    testCases: [{ expected_output: '2', points: 3 }, { expected_output: '4', points: 2 }],
  });

  const assignmentUpdate = db.calls.find((call) => call.table === 'assignments' && call.method === 'update').args[0];
  assert.equal(assignmentUpdate.max_score, 5);
  assert.equal(assignmentUpdate.content_version, 5);
  const submissionUpdate = db.calls.find((call) => call.table === 'submissions' && call.method === 'update').args[0];
  assert.deepEqual(submissionUpdate, { regrade_status: 'required', regrade_error: null });
});
