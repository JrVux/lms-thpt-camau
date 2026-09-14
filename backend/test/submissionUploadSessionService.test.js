import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSubmissionUploadSessionService,
  validateUploadMetadata,
} from '../src/services/submissionUploadSessionService.js';

const essayDetail = {
  delivery: { id: 'd1', due_date: null, max_submissions: 3 },
  assignment: {
    id: 'a1', submission_type: 'essay', max_score: 10,
    ai_grading_enabled: true, allowed_mime_types: ['image/jpeg'], max_file_size_mb: 1,
  },
};

test('upload metadata accepts one to five unique files and rejects invalid bundles', () => {
  const assignment = essayDetail.assignment;
  assert.equal(validateUploadMetadata([{ name: 'a.jpg', type: 'image/jpeg', size: 4 }], assignment).length, 1);
  assert.throws(() => validateUploadMetadata([], assignment), /từ 1 đến 5/i);
  assert.throws(() => validateUploadMetadata(Array.from({ length: 6 }, (_, index) => ({ name: `${index}.jpg`, type: 'image/jpeg', size: 4 })), assignment), /từ 1 đến 5/i);
  assert.throws(() => validateUploadMetadata([{ name: 'A.jpg', type: 'image/jpeg', size: 4 }, { name: 'a.JPG', type: 'image/jpeg', size: 4 }], assignment), /trùng/i);
  assert.throws(() => validateUploadMetadata([{ name: 'a.pdf', type: 'application/pdf', size: 4 }], assignment), /định dạng/i);
});

test('confirm queues one AI job and returns the same submission when retried', async () => {
  let rpcCalls = 0;
  let enqueueCalls = 0;
  const service = createSubmissionUploadSessionService({}, {
    getStudentDelivery: async () => essayDetail,
    loadOwnedSession: async () => ({ id: 'session-1', user_id: 'u1', delivery_id: 'd1', status: 'uploading' }),
    confirmRpc: async () => ({ submission: { id: 'submission-1' }, created: rpcCalls++ === 0 }),
    enqueue: async () => { enqueueCalls += 1; },
  });

  const first = await service.confirmSession({ studentId: 'u1', sessionId: 'session-1' });
  const second = await service.confirmSession({ studentId: 'u1', sessionId: 'session-1' });

  assert.equal(first.submission.id, 'submission-1');
  assert.equal(second.submission.id, 'submission-1');
  assert.equal(enqueueCalls, 1);
});

test('an invalid upload cancels the whole session before confirmation', async () => {
  const invalid = Buffer.from('not-an-image');
  let cleanupReason = '';
  let persisted = 0;
  const service = createSubmissionUploadSessionService({}, {
    getStudentDelivery: async () => essayDetail,
    loadOwnedSession: async () => ({ id: 'session-1', user_id: 'u1', delivery_id: 'd1', status: 'uploading', expires_at: '2099-01-01T00:00:00Z' }),
    loadSessionFile: async () => ({ id: 'file-1', session_id: 'session-1', status: 'pending', mime_type: 'image/jpeg', declared_size: invalid.length, object_key: 'local://tmp/session-1/file-1.jpg' }),
    persistBuffer: async () => { persisted += 1; },
    cleanupSession: async (_session, reason) => { cleanupReason = reason; },
  });

  await assert.rejects(
    service.uploadSessionFile({ studentId: 'u1', sessionId: 'session-1', fileId: 'file-1', buffer: invalid, declaredMimeType: 'image/jpeg', declaredSize: invalid.length }),
    (error) => error.code === 'BAD_REQUEST',
  );
  assert.equal(persisted, 0);
  assert.equal(cleanupReason, 'upload_failed');
});

test('wrong session owner is rejected before storage access', async () => {
  const service = createSubmissionUploadSessionService({}, {
    getStudentDelivery: async () => essayDetail,
    loadOwnedSession: async () => {
      const error = new Error('Bạn không có quyền sử dụng phiên upload này.');
      error.code = 'FORBIDDEN';
      throw error;
    },
  });
  await assert.rejects(
    service.uploadSessionFile({ studentId: 'other', sessionId: 'session-1', fileId: 'file-1', buffer: Buffer.alloc(1), declaredMimeType: 'image/jpeg', declaredSize: 1 }),
    (error) => error.code === 'FORBIDDEN',
  );
});

test('session creation stops before database writes when attempt limit is reached', async () => {
  let writes = 0;
  const service = createSubmissionUploadSessionService({
    from: () => { writes += 1; throw new Error('must not write'); },
  }, {
    getStudentDelivery: async () => ({
      ...essayDetail,
      delivery: { ...essayDetail.delivery, max_submissions: 1 },
      history: [{ id: 'existing-submission' }],
    }),
  });

  await assert.rejects(
    service.createSession({ studentId: 'u1', deliveryId: 'd1', files: [{ name: 'a.jpg', type: 'image/jpeg', size: 4 }] }),
    (error) => error.code === 'MAX_SUBMISSIONS_EXCEEDED',
  );
  assert.equal(writes, 0);
});

test('AI enqueue reloads the private model answer after student-safe authorization', async () => {
  let queuedAssignment = null;
  const service = createSubmissionUploadSessionService({}, {
    getStudentDelivery: async () => essayDetail,
    loadOwnedSession: async () => ({ id: 'session-1', user_id: 'u1', delivery_id: 'd1', status: 'uploading' }),
    confirmRpc: async () => ({ submission: { id: 'submission-1' }, created: true }),
    loadAssignment: async () => ({ ...essayDetail.assignment, essay_model_answer: 'Đáp án bí mật', essay_rubric: [] }),
    enqueue: async ({ assignment }) => { queuedAssignment = assignment; },
  });

  await service.confirmSession({ studentId: 'u1', sessionId: 'session-1' });

  assert.equal(queuedAssignment.essay_model_answer, 'Đáp án bí mật');
});
