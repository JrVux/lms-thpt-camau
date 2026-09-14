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

test('cleanup removes pending rows in case storage succeeded before metadata was marked uploaded', async () => {
  let selectedStatuses = [];
  const deletedObjects = [];
  const removedPaths = [];
  const fileUpdates = [];
  const db = {
    from(table) {
      if (table === 'submission_upload_sessions') {
        return {
          update: () => ({
            eq: () => ({
              neq: () => ({
                select: () => ({ maybeSingle: async () => ({ data: { id: 'session-1' }, error: null }) }),
              }),
            }),
          }),
        };
      }
      if (table === 'submission_upload_session_files') {
        return {
          select: () => ({
            eq: () => ({
              in: async (_column, statuses) => {
                selectedStatuses = statuses;
                return {
                  data: statuses.includes('pending') ? [{
                    id: 'file-pending',
                    status: 'pending',
                    object_key: 'local://tmp/session-1/file-pending.jpg',
                  }] : [],
                  error: null,
                };
              },
            }),
          }),
          update: (patch) => ({
            eq: async (_column, id) => {
              fileUpdates.push({ id, patch });
              return { error: null };
            },
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
  const worker = createSubmissionUploadCleanupWorker({
    db,
    uploadsDir: 'C:/safe/uploads',
    removeFile: async (filePath) => { removedPaths.push(filePath); },
    r2Delete: async ({ objectKey }) => { deletedObjects.push(objectKey); return true; },
  });

  const cleaned = await worker.cleanupSession({
    id: 'session-1',
    status: 'cleanup_pending',
    cleanup_reason: 'upload_failed',
    delivery_id: 'delivery-1',
    user_id: 'student-1',
  });

  assert.equal(cleaned, true);
  assert.deepEqual(selectedStatuses, ['pending', 'uploaded', 'cleanup_pending']);
  assert.equal(removedPaths.length, 1);
  assert.deepEqual(deletedObjects, ['delivery-1/student-1/tmp/session-1/file-pending.jpg']);
  assert.equal(fileUpdates.at(-1)?.patch.status, 'cleaned');
});

test('cleanup stops when a stale candidate was confirmed before the cleanup claim', async () => {
  let touchedFiles = false;
  const db = {
    from(table) {
      if (table === 'submission_upload_sessions') {
        return {
          update: () => ({
            eq: () => ({
              neq: () => ({
                select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
              }),
            }),
          }),
        };
      }
      touchedFiles = true;
      throw new Error(`Cleanup must not access ${table}`);
    },
  };
  const worker = createSubmissionUploadCleanupWorker({
    db,
    r2Delete: async () => { throw new Error('must not delete'); },
    removeFile: async () => { throw new Error('must not delete'); },
  });

  const cleaned = await worker.cleanupSession({
    id: 'session-race',
    status: 'uploading',
    expires_at: '2000-01-01T00:00:00Z',
    delivery_id: 'delivery-1',
    user_id: 'student-1',
  });

  assert.equal(cleaned, false);
  assert.equal(touchedFiles, false);
});
