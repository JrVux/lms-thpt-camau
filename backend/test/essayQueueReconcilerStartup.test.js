import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('backend starts the queue reconciler behind explicit configuration', async () => {
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  const render = await readFile(new URL('../../render.yaml', import.meta.url), 'utf8');

  assert.match(app, /startEssayQueueReconciler/);
  assert.match(app, /AI_ESSAY_QUEUE_RECONCILER_ENABLED\s*===\s*'false'/);
  assert.match(app, /!process\.env\.GEMINI_API_KEY/);
  assert.match(app, /createEssayQueueReconciler/);
  assert.match(app, /AI_ESSAY_QUEUE_RECONCILER_POLL_MS/);
  assert.match(app, /GEMINI_ESSAY_MIN_REQUEST_INTERVAL_MS/);
  assert.match(render, /key:\s*AI_ESSAY_QUEUE_RECONCILER_ENABLED[\s\S]*value:\s*"false"/);
  assert.match(render, /key:\s*AI_ESSAY_QUEUE_RECONCILER_POLL_MS[\s\S]*value:\s*"30000"/);
  assert.match(render, /key:\s*GEMINI_ESSAY_MIN_REQUEST_INTERVAL_MS[\s\S]*value:\s*"4000"/);
});
