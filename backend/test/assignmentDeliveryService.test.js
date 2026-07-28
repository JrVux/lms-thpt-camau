import test from 'node:test';
import assert from 'node:assert/strict';

import { createAssignmentDeliveryService } from '../src/services/assignmentDeliveryService.js';

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
            return chain;
          };
        },
      });
      return chain;
    },
  };
};

test('validates every class before inserting the first delivery', async () => {
  const db = fakeSupabase([
    { data: { id: 'a1', teacher_id: 't1', category: 'grade_10', type: 'python' }, error: null },
    { data: [{ id: 'c1', teacher_id: 't1', grade: '11', subject: 'python' }], error: null },
    { data: [], error: null },
  ]);
  const service = createAssignmentDeliveryService(db);

  await assert.rejects(
    service.deliver({
      teacherId: 't1',
      assignmentId: 'a1',
      deliveries: [{ class_id: 'c1', recipient_mode: 'all' }],
    }),
    /không phù hợp/
  );
  assert.equal(db.calls.some((call) => call.table === 'assignment_deliveries' && call.method === 'insert'), false);
});

test('writes independent settings and selected recipients per class', async () => {
  const db = fakeSupabase([
    { data: { id: 'a1', teacher_id: 't1', category: 'grade_10', type: 'python' }, error: null },
    { data: [
      { id: 'c1', teacher_id: 't1', grade: '10', subject: 'python' },
      { id: 'c2', teacher_id: 't1', grade: '10', subject: 'python' },
    ], error: null },
    { data: [{ class_id: 'c2', user_id: 's1' }], error: null },
    { data: { id: 'd1' }, error: null },
    { data: { id: 'd2' }, error: null },
    { data: [{ delivery_id: 'd2', user_id: 's1' }], error: null },
  ]);
  const service = createAssignmentDeliveryService(db);

  const result = await service.deliver({
    teacherId: 't1',
    assignmentId: 'a1',
    deliveries: [
      { class_id: 'c1', recipient_mode: 'all', due_date: '2026-08-01', is_published: true, max_submissions: 2 },
      { class_id: 'c2', recipient_mode: 'selected', student_ids: ['s1'], due_date: '2026-08-02', max_submissions: 1 },
    ],
  });

  assert.equal(result.created, 2);
  assert.equal(result.failed, 0);
  assert.deepEqual(result.deliveries.map((item) => item.id), ['d1', 'd2']);
  const deliveryPayloads = db.calls
    .filter((call) => call.table === 'assignment_deliveries' && call.method === 'insert')
    .map((call) => call.args[0][0]);
  assert.equal(deliveryPayloads[0].max_submissions, 2);
  assert.equal(deliveryPayloads[1].recipient_mode, 'selected');
  const recipients = db.calls.find((call) => call.table === 'assignment_recipients' && call.method === 'insert').args[0];
  assert.deepEqual(recipients, [{ delivery_id: 'd2', user_id: 's1' }]);
});

test('detach clones content and test cases for only one delivery', async () => {
  const db = fakeSupabase([
    {
      data: {
        id: 'd1',
        class_id: 'c1',
        library_assignment_id: 'a1',
        assignments: {
          id: 'a1',
          title: 'Bài gốc',
          teacher_id: 't1',
          category: 'grade_10',
          type: 'python',
          content_version: 2,
          test_cases: [{ id: 'tc1', expected_output: '2', points: 1 }],
        },
      },
      error: null,
    },
    { data: { id: 'copy1' }, error: null },
    { data: [{ id: 'copy-tc1' }], error: null },
    { data: { id: 'd1', assignment_id: 'copy1', sync_mode: 'detached' }, error: null },
  ]);
  const service = createAssignmentDeliveryService(db);

  const detached = await service.detach({ teacherId: 't1', deliveryId: 'd1' });

  assert.equal(detached.assignment_id, 'copy1');
  const update = db.calls.find((call) => call.table === 'assignment_deliveries' && call.method === 'update').args[0];
  assert.deepEqual(update.sync_mode, 'detached');
});
