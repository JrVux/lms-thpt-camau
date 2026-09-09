import test from 'node:test';
import assert from 'node:assert/strict';
import { createEssayGradingService, reviewedScore, toStudentEssaySubmission, buildPublishResult } from '../src/services/essayGradingService.js';

const rubric = [{ id: 'c1', max_points: 4 }, { id: 'c2', max_points: 6 }];

test('derives reviewed score from exact rubric criteria', () => {
  assert.equal(reviewedScore([{ rubric_item_id: 'c1', awarded_points: 3 }, { rubric_item_id: 'c2', awarded_points: 5 }], rubric, 10), 8);
  assert.throws(() => reviewedScore([{ rubric_item_id: 'c1', awarded_points: 5 }, { rubric_item_id: 'c2', awarded_points: 5 }], rubric, 10), /vượt/i);
});

test('redacts draft grades and reveals only published reviewed results', () => {
  const hidden = toStudentEssaySubmission({ id: 's1', score: 9, feedback: 'private', graded_at: 'now' }, { published_at: null, extracted_text: 'OCR', ai_score: 9 });
  assert.equal(hidden.score, undefined);
  assert.equal(hidden.feedback, undefined);
  assert.equal(toStudentEssaySubmission({ id: 's1', object_key: 'private/key' }, null).object_key, undefined);
  assert.equal(hidden.published_result, null);
  assert.equal(JSON.stringify(hidden).includes('OCR'), false);
  const shown = toStudentEssaySubmission({ id: 's1', max_score: 10 }, { published_at: 'now', reviewed_score: 8, reviewed_feedback: 'Tốt', reviewed_criteria_results: [{ rubric_item_id: 'c1', awarded_points: 3 }], show_model_answer: true, essay_grading_jobs: { model_answer_snapshot: 'Đáp án lúc nộp', rubric_snapshot: [{ id: 'c1', title: 'Ý chính', max_points: 4 }] } }, 'Đáp án hiện tại');
  assert.equal(shown.published_result.score, 8);
  assert.equal(shown.published_result.model_answer, 'Đáp án lúc nộp');
  assert.equal(shown.published_result.criteria_results[0].title, 'Ý chính');
});

test('bulk result separates approved and skipped reports', () => {
  assert.deepEqual(buildPublishResult([{ submission_id: 's1', review_status: 'approved' }, { submission_id: 's2', review_status: 'pending' }]), { publishable: ['s1'], skipped: [{ submission_id: 's2', reason: 'not_approved' }] });
});

test('manual essay grading creates an approved but unpublished review', async () => {
  const inserts = [];
  const db = {
    from(table) {
      if (table === 'essay_grading_events') {
        return { insert: async (payload) => { inserts.push({ table, payload }); return { error: null }; } };
      }
      const builder = {
        insert(payload) {
          inserts.push({ table, payload });
          return builder;
        },
        select: () => builder,
        maybeSingle: async () => ({
          data: table === 'essay_grading_jobs'
            ? { id: 'j1' }
            : { id: 'r1', ...inserts.findLast((item) => item.table === table).payload },
          error: null,
        }),
      };
      return builder;
    },
  };

  const report = await createEssayGradingService(db).createManualReview({
    teacherId: 't1',
    submission: { id: 's1', delivery_id: 'd1', user_id: 'u1' },
    assignment: { id: 'a1', max_score: 10, content_version: 2 },
    score: 8,
    feedback: 'Lập luận rõ.',
  });

  assert.equal(report.review_status, 'approved');
  assert.equal(report.reviewed_score, 8);
  assert.equal(report.published_at, undefined);
  assert.equal(inserts.find((item) => item.table === 'essay_grading_jobs').payload.prompt_version, 'manual-review-v1');
  assert.equal(inserts.find((item) => item.table === 'essay_grading_events').payload.event_type, 'manual_review_approved');
});
