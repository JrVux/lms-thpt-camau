import test from 'node:test';
import assert from 'node:assert/strict';
import { createEssayGradingWorker, processEssayJob, safeEssayErrorCode } from '../src/services/essayGradingWorker.js';

test('builds an awaiting-review report without writing a model total', async () => {
  const job = { id: 'j1', submission_id: 's1', rubric_snapshot: [{ id: 'c1', max_points: 4 }], model_answer_snapshot: 'A' };
  const result = await processEssayJob({
    job,
    assignment: { essay_content: 'Đề', max_score: 4 },
    submission: { object_key: 'local://x.jpg', mime_type: 'image/jpeg' },
    fileReader: { read: async () => ({ file: { mimeType: 'image/jpeg', base64: 'AA==' }, extractionMethod: 'gemini_vision' }) },
    gateway: { generate: async () => ({ provider: 'gemini', model: 'g', usage: {}, grade: { score: 3, extracted_text: 'Bài', extraction_quality: 'sufficient', extraction_warnings: [], criteria_results: [], overall_feedback: 'Khá', strengths: [], improvements: [] } }) },
  });
  assert.equal(result.jobStatus, 'awaiting_review');
  assert.equal(result.report.ai_score, 3);
  assert.equal(result.report.extraction_method, 'gemini_vision');
});

test('maps only safe worker error codes', () => {
  assert.equal(safeEssayErrorCode({ code: 'AI_TIMEOUT' }), 'AI_TIMEOUT');
  assert.equal(safeEssayErrorCode(new Error('secret detail')), 'AI_ESSAY_FAILED');
});

test('stops before AI processing when the claimed lease is no longer owned', async () => {
  const updateFilters = [];
  let gatewayCalls = 0;
  let reportWrites = 0;
  const db = {
    rpc: async () => ({
      data: {
        id: 'j1',
        submission_id: 's1',
        assignment_id: 'a1',
        rubric_snapshot: [],
        model_answer_snapshot: 'Đáp án',
        attempt_count: 1,
      },
      error: null,
    }),
    from(table) {
      if (table === 'submissions' || table === 'assignments') {
        const builder = {
          select: () => builder,
          eq: () => builder,
          single: async () => ({
            data: table === 'submissions'
              ? { id: 's1', object_key: 'answers/s1.jpg', mime_type: 'image/jpeg' }
              : { id: 'a1', essay_content: 'Đề bài', max_score: 10 },
            error: null,
          }),
        };
        return builder;
      }
      if (table === 'essay_grading_jobs') {
        const filters = {};
        const builder = {
          update: () => builder,
          eq: (column, value) => {
            filters[column] = value;
            return builder;
          },
          select: () => builder,
          maybeSingle: async () => {
            updateFilters.push({ ...filters });
            return { data: null, error: null };
          },
        };
        return builder;
      }
      if (table === 'essay_grading_reports') {
        return { upsert: async () => { reportWrites += 1; return { error: null }; } };
      }
      if (table === 'essay_grading_events') {
        return { insert: async () => ({ error: null }) };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
  const worker = createEssayGradingWorker({
    db,
    workerId: 'worker-1',
    fileReader: { read: async () => ({}) },
    gateway: { generate: async () => { gatewayCalls += 1; return {}; } },
  });

  const result = await worker.runOnce();

  assert.deepEqual(result, { claimed: true, jobId: 'j1', status: 'lease_lost' });
  assert.deepEqual(updateFilters, [{ id: 'j1', lease_owner: 'worker-1' }]);
  assert.equal(gatewayCalls, 0);
  assert.equal(reportWrites, 0);
});
