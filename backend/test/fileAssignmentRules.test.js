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

test('normalizes AI essay settings and limits AI MIME types', () => {
  const normalized = normalizeFileAssignment({
    submission_type: 'essay', essay_content: 'Đề', max_score: 10,
    ai_grading_enabled: true, essay_model_answer: 'Đáp án',
    essay_rubric: [{ id: 'y1', title: 'Ý 1', description: 'Mô tả', max_points: 10 }],
    allowed_mime_types: ['application/pdf', 'application/msword', 'image/jpeg'],
    show_model_answer_after_publish: true,
  });
  assert.deepEqual(normalized.allowed_mime_types, ['application/pdf', 'image/jpeg']);
  assert.equal(normalized.ai_grading_enabled, true);
  assert.equal(normalized.show_model_answer_after_publish, true);
});
