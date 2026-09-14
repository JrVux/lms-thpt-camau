import test from 'node:test';
import assert from 'node:assert/strict';
import { createSubmissionUploadCleanupWorker } from '../src/services/submissionUploadCleanupWorker.js';

test('cleanup processes candidates only and never receives a confirmed session', async () => {
  const cleaned = [];
  const worker = createSubmissionUploadCleanupWorker({
    db: {},
    listCandidates: async () => [{ id: 'expired', status: 'uploading', expires_at: '2026-09-13T00:00:00Z' }],
    cleanupSession: async (session) => cleaned.push(session.id),
    now: () => Date.parse('2026-09-14T00:00:00Z'),
  });

  const result = await worker.runOnce();

  assert.deepEqual(cleaned, ['expired']);
  assert.deepEqual(result, { processed: 1, cleaned: 1, pending: 0 });
});

test('cleanup reports retryable failures without throwing away remaining candidates', async () => {
  const worker = createSubmissionUploadCleanupWorker({
    db: {},
    listCandidates: async () => [{ id: 'one' }, { id: 'two' }],
    cleanupSession: async (session) => session.id === 'one',
  });

  assert.deepEqual(await worker.runOnce(), { processed: 2, cleaned: 1, pending: 1 });
});
