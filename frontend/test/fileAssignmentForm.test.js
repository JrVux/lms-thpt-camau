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

test('builds enabled AI essay settings without a teacher-authored rubric', () => {
  const payload = buildFileAssignmentPayload({
    submission_type: 'essay', essay_content: 'Đề', max_file_size_mb: 20,
    ai_grading_enabled: true, essay_model_answer: 'Đáp án mẫu',
    essay_rubric: [{ id: 'c1', title: 'Ý chính', description: 'Nêu đủ', max_points: 10, acceptance_notes: 'Diễn đạt tương đương' }],
    show_model_answer_after_publish: true,
  });
  assert.equal(payload.ai_grading_enabled, true);
  assert.equal(payload.essay_model_answer, 'Đáp án mẫu');
  assert.deepEqual(payload.essay_rubric, []);
  assert.equal(payload.show_model_answer_after_publish, true);
  assert.deepEqual(payload.allowed_mime_types, [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg', 'image/png', 'image/webp',
  ]);
});
