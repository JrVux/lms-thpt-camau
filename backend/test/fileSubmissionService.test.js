import test from 'node:test';
import assert from 'node:assert/strict';
import { safeFileSubmission, fileRosterStatus, toExportRows, validateSubmissionBuffer, studentMayAccessDelivery } from '../src/services/fileSubmissionService.js';

test('safe projection removes the object key', () => {
  const result = safeFileSubmission({ id: 's1', object_key: 'private/key', file_name: 'a.pdf', score: 8 });
  assert.equal(result.object_key, undefined);
  assert.equal(result.file_name, 'a.pdf');
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
