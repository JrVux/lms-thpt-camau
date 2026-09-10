import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as fileSubmissionModule from '../src/services/fileSubmissionService.js';

const {
  safeFileSubmission,
  fileRosterStatus,
  singleRelation,
  toExportRows,
  validateSubmissionBuffer,
  studentMayAccessDelivery,
} = fileSubmissionModule;

test('safe projection removes the object key', () => {
  const result = safeFileSubmission({ id: 's1', object_key: 'private/key', file_name: 'a.pdf', score: 8 });
  assert.equal(result.object_key, undefined);
  assert.equal(result.file_name, 'a.pdf');
});

test('normalizes Supabase many-to-one embeds returned as an object or array', () => {
  assert.deepEqual(singleRelation({ id: 'a1' }), { id: 'a1' });
  assert.deepEqual(singleRelation([{ id: 'a1' }]), { id: 'a1' });
  assert.equal(singleRelation([]), null);
});

test('student delivery access requires enrollment and selected-recipient membership', () => {
  assert.equal(studentMayAccessDelivery({ recipient_mode: 'all' }, true, [], 'u1'), true);
  assert.equal(studentMayAccessDelivery({ recipient_mode: 'all' }, false, [], 'u1'), false);
  assert.equal(studentMayAccessDelivery({ recipient_mode: 'selected' }, true, [{ user_id: 'u2' }], 'u1'), false);
  assert.equal(studentMayAccessDelivery({ recipient_mode: 'selected' }, true, [{ user_id: 'u1' }], 'u1'), true);
});

test('AI essays reject disguised files and oversized uploads before persistence', () => {
  const assignment = { ai_grading_enabled: true, allowed_mime_types: ['image/jpeg'], max_file_size_mb: 1 };
  assert.match(validateSubmissionBuffer(Buffer.from('not a jpeg'), 'image/jpeg', assignment), /không khớp/i);
  assert.match(validateSubmissionBuffer(Buffer.alloc(1024 * 1024 + 1), 'image/jpeg', assignment), /dung lượng/i);
  assert.equal(validateSubmissionBuffer(Buffer.from([0xff, 0xd8, 0xff, 0x00]), 'image/jpeg', assignment), null);
});

test('roster distinguishes missing, submitted, late, and graded', () => {
  assert.equal(fileRosterStatus(null), 'missing');
  assert.equal(fileRosterStatus({ is_late: false, graded_at: null }), 'submitted');
  assert.equal(fileRosterStatus({ is_late: true, graded_at: null }), 'late');
  assert.equal(fileRosterStatus({ is_late: false, graded_at: '2026-08-29' }), 'graded');
});

test('export rows omit keys and URLs', () => {
  const [row] = toExportRows([{ student_name: 'An', class_name: '10A', latest: { file_name: 'a.pdf' } }]);
  assert.deepEqual(Object.keys(row), ['Học sinh', 'Lớp', 'Trạng thái', 'Thời gian nộp', 'Nộp trễ', 'Tên file', 'Điểm', 'Nhận xét']);
});

test('persists a submission to R2 before reporting storage success', async () => {
  assert.equal(typeof fileSubmissionModule.persistSubmissionBuffer, 'function');
  const events = [];
  await fileSubmissionModule.persistSubmissionBuffer({
    localPath: 'temporary-local-file.jpg',
    objectKey: 'delivery/student/temporary-local-file.jpg',
    buffer: Buffer.from([0xff, 0xd8, 0xff]),
    mimeType: 'image/jpeg',
    writeFile: async () => events.push('local'),
    removeFile: async () => events.push('cleanup'),
    r2Upload: async () => {
      events.push('r2');
      return true;
    },
  });
  assert.deepEqual(events, ['local', 'r2']);
});

test('removes the temporary local file when durable R2 storage fails', async () => {
  assert.equal(typeof fileSubmissionModule.persistSubmissionBuffer, 'function');
  const events = [];
  await assert.rejects(
    fileSubmissionModule.persistSubmissionBuffer({
      localPath: 'temporary-local-file.jpg',
      objectKey: 'delivery/student/temporary-local-file.jpg',
      buffer: Buffer.from([0xff, 0xd8, 0xff]),
      mimeType: 'image/jpeg',
      writeFile: async () => events.push('local'),
      removeFile: async () => events.push('cleanup'),
      r2Upload: async () => false,
    }),
    (error) => error.code === 'STORAGE_UNAVAILABLE',
  );
  assert.deepEqual(events, ['local', 'cleanup']);
});

