import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEssayGradingService,
  reviewedScore,
  reviewedPercentageScore,
  toStudentEssaySubmission,
  buildPublishResult,
} from '../src/services/essayGradingService.js';

const rubric = [{ id: 'c1', max_points: 4 }, { id: 'c2', max_points: 6 }];

test('derives reviewed score from exact rubric criteria', () => {
  assert.equal(reviewedScore([{ rubric_item_id: 'c1', awarded_points: 3 }, { rubric_item_id: 'c2', awarded_points: 5 }], rubric, 10), 8);
  assert.throws(() => reviewedScore([{ rubric_item_id: 'c1', awarded_points: 5 }, { rubric_item_id: 'c2', awarded_points: 5 }], rubric, 10), /vượt/i);
});

test('validates reviewed percentage and derives the final score', () => {
  assert.deepEqual(reviewedPercentageScore(83, 10), { correctnessPercentage: 83, score: 8.3 });
  assert.deepEqual(reviewedPercentageScore(33.3, 7), { correctnessPercentage: 33.3, score: 2.3 });
  assert.throws(() => reviewedPercentageScore(101, 10), /phần trăm/i);
  assert.throws(() => reviewedPercentageScore('', 10), /phần trăm/i);
  assert.throws(() => reviewedPercentageScore(null, 10), /phần trăm/i);
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

  const percentageShown = toStudentEssaySubmission(
    { id: 's2', max_score: 10, object_key: 'private/key' },
    {
      grading_method: 'percentage_v2', published_at: 'now', reviewed_score: 8.3,
      reviewed_correctness_percentage: 83, reviewed_feedback: 'Tốt',
      ai_content_analysis: {
        correct_content: [{ description: 'Đúng khái niệm', evidence_snippets: ['dẫn chứng'] }],
        missing_or_incorrect_content: [{ description: 'Thiếu ví dụ', explanation: 'Cần ví dụ.' }],
        contradictions: [], confidence: 0.9,
      },
      ai_strengths: ['Rõ ràng'], ai_improvements: ['Thêm ví dụ'], show_model_answer: false,
      essay_grading_jobs: { grading_method: 'percentage_v2', model_answer_snapshot: 'bí mật', rubric_snapshot: [] },
    },
    'đáp án hiện tại',
  );
  assert.equal(percentageShown.published_result.correctness_percentage, 83);
  assert.equal(percentageShown.published_result.score, 8.3);
  assert.equal(percentageShown.published_result.model_answer, undefined);
  assert.equal(percentageShown.published_result.criteria_results, undefined);
  assert.equal(JSON.stringify(percentageShown).includes('private/key'), false);
});

test('bulk result separates approved and skipped reports', () => {
  assert.deepEqual(buildPublishResult([{ submission_id: 's1', review_status: 'approved' }, { submission_id: 's2', review_status: 'pending' }]), { publishable: ['s1'], skipped: [{ submission_id: 's2', reason: 'not_approved' }] });
});

test('enqueue persists an explicit grading method and prompt version', async () => {
  const inserts = [];
  const db = {
    from(table) {
      if (table === 'essay_grading_events') return { insert: async (payload) => { inserts.push({ table, payload }); return { error: null }; } };
      const builder = {
        insert(payload) { inserts.push({ table, payload }); return builder; },
        select: () => builder,
        maybeSingle: async () => ({ data: { id: `job-${inserts.length}`, ...inserts.findLast((item) => item.table === table).payload }, error: null }),
      };
      return builder;
    },
  };
  const grading = createEssayGradingService(db);
  await grading.enqueue({
    submission: { id: 's1', delivery_id: 'd1', user_id: 'u1' }, studentId: 'u1',
    assignment: { id: 'a1', ai_grading_enabled: true, content_version: 1, essay_model_answer: 'A', essay_rubric: [] },
  });
  await grading.enqueue({
    submission: { id: 's2', delivery_id: 'd1', user_id: 'u1' }, studentId: 'u1',
    assignment: { id: 'a2', ai_grading_enabled: true, content_version: 1, essay_model_answer: 'A', essay_rubric: rubric },
  });
  const jobs = inserts.filter((item) => item.table === 'essay_grading_jobs').map((item) => item.payload);
  assert.equal(jobs[0].grading_method, 'percentage_v2');
  assert.equal(jobs[0].prompt_version, 'essay-percentage-v2');
  assert.deepEqual(jobs[0].rubric_snapshot, []);
  assert.equal(jobs[1].grading_method, 'rubric_v1');
  assert.equal(jobs[1].prompt_version, 'essay-grading-v1');
});

test('saves a percentage review without rubric criteria', async () => {
  let reportPatch;
  const db = {
    from(table) {
      let mode = 'select';
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        limit: () => builder,
        update(patch) { mode = 'update'; reportPatch = patch; return builder; },
        maybeSingle: async () => {
          if (table === 'submissions') return { data: { id: 's1', max_score: 10, assignment_deliveries: { teacher_id: 't1', assignment_id: 'a1' } }, error: null };
          if (table === 'essay_grading_jobs') return { data: { id: 'j1', assignment_id: 'a1', grading_method: 'percentage_v2', rubric_snapshot: [] }, error: null };
          if (table === 'essay_grading_reports' && mode === 'select') return { data: { id: 'r1', source: 'ai', ai_correctness_percentage: 80 }, error: null };
          if (table === 'essay_grading_reports' && mode === 'update') return { data: { id: 'r1', ...reportPatch }, error: null };
          return { data: null, error: null };
        },
        insert: async () => ({ error: null }),
      };
      return builder;
    },
  };
  const report = await createEssayGradingService(db).saveReview({
    teacherId: 't1', submissionId: 's1', correctnessPercentage: 83,
    feedback: 'Đã kiểm tra.', approved: true,
  });
  assert.equal(report.reviewed_correctness_percentage, 83);
  assert.equal(report.reviewed_score, 8.3);
  assert.equal(report.reviewed_criteria_results, undefined);
});

test('manual essay grading creates an approved but unpublished review', async () => {
  const inserts = [];
  const db = {
    from(table) {
      if (table === 'essay_grading_events') {
        return { insert: async (payload) => { inserts.push({ table, payload }); return { error: null }; } };
      }
      const builder = {
        insert(payload) { inserts.push({ table, payload }); return builder; },
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
