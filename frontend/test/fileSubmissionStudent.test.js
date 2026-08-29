import test from 'node:test';
import assert from 'node:assert/strict';
import { studentFileCard } from '../src/utils/fileSubmission.js';

test('file card uses file route and graded copy', () => {
  const card = studentFileCard({ id: 'd1', assignment_status: 'graded', assignments: { submission_type: 'essay' }, submissions: [{ score: 8, max_score: 10 }] });
  assert.equal(card.href, '/deliveries/d1/file-submission');
  assert.equal(card.badge, 'Tự luận');
  assert.match(card.status, /8\/10/);
});