test('resolves a private R2 copy when Render local storage no longer has the file', async () => {
  assert.equal(typeof fileSubmissionModule.resolveSubmissionStorage, 'function');
  let requestedKey = '';
  const result = await fileSubmissionModule.resolveSubmissionStorage({
    submission: {
      object_key: 'local://saved.jpg',
      delivery_id: 'delivery-1',
      user_id: 'student-1',
      file_name: 'saved.jpg',
      mime_type: 'image/jpeg',
    },
    uploadsDir: 'Z:\\missing-render-storage',
    fileExists: () => false,
    r2Download: async ({ objectKey }) => {
      requestedKey = objectKey;
      return Buffer.from([0xff, 0xd8, 0xff]);
    },
  });
  assert.equal(requestedKey, 'delivery-1/student-1/saved.jpg');
  assert.equal(result.type, 'buffer');
  assert.deepEqual(result.buffer, Buffer.from([0xff, 0xd8, 0xff]));
});

const queryReturning = (data) => {
  const query = {
    select: () => query,
    eq: () => query,
    not: () => query,
    order: async () => ({ data, error: null }),
    maybeSingle: async () => ({ data, error: null }),
  };
  return query;
};

test('submitStudentFile does not create database metadata when R2 storage fails', async () => {
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-r2-failure-'));
  let rpcCalls = 0;
  let uploadCalls = 0;
  const assignment = {
    id: 'assignment-1',
    submission_type: 'practice_file',
    allowed_mime_types: ['image/jpeg'],
    max_file_size_mb: 1,
    allow_late_submission: true,
    ai_grading_enabled: false,
  };
  const db = {
    from: (table) => {
      if (table === 'assignment_deliveries') return queryReturning({
        id: 'delivery-1',
        class_id: 'class-1',
        recipient_mode: 'all',
        max_submissions: null,
        due_date: null,
        assignment,
      });
      if (table === 'enrollments') return queryReturning({ id: 'enrollment-1' });
      if (table === 'submissions') return queryReturning([]);
      throw new Error(`Unexpected table: ${table}`);
    },
    rpc: async () => {
      rpcCalls += 1;
      return { data: null, error: null };
    },
  };
  const service = fileSubmissionModule.createFileSubmissionService(db, {
    uploadsDir,
    r2Upload: async () => {
      uploadCalls += 1;
      return false;
    },
  });

  try {
    await assert.rejects(
      service.submitStudentFile({
        studentId: 'student-1',
        deliveryId: 'delivery-1',
        fileName: 'answer.jpg',
        mimeType: 'image/jpeg',
        fileSize: 4,
        fileData: `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0x00]).toString('base64')}`,
      }),
      (error) => error.code === 'STORAGE_UNAVAILABLE',
    );
    assert.equal(uploadCalls, 1);
    assert.equal(rpcCalls, 0);
    assert.deepEqual(fs.readdirSync(uploadsDir), []);
  } finally {
    fs.rmSync(uploadsDir, { recursive: true, force: true });
  }
});

test('getSubmissionDownload authorizes before using the private R2 fallback', async () => {
  let downloadCalls = 0;
  const submission = {
    id: 'submission-1',
    user_id: 'student-1',
    delivery_id: 'delivery-1',
    object_key: 'local://saved.jpg',
    file_name: 'saved.jpg',
    mime_type: 'image/jpeg',
    assignment_deliveries: { teacher_id: 'teacher-1' },
  };
  const db = { from: () => queryReturning(submission) };
  const service = fileSubmissionModule.createFileSubmissionService(db, {
    uploadsDir: 'Z:\\missing-render-storage',
    r2Download: async ({ objectKey }) => {
      downloadCalls += 1;
      assert.equal(objectKey, 'delivery-1/student-1/saved.jpg');
      return Buffer.from([0xff, 0xd8, 0xff]);
    },
  });

  await assert.rejects(
    service.getSubmissionDownload({ userId: 'teacher-2', userRole: 'teacher', submissionId: submission.id }),
    (error) => error.code === 'FORBIDDEN',
  );
  assert.equal(downloadCalls, 0);

  const result = await service.getSubmissionDownload({
    userId: 'teacher-1',
    userRole: 'teacher',
    submissionId: submission.id,
  });
  assert.equal(downloadCalls, 1);
  assert.equal(result.type, 'buffer');
  assert.deepEqual(result.buffer, Buffer.from([0xff, 0xd8, 0xff]));
});
