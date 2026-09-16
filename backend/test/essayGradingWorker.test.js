import test from 'node:test';
import assert from 'node:assert/strict';
import { combineExtractedFiles, createEssayGradingWorker, processEssayJob, safeEssayErrorCode } from '../src/services/essayGradingWorker.js';

test('builds an awaiting-review report without writing a model total', async () => {
  const job = { id: 'j1', submission_id: 's1', grading_method: 'percentage_v2', rubric_snapshot: [], model_answer_snapshot: 'A' };
  const grade = {
    score: 8.3, correctness_percentage: 83, extracted_text: 'Bài', extraction_quality: 'sufficient', extraction_warnings: [],
    overall_feedback: 'Khá', correct_content: [{ description: 'Đúng', evidence_snippets: ['Bài'] }],
    missing_or_incorrect_content: [{ description: 'Thiếu', explanation: 'Cần bổ sung' }], contradictions: [],
    strengths: ['Rõ'], improvements: ['Bổ sung'], confidence: 0.8,
  };
  const result = await processEssayJob({
    job,
    assignment: { essay_content: 'Đề', max_score: 10 },
    submission: { object_key: 'local://x.jpg', mime_type: 'image/jpeg' },
    fileReader: { read: async () => ({ file: { mimeType: 'image/jpeg', base64: 'AA==' }, extractionMethod: 'gemini_vision' }) },
    gateway: { generate: async () => ({ provider: 'gemini', model: 'g', usage: {}, grade }) },
  });
  assert.equal(result.jobStatus, 'awaiting_review');
  assert.equal(result.report.grading_method, 'percentage_v2');
  assert.equal(result.report.ai_score, 8.3);
  assert.equal(result.report.ai_correctness_percentage, 83);
  assert.deepEqual(result.report.ai_content_analysis.correct_content, grade.correct_content);
  assert.equal(result.report.extraction_method, 'gemini_vision');
});

test('maps only safe worker error codes', () => {
  assert.equal(safeEssayErrorCode({ code: 'AI_TIMEOUT' }), 'AI_TIMEOUT');
  assert.equal(safeEssayErrorCode({ code: 'AI_RATE_LIMITED' }), 'AI_RATE_LIMITED');
  assert.equal(safeEssayErrorCode(new Error('secret detail')), 'AI_ESSAY_FAILED');
});

