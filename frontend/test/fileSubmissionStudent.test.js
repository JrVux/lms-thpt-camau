import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { studentFileCard } from '../src/utils/fileSubmission.js';

test('file card uses file route and graded copy', () => {
  const card = studentFileCard({ id: 'd1', assignment_status: 'graded', assignments: { submission_type: 'essay' }, submissions: [{ score: 8, max_score: 10 }] });
  assert.equal(card.href, '/deliveries/d1/file-submission');
  assert.equal(card.badge, 'Tự luận');
  assert.match(card.status, /8\/10/);
});

test('published percentage result explains the approved score', async () => {
  const source = await readFile(new URL('../src/components/EssayPublishedResult.jsx', import.meta.url), 'utf8');
  assert.match(source, /correctness_percentage/);
  assert.match(source, /Nội dung làm đúng/i);
  assert.match(source, /Nội dung thiếu hoặc sai/i);
  assert.match(source, /Hướng cải thiện/i);
  assert.match(source, /model_answer/);
});

test('student essay page uses bundle upload and renders child file history', async () => {
  const source = await readFile(new URL('../src/pages/FileSubmissionDetail.jsx', import.meta.url), 'utf8');
  assert.match(source, /submitFileBundle/);
  assert.match(source, /selectedFiles/);
  assert.match(source, /item\.files/);
  assert.match(source, /files\/\$\{file\.id\}\/download/);
});

test('student assignment list does not depend on private object keys', async () => {
  const source = await readFile(new URL('../src/pages/MyAssignments.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /object_key/);
});
