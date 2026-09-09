import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewedScore, toStudentEssaySubmission, buildPublishResult } from '../src/services/essayGradingService.js';

const rubric = [{ id: 'c1', max_points: 4 }, { id: 'c2', max_points: 6 }];

test('derives reviewed score from exact rubric criteria', () => {
  assert.equal(reviewedScore([{ rubric_item_id: 'c1', awarded_points: 3 }, { rubric_item_id: 'c2', awarded_points: 5 }], rubric, 10), 8);
  assert.throws(() => reviewedScore([{ rubric_item_id: 'c1', awarded_points: 5 }, { rubric_item_id: 'c2', awarded_points: 5 }], rubric, 10), /vượt/i);
});

test('redacts draft grades and reveals only published reviewed results', () => {
  const hidden = toStudentEssaySubmission({ id: 's1', score: 9, feedback: 'private', graded_at: 'now' }, { published_at: null, extracted_text: 'OCR', ai_score: 9 });
  assert.equal(hidden.score, undefined);
  assert.equal(hidden.feedback, undefined);
  assert.equal(hidden.published_result, null);
  assert.equal(JSON.stringify(hidden).includes('OCR'), false);
  const shown = toStudentEssaySubmission({ id: 's1', max_score: 10 }, { published_at: 'now', reviewed_score: 8, reviewed_feedback: 'Tốt', reviewed_criteria_results: [], show_model_answer: true }, 'Đáp án');
  assert.equal(shown.published_result.score, 8);
  assert.equal(shown.published_result.model_answer, 'Đáp án');
});

test('bulk result separates approved and skipped reports', () => {
  assert.deepEqual(buildPublishResult([{ submission_id: 's1', review_status: 'approved' }, { submission_id: 's2', review_status: 'pending' }]), { publishable: ['s1'], skipped: [{ submission_id: 's2', reason: 'not_approved' }] });
});
