import test from 'node:test';
import assert from 'node:assert/strict';
import { processEssayJob, safeEssayErrorCode } from '../src/services/essayGradingWorker.js';

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
