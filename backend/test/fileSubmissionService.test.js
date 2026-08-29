import test from 'node:test';
import assert from 'node:assert/strict';
import { safeFileSubmission, fileRosterStatus, toExportRows } from '../src/services/fileSubmissionService.js';

test('safe projection removes the object key', () => {
  const result = safeFileSubmission({ id: 's1', object_key: 'private/key', file_name: 'a.pdf', score: 8 });
  assert.equal(result.object_key, undefined);
  assert.equal(result.file_name, 'a.pdf');
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
