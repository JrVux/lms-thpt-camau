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

  assert.deepEqual(await service.list({ teacherId: 't1', category: 'grade_10' }), [{ id: 'a1', delivery_count: 0, topic: null }]);
  assert.ok(db.calls.some((call) => call.method === 'eq' && call.args[0] === 'teacher_id' && call.args[1] === 't1'));
  assert.ok(db.calls.some((call) => call.method === 'eq' && call.args[0] === 'is_library' && call.args[1] === true));
  assert.ok(db.calls.some((call) => call.method === 'eq' && call.args[0] === 'category' && call.args[1] === 'grade_10'));
  const select = db.calls.find((call) => call.table === 'assignments' && call.method === 'select');
  assert.match(
    select.args[0],
    /assignment_deliveries!assignment_deliveries_library_assignment_id_fkey\(count\)/
  );
  assert.match(select.args[0], /assignment_topics\(name\)/);
});

test('list filters by topic and embeds its name', async () => {
  const db = fakeSupabase([{
    data: [{
      id: 'a1',
      topic_id: 'tp1',
      assignment_topics: { name: 'Vòng lặp' },
      assignment_deliveries: [{ count: 3 }],
    }],
    error: null,
  }]);
  const service = createAssignmentLibraryService(db);

  const result = await service.list({ teacherId: 't1', category: 'grade_10', topicId: 'tp1' });
  assert.deepEqual(result, [{ id: 'a1', topic_id: 'tp1', delivery_count: 3, topic: 'Vòng lặp' }]);
  assert.ok(db.calls.some((call) => call.method === 'eq' && call.args[0] === 'topic_id' && call.args[1] === 'tp1'));
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

test('create passes topic_id and normalizes empty topic to null', async () => {
  const db = fakeSupabase([{ data: { id: 'a1', topic_id: null }, error: null }]);
  const service = createAssignmentLibraryService(db);

  await service.create({
    teacherId: 't1',
    input: { title: 'Bài 2', category: 'grade_10', type: 'python', topic_id: '' },
  });

  const payload = db.calls.find((call) => call.method === 'insert').args[0][0];
  assert.equal(payload.topic_id, null);
});

test('topic-only update goes through the plain path without touching submissions', async () => {
  const db = fakeSupabase([
    { data: { id: 'a1', topic_id: 'tp1' }, error: null },
  ]);
  const service = createAssignmentLibraryService(db);

  await service.update({ teacherId: 't1', assignmentId: 'a1', input: { topic_id: 'tp1' } });

  assert.equal(db.calls.some((call) => call.method === 'rpc'), false);
  assert.equal(db.calls.some((call) => call.table === 'submissions'), false);
  const update = db.calls.find((call) => call.table === 'assignments' && call.method === 'update');
  assert.equal(update.args[0].topic_id, 'tp1');
});

test('listTopics embeds assignment counts and scopes by teacher and category', async () => {
  const db = fakeSupabase([{
    data: [{ id: 'tp1', name: 'Vòng lặp', assignments: [{ count: 4 }] }],
    error: null,
  }]);
  const service = createAssignmentLibraryService(db);

  assert.deepEqual(await service.listTopics({ teacherId: 't1', category: 'grade_10' }), [
    { id: 'tp1', name: 'Vòng lặp', assignment_count: 4 },
  ]);
  assert.ok(db.calls.some((call) => call.method === 'eq' && call.args[0] === 'teacher_id' && call.args[1] === 't1'));
  assert.ok(db.calls.some((call) => call.method === 'eq' && call.args[0] === 'category' && call.args[1] === 'grade_10'));
});

test('createTopic appends after the last topic of the category', async () => {
  const db = fakeSupabase([
    { data: { sort_order: 2 }, error: null },
    { data: { id: 'tp2', name: 'Hàm', sort_order: 3 }, error: null },
  ]);
  const service = createAssignmentLibraryService(db);

  const created = await service.createTopic({ teacherId: 't1', category: 'grade_10', name: 'Hàm' });
  assert.equal(created.id, 'tp2');

  const inserts = db.calls.filter((call) => call.method === 'insert');
  assert.equal(inserts.length, 1);
  assert.deepEqual(inserts[0].args[0][0], {
    teacher_id: 't1',
    category: 'grade_10',
    name: 'Hàm',
    sort_order: 3,
  });
});

test('createTopic starts ordering from zero on an empty category', async () => {
  const db = fakeSupabase([
    { data: null, error: null },
    { data: { id: 'tp1', name: 'Biến', sort_order: 0 }, error: null },
  ]);
  const service = createAssignmentLibraryService(db);

  const created = await service.createTopic({ teacherId: 't1', category: 'grade_11', name: 'Biến' });
  assert.equal(created.sort_order, 0);
});

test('createTopic surfaces a friendly conflict for duplicate names', async () => {
  const db = fakeSupabase([
    { data: { sort_order: 1 }, error: null },
    { data: null, error: { code: '23505', message: 'duplicate key' } },
  ]);
  const service = createAssignmentLibraryService(db);

  await assert.rejects(
    () => service.createTopic({ teacherId: 't1', category: 'grade_10', name: 'Vòng lặp' }),
    (error) => error.code === 'CONFLICT' && error.message.includes('đã tồn tại')
  );
});

test('renameTopic updates only the teacher-owned topic', async () => {
  const db = fakeSupabase([{ data: { id: 'tp1', name: 'Vòng lặp mới' }, error: null }]);
  const service = createAssignmentLibraryService(db);

  const renamed = await service.renameTopic({ teacherId: 't1', topicId: 'tp1', name: 'Vòng lặp mới' });
  assert.equal(renamed.name, 'Vòng lặp mới');

  const update = db.calls.find((call) => call.method === 'update');
  assert.equal(update.args[0].name, 'Vòng lặp mới');
  assert.ok(db.calls.some((call) => call.method === 'eq' && call.args[0] === 'teacher_id' && call.args[1] === 't1'));
});

test('deleteTopic removes a topic owned by the teacher', async () => {
  const db = fakeSupabase([{ data: { id: 'tp1' }, error: null }]);
  const service = createAssignmentLibraryService(db);

  const deleted = await service.deleteTopic({ teacherId: 't1', topicId: 'tp1' });
  assert.equal(deleted.id, 'tp1');

  const del = db.calls.find((call) => call.method === 'delete');
  assert.ok(del);
  assert.ok(db.calls.some((call) => call.method === 'eq' && call.args[0] === 'teacher_id' && call.args[1] === 't1'));
});

test('deleting a missing topic reports NOT_FOUND', async () => {
  const db = fakeSupabase([{ data: null, error: { code: 'PGRST116', message: 'no rows' } }]);
  const service = createAssignmentLibraryService(db);

  await assert.rejects(
    () => service.deleteTopic({ teacherId: 't1', topicId: 'missing' }),
    (error) => error.code === 'NOT_FOUND'
  );
});

test('deleteAssignment calls the transaction RPC for library assignments', async () => {
  const db = fakeSupabase([{ data: { status: 'deleted', id: 'a1', copies: 2 }, error: null }]);
  const service = createAssignmentLibraryService(db);

  const result = await service.deleteAssignment({ teacherId: 't1', assignmentId: 'a1', libraryOnly: true });
  assert.equal(result.status, 'deleted');

  const rpc = db.calls.find((call) => call.method === 'rpc');
  assert.equal(rpc.name, 'delete_assignment_owned');
  assert.deepEqual(rpc.args, {
    p_assignment_id: 'a1',
    p_teacher_id: 't1',
    p_library_only: true,
  });
});

test('deleteAssignment defaults to library-only and maps missing rows to NOT_FOUND', async () => {
  const db = fakeSupabase([{ data: { status: 'not_found' }, error: null }]);
  const service = createAssignmentLibraryService(db);

  await assert.rejects(
    () => service.deleteAssignment({ teacherId: 't1', assignmentId: 'missing' }),
    (error) => error.code === 'NOT_FOUND'
  );

  const rpc = db.calls.find((call) => call.method === 'rpc');
  assert.equal(rpc.args.p_library_only, true);
});

test('deleteAssignment maps forbidden status to FORBIDDEN', async () => {
  const db = fakeSupabase([{ data: { status: 'forbidden' }, error: null }]);
  const service = createAssignmentLibraryService(db);

  await assert.rejects(
    () => service.deleteAssignment({ teacherId: 't1', assignmentId: 'a1', libraryOnly: false }),
    (error) => error.code === 'FORBIDDEN'
  );
});
