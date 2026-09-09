import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('registers teacher-only essay grading review, retry and publication routes', async () => {
  const source = await readFile(new URL('../src/routes/index.js', import.meta.url), 'utf8');
  for (const route of [
    '/api/file-submissions/:submissionId/ai-grading',
    '/api/file-submissions/:submissionId/ai-grading/retry',
    '/api/assignment-library/:assignmentId/essay-results/publish',
  ]) assert.match(source, new RegExp(route.replace(/[/:]/g, '\\$&')));
  assert.match(source, /requireRole\('teacher'\).*reviewEssayGrading/);
});

test('starts the dedicated Gemini essay worker behind its feature flag', async () => {
  const source = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(source, /AI_ESSAY_GRADING_WORKER_ENABLED/);
  assert.match(source, /createEssayGradingWorker/);
  assert.match(source, /createSubmissionFileReader/);
  assert.match(source, /createGeminiEssayProvider/);
});
