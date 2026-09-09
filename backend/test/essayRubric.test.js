import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEssayRubric, validateEssayAiSettings } from '../src/services/essayRubric.js';

const valid = [{ id: 'core-1', title: 'Khái niệm', description: 'Nêu đúng khái niệm', max_points: 4, acceptance_notes: 'Chấp nhận diễn đạt tương đương' }];

test('normalizes a stable weighted rubric', () => {
  assert.deepEqual(normalizeEssayRubric(valid), valid);
  assert.equal(validateEssayAiSettings({ submission_type: 'essay', ai_grading_enabled: true, essay_model_answer: 'Đáp án', essay_rubric: valid }, 4), null);
});

test('rejects missing answer and duplicate ids', () => {
  assert.match(validateEssayAiSettings({ submission_type: 'essay', ai_grading_enabled: true, essay_model_answer: '', essay_rubric: valid }, 4), /đáp án mẫu/i);
  assert.match(validateEssayAiSettings({ submission_type: 'essay', ai_grading_enabled: true, essay_model_answer: 'A', essay_rubric: [valid[0], valid[0]] }, 8), /không được trùng/i);
});

test('rejects non-positive weights and wrong total', () => {
  assert.match(validateEssayAiSettings({ submission_type: 'essay', ai_grading_enabled: true, essay_model_answer: 'A', essay_rubric: [{ ...valid[0], max_points: 0 }] }, 4), /lớn hơn 0/i);
  assert.match(validateEssayAiSettings({ submission_type: 'essay', ai_grading_enabled: true, essay_model_answer: 'A', essay_rubric: valid }, 10), /bằng tổng điểm/i);
});

test('rejects AI grading outside essay assignments', () => {
  assert.match(validateEssayAiSettings({ submission_type: 'practice_file', ai_grading_enabled: true, essay_model_answer: 'A', essay_rubric: valid }, 4), /chỉ bài tự luận/i);
});
