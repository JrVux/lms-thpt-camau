import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-key';

const {
  flattenDeliveryAssignment,
  canStudentSeeDelivery,
} = await import('../src/services/assignmentService.js');

test('flattens delivery content while preserving both identifiers and per-class settings', () => {
  const flattened = flattenDeliveryAssignment({
    id: 'd1',
    assignment_id: 'a1',
    due_date: '2026-08-01',
    is_published: true,
    max_submissions: 2,
    sync_mode: 'linked',
    assignments: { id: 'a1', title: 'Bài 1', type: 'python', due_date: null },
  });
  assert.equal(flattened.id, 'a1');
  assert.equal(flattened.assignment_id, 'a1');
  assert.equal(flattened.delivery_id, 'd1');
  assert.equal(flattened.due_date, '2026-08-01');
  assert.equal(flattened.max_submissions, 2);
});

test('student visibility requires publish and recipient membership', () => {
  assert.equal(canStudentSeeDelivery({ is_published: false, recipient_mode: 'all' }, 's1'), false);
  assert.equal(canStudentSeeDelivery({ is_published: true, recipient_mode: 'all' }, 's1'), true);
  assert.equal(canStudentSeeDelivery({
    is_published: true,
    recipient_mode: 'selected',
    assignment_recipients: [{ user_id: 's2' }],
  }, 's1'), false);
});