test('rate limiting requeues a job without consuming its retry budget', async () => {
  const nowValue = 1_700_000_000_000;
  const jobPatches = [];
  const events = [];
  const db = {
    rpc: async () => ({
      data: {
        id: 'j1',
        submission_id: 's1',
        assignment_id: 'a1',
        rubric_snapshot: [],
        model_answer_snapshot: 'Đáp án',
        attempt_count: 3,
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
              ? { id: 's1', object_key: 'answers/s1.txt', mime_type: 'text/plain' }
              : { id: 'a1', essay_content: 'Đề bài', max_score: 10 },
            error: null,
          }),
        };
        return builder;
      }
      if (table === 'essay_grading_jobs') {
        let patch;
        const builder = {
          update: (value) => { patch = value; return builder; },
          eq: () => builder,
          select: () => builder,
          maybeSingle: async () => {
            jobPatches.push(patch);
            return { data: { id: 'j1' }, error: null };
          },
        };
        return builder;
      }
      if (table === 'essay_grading_reports') {
        return { upsert: async () => { throw new Error('report must not be written'); } };
      }
      if (table === 'essay_grading_events') {
        return { insert: async (event) => { events.push(event); return { error: null }; } };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
  const rateLimited = new Error('quota');
  rateLimited.code = 'AI_RATE_LIMITED';
  rateLimited.retryAfterMs = 43_000;
  const worker = createEssayGradingWorker({
    db,
    workerId: 'worker-1',
    now: () => nowValue,
    fileReader: { read: async () => ({ extractedText: 'Bài', extractionMethod: 'text' }) },
    gateway: { generate: async () => { throw rateLimited; } },
  });

  const result = await worker.runOnce();
  const finalPatch = jobPatches.at(-1);

  assert.equal(finalPatch.status, 'queued');
  assert.equal(finalPatch.error_code, 'AI_RATE_LIMITED');
  assert.equal(finalPatch.attempt_count, 2);
  assert.equal(finalPatch.next_attempt_at, new Date(nowValue + 43_000).toISOString());
  assert.equal(result.retrying, true);
  assert.deepEqual(events, [{ job_id: 'j1', event_type: 'retry_scheduled', metadata: { error_code: 'AI_RATE_LIMITED' } }]);
});

test('worker scheduler waits for the current tick before scheduling another', async () => {
  const timers = [];
  const cleared = [];
  let resolveClaim;
  const claim = new Promise((resolve) => { resolveClaim = resolve; });
  const worker = createEssayGradingWorker({
    db: { rpc: async () => claim },
    fileReader: {},
    gateway: {},
  });
  const setTimer = (callback, ms) => {
    const timer = { callback, ms, unref() {} };
    timers.push(timer);
    return timer;
  };
  const clearTimer = (timer) => { cleared.push(timer); };

  const stop = worker.start({ intervalMs: 5000, setTimer, clearTimer });
  assert.equal(timers.length, 1);
  const firstTick = timers.shift();
  const pending = firstTick.callback();
  assert.equal(timers.length, 0);

  resolveClaim({ data: null, error: null });
  await pending;
  assert.equal(timers.length, 1);

  stop();
  assert.deepEqual(cleared, [timers[0]]);
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

test('extracts vision files sequentially and grades the combined bundle once', async () => {
  const calls = [];
  const grade = {
    score: 8, correctness_percentage: 80, extracted_text: 'Một\nHai', extraction_quality: 'sufficient', extraction_warnings: [],
    overall_feedback: 'Khá', correct_content: [], missing_or_incorrect_content: [], contradictions: [], strengths: [], improvements: [], confidence: 0.8,
  };
  const result = await processEssayJob({
    job: { id: 'j1', submission_id: 's1', grading_method: 'percentage_v2', rubric_snapshot: [], model_answer_snapshot: 'Đáp án' },
    assignment: { essay_content: 'Đề', max_score: 10 },
    submission: { id: 's1' },
    files: [{ file_name: '1.docx', sort_order: 0 }, { file_name: '2.jpg', sort_order: 1 }],
    fileReader: {
      readMany: async () => [
        { fileName: '1.docx', sortOrder: 0, extractedText: 'Một', extractionMethod: 'docx_text', warnings: [] },
        { fileName: '2.jpg', sortOrder: 1, file: { mimeType: 'image/jpeg', base64: 'AA==' }, extractionMethod: 'gemini_vision', warnings: [] },
      ],
    },
    gateway: {
      extractFile: async ({ fileName }) => { calls.push(`extract:${fileName}`); return { extractedText: 'Hai', quality: 'sufficient', warnings: [] }; },
      generate: async ({ extractedText }) => { calls.push(`grade:${extractedText}`); return { provider: 'gemini', model: 'g', usage: {}, grade }; },
    },
  });
  assert.equal(calls[0], 'extract:2.jpg');
  assert.match(calls[1], /^grade:<submission_file index="1" name="1\.docx">/);
  assert.match(calls[1], /<submission_file index="2" name="2\.jpg">\nHai/);
  assert.equal(calls.length, 2);
  assert.equal(result.report.extraction_method, 'multi_file');
});

test('combined extraction fails safely when every file is unreadable or total text is too long', () => {
  assert.throws(() => combineExtractedFiles([{ fileName: 'blur.jpg', extractedText: '' }], 100), (error) => error.code === 'FILE_NOT_AVAILABLE');
  assert.throws(() => combineExtractedFiles([{ fileName: 'long.pdf', extractedText: 'x'.repeat(101) }], 100), (error) => error.code === 'AI_ESSAY_INVALID');
});
