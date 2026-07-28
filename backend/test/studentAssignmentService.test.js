import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canReceive,
  assignmentStatus,
  scoreResults,
} from '../src/services/studentAssignmentService.js';

test('all recipients and explicitly selected students can receive a delivery', () => {
  assert.equal(canReceive({ recipient_mode: 'all', assignment_recipients: [] }, 's1'), true);
  assert.equal(canReceive({
    recipient_mode: 'selected',
    assignment_recipients: [{ user_id: 's1' }],
  }, 's1'), true);
  assert.equal(canReceive({
    recipient_mode: 'selected',
    assignment_recipients: [{ user_id: 's1' }],
  }, 's2'), false);
});

test('partitions pending, submitted, overdue, and regrade states', () => {
  const now = new Date('2026-08-10T00:00:00Z');
  assert.equal(assignmentStatus({ due_date: '2026-08-11', submissions: [] }, now), 'pending');
  assert.equal(assignmentStatus({ due_date: '2026-08-09', submissions: [] }, now), 'overdue');
  assert.equal(assignmentStatus({ submissions: [{ regrade_status: 'current' }] }, now), 'submitted');
  assert.equal(assignmentStatus({ submissions: [{ regrade_status: 'required' }] }, now), 'regrade');
});

test('scores database test cases by their configured points', () => {
  const scored = scoreResults(
    [{ id: 'tc1', points: 3 }, { id: 'tc2', points: 2 }],
    [
      { test_case_id: 'tc1', passed: true },
      { test_case_id: 'tc2', passed: false },
    ]
  );
  assert.equal(scored.score, 3);
  assert.equal(scored.maxScore, 5);
  assert.equal(scored.rows.length, 2);
});

test('scales browser test results to an explicit assignment max score', () => {
  const scored = scoreResults([], [
    { test_name: 'a', points: 1, passed: true },
    { test_name: 'b', points: 1, passed: false },
  ], 10);
  assert.equal(scored.score, 5);
  assert.equal(scored.maxScore, 10);
});

test('rejects duplicate, unknown, or incomplete database test results', () => {
  const tests = [{ id: 'tc1', points: 3 }, { id: 'tc2', points: 2 }];
  assert.throws(() => scoreResults(tests, [
    { test_case_id: 'tc1', passed: true },
    { test_case_id: 'tc1', passed: true },
  ]), /không đầy đủ hoặc bị trùng/);
  assert.throws(() => scoreResults(tests, [
    { test_case_id: 'tc1', passed: true },
    { test_case_id: 'unknown', passed: true },
  ]), /không đầy đủ hoặc bị trùng/);
});

test('browser result score never exceeds configured maximum', () => {
  const scored = scoreResults([], [{ test_name: 'a', points: 1000, passed: true }], 10);
  assert.equal(scored.score, 10);
  assert.equal(scored.maxScore, 10);
});

test('browser result never derives its grade scale from client points', () => {
  const scored = scoreResults([], [{ test_name: 'a', points: 1000000, passed: true }], 0);
  assert.equal(scored.score, 10);
  assert.equal(scored.maxScore, 10);
});
