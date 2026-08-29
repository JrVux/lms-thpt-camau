import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFileAssignment, validateFileAssignment } from '../src/services/fileAssignmentRules.js';

test('normalizes supported file settings', () => {
  assert.deepEqual(normalizeFileAssignment({
    submission_type: 'essay', essay_content: '  **Đề bài**  ',
    allowed_mime_types: ['application/pdf', 'image/jpeg', 'application/pdf'],
    max_file_size_mb: '25', allow_late_submission: true,
  }), {
    submission_type: 'essay', essay_content: '**Đề bài**',
    allowed_mime_types: ['application/pdf', 'image/jpeg'],
    max_file_size_mb: 25, allow_late_submission: true,
  });
});

test('requires content for essay and rejects unsupported MIME', () => {
  assert.match(validateFileAssignment({ submission_type: 'essay', essay_content: '' }), /đề bài/i);
  assert.match(validateFileAssignment({ submission_type: 'practice_file', allowed_mime_types: ['text/plain'] }), /định dạng/i);
  assert.equal(validateFileAssignment({ submission_type: 'autograde' }), null);
});
