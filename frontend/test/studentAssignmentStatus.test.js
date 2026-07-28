import test from 'node:test';
import assert from 'node:assert/strict';

import { assignmentStatus, runPendingRegrade } from '../src/utils/studentAssignmentStatus.js';

test('regrade has precedence over submitted and overdue', () => {
  assert.equal(assignmentStatus(
    { due_date: '2026-08-01' },
    { regrade_status: 'required' },
    new Date('2026-08-10')
  ), 'regrade');
});

test('returns submitted, overdue, and pending states', () => {
  const now = new Date('2026-08-10');
  assert.equal(assignmentStatus({}, { regrade_status: 'current' }, now), 'submitted');
  assert.equal(assignmentStatus({ due_date: '2026-08-01' }, null, now), 'overdue');
  assert.equal(assignmentStatus({ due_date: '2026-08-11' }, null, now), 'pending');
});

test('runs pending regrade through the supplied browser runner', async () => {
  const result = await runPendingRegrade({
    submission: { id: 's1', regrade_status: 'required', code: 'print(1)' },
    assignment: { id: 'a1' },
    runner: async ({ code }) => [{ passed: code === 'print(1)' }],
  });
  assert.equal(result.submissionId, 's1');
  assert.deepEqual(result.results, [{ passed: true }]);
});
