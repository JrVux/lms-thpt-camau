import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSelectedFile, fileAssignmentStatus, sortFileDeliveries, previewKind } from '../src/utils/fileSubmission.js';

test('validates MIME and bytes', () => {
  const settings = { allowed_mime_types: ['application/pdf'], max_file_size_mb: 1 };
  assert.equal(validateSelectedFile({ type: 'application/pdf', size: 1024 }, settings), null);
  assert.match(validateSelectedFile({ type: 'text/plain', size: 10 }, settings), /định dạng/i);
  assert.match(validateSelectedFile({ type: 'application/pdf', size: 2 * 1024 * 1024 }, settings), /dung lượng/i);
});

test('derives status and preview type', () => {
  assert.equal(fileAssignmentStatus(null, false), 'pending');
  assert.equal(fileAssignmentStatus({ is_late: true }, false), 'late');
  assert.equal(fileAssignmentStatus({ graded_at: '2026-08-29' }, false), 'graded');
  assert.equal(previewKind('application/pdf'), 'pdf');
});
