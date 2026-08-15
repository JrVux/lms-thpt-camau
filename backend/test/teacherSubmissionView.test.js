import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-key';

const { buildLatestSubmissionMap, mapSubmissionDetail } = await import('../src/services/submissionService.js');

test('gradebook keeps the latest submission id so teachers can open the submitted work', () => {
  const map = buildLatestSubmissionMap([
    {
      id: 'new-submission',
      user_id: 'student-1',
      delivery_id: 'delivery-1',
      score: 9,
      max_score: 10,
      submitted_at: '2026-07-28T10:00:00.000Z',
    },
    {
      id: 'old-submission',
      user_id: 'student-1',
      delivery_id: 'delivery-1',
      score: 7,
      max_score: 10,
      submitted_at: '2026-07-27T10:00:00.000Z',
    },
  ]);

  assert.deepEqual(map['student-1_delivery-1'], {
    id: 'new-submission',
    score: 9,
    max_score: 10,
    submitted_at: '2026-07-28T10:00:00.000Z',
  });
});

test('submission detail preserves IDs required by competency evidence', () => {
  const detail = mapSubmissionDetail({
    submission: { id: 'sub1', user_id: 's1', assignment_id: 'a1' },
    student: { id: 's1' },
    assignment: { id: 'a1', title: 'Vòng lặp' },
    results: [{ id: 'r1', test_case_id: 't1', test_name: 'bien_nho', passed: false }],
  });
  assert.equal(detail.results[0].id, 'r1');
  assert.equal(detail.results[0].test_case_id, 't1');
});
