import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFileAssignmentPayload } from '../src/utils/fileSubmission.js';

test('builds essay settings without code fields', () => {
  const payload = buildFileAssignmentPayload({
    submission_type: 'essay', essay_content: '# Đề', allowed_mime_types: ['application/pdf'],
    max_file_size_mb: '25', allow_late_submission: true,
  });
  assert.deepEqual(payload, {
    submission_type: 'essay', essay_content: '# Đề', allowed_mime_types: ['application/pdf'],
    max_file_size_mb: 25, allow_late_submission: true,
  });
});
