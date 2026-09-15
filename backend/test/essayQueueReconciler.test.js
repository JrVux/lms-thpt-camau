import test from 'node:test';
import assert from 'node:assert/strict';
import { createEssayQueueReconciler } from '../src/services/essayQueueReconciler.js';

const reconciliationDb = ({ ids, assignmentOverrides = {} }) => ({
  rpc: async () => ({ data: ids.map((submission_id) => ({ submission_id })), error: null }),
  from(table) {
    let selectedId;
    const query = {
      select: () => query,
      eq(field, value) {
        if (field === 'id') selectedId = value;
        return query;
      },
      maybeSingle: async () => table === 'submissions'
        ? ({
            data: {
              id: selectedId,
              assignment_id: `a-${selectedId}`,
              delivery_id: 'd1',
              user_id: 'u1',
              object_key: 'local://answer.jpg',
              is_latest: true,
            },
            error: null,
          })
        : ({
            data: {
              id: selectedId,
              submission_type: 'essay',
              ai_grading_enabled: true,
              content_version: 1,
              essay_model_answer: 'A',
              essay_rubric: [],
              ...assignmentOverrides,
            },
            error: null,
          }),
    };
    return query;
  },
});

test('reconciler queues each eligible missing submission sequentially', async () => {
  const calls = [];
  const worker = createEssayQueueReconciler({
    db: reconciliationDb({ ids: ['s1', 's2'] }),
    ensureQueued: async ({ submission }) => {
      calls.push(submission.id);
      return { job: { id: `j-${submission.id}` }, created: true };
    },
    reportQueueError: () => {},
  });

  assert.deepEqual(await worker.runOnce(), { scanned: 2, queued: 2, existing: 0, failed: 0 });
  assert.deepEqual(calls, ['s1', 's2']);
});

test('reconciler continues after one item fails', async () => {
  const reports = [];
  const worker = createEssayQueueReconciler({
    db: reconciliationDb({ ids: ['s1', 's2'] }),
    ensureQueued: async ({ submission }) => {
      if (submission.id === 's1') throw new Error('temporary database failure');
      return { job: { id: 'j2' }, created: false };
    },
    reportQueueError: (context) => reports.push(context),
  });

  assert.deepEqual(await worker.runOnce(), { scanned: 2, queued: 0, existing: 1, failed: 1 });
  assert.equal(reports.length, 1);
  assert.equal(reports[0].submissionId, 's1');
});

test('reconciler skips a submission that is no longer eligible', async () => {
  let ensureCalls = 0;
  const worker = createEssayQueueReconciler({
    db: reconciliationDb({ ids: ['s1'], assignmentOverrides: { ai_grading_enabled: false } }),
    ensureQueued: async () => {
      ensureCalls += 1;
      return { job: null, created: false };
    },
    reportQueueError: () => {},
  });

  assert.deepEqual(await worker.runOnce(), { scanned: 1, queued: 0, existing: 1, failed: 0 });
  assert.equal(ensureCalls, 0);
});

test('reconciler surfaces a selector failure without processing submissions', async () => {
  const db = reconciliationDb({ ids: [] });
  db.rpc = async () => ({ data: null, error: { message: 'selector unavailable' } });
  const worker = createEssayQueueReconciler({ db, ensureQueued: async () => null, reportQueueError: () => {} });

  await assert.rejects(() => worker.runOnce(), /selector unavailable/i);
});

test('reconciler start returns a cleanup function', () => {
  const worker = createEssayQueueReconciler({
    db: reconciliationDb({ ids: [] }),
    ensureQueued: async () => ({ job: null, created: false }),
    reportQueueError: () => {},
  });
  const stop = worker.start({ intervalMs: 60000 });
  assert.equal(typeof stop, 'function');
  stop();
});
