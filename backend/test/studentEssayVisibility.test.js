import test from 'node:test';
import assert from 'node:assert/strict';
import { redactEssayDelivery } from '../src/services/studentAssignmentService.js';

test('student delivery never exposes rubric/model answer or unpublished essay grades', () => {
  const delivery = {
    assignments: { id: 'a1', ai_grading_enabled: true, essay_model_answer: 'secret', essay_rubric: [{ id: 'c1' }] },
    submissions: [{ id: 's1', score: 10, feedback: 'draft', graded_at: 'now' }],
  };
  const hidden = redactEssayDelivery(delivery, new Map());
  assert.equal(hidden.assignments.essay_model_answer, undefined);
  assert.equal(hidden.assignments.essay_rubric, undefined);
  assert.equal(hidden.submissions[0].score, undefined);
  assert.equal(hidden.submissions[0].published_result, null);
  assert.equal(JSON.stringify(hidden).includes('correctness_percentage'), false);
  assert.equal(JSON.stringify(hidden).includes('ai_content_analysis'), false);
  assert.equal(JSON.stringify(hidden).includes('extracted_text'), false);
});

test('practice file delivery never exposes a private object key', () => {
  const delivery = {
    assignments: { id: 'a1', submission_type: 'practice_file' },
    submissions: [{ id: 's1', object_key: 'local://private/key.pdf', file_name: 'answer.pdf' }],
  };
  const hidden = redactEssayDelivery(delivery, new Map());
  assert.equal(hidden.submissions[0].object_key, undefined);
  assert.equal(hidden.submissions[0].file_name, 'answer.pdf');
});
