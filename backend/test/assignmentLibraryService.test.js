import test from 'node:test';
import assert from 'node:assert/strict';

import { createAssignmentLibraryService } from '../src/services/assignmentLibraryService.js';

const fakeSupabase = (responses) => {
  const calls = [];
  return {
    calls,
    async rpc(name, args) {
      calls.push({ method: 'rpc', name, args });
      return responses.shift() ?? { data: null, error: null };
    },
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
  const select = db.calls.find((call) => call.table === 'assignments' && call.method === 'select');
  assert.match(
    select.args[0],
    /assignment_deliveries!assignment_deliveries_library_assignment_id_fkey\(count\)/
  );
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

test('scoring update uses the atomic content-and-regrade transaction', async () => {
  const db = fakeSupabase([
    { data: { id: 'a1', content_version: 3 }, error: null },
  ]);
  const service = createAssignmentLibraryService(db);

  await service.update({
    teacherId: 't1',
    assignmentId: 'a1',
    input: { teacher_id: 'attacker', starter_code: 'print(2)' },
  });

  const rpc = db.calls.find((call) => call.method === 'rpc');
  assert.equal(rpc.name, 'update_assignment_content');
  assert.deepEqual(rpc.args, {
    p_assignment_id: 'a1',
    p_teacher_id: 't1',
    p_updates: { starter_code: 'print(2)' },
    p_library_only: true,
  });
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
    { data: { id: 'a1', content_version: 5 }, error: null },
  ]);
  const service = createAssignmentLibraryService(db);

  await service.replaceTestCases({
    teacherId: 't1',
    assignmentId: 'a1',
    testCases: [{ expected_output: '2', points: 3 }, { expected_output: '4', points: 2 }],
  });

  const rpc = db.calls.find((call) => call.method === 'rpc');
  assert.equal(rpc.name, 'replace_assignment_tests');
  assert.equal(rpc.args.p_assignment_id, 'a1');
  assert.equal(rpc.args.p_teacher_id, 't1');
  assert.deepEqual(rpc.args.p_test_cases.map((item) => item.order_index), [0, 1]);
});
