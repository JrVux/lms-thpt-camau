import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const paths = [
  new URL('../src/database/migrations/018_automatic_essay_queue_repair.sql', import.meta.url),
  new URL('../../supabase/migrations/023_automatic_essay_queue_repair.sql', import.meta.url),
];

test('queue repair migrations are identical, bounded and service-role-only', async () => {
  const [backendSql, supabaseSql] = await Promise.all(paths.map((url) => readFile(url, 'utf8')));
  assert.equal(backendSql, supabaseSql);
  assert.match(backendSql, /list_missing_essay_grading_submissions/i);
  assert.match(backendSql, /submission_type\s*=\s*'essay'/i);
  assert.match(backendSql, /ai_grading_enabled\s*=\s*TRUE/i);
  assert.match(backendSql, /is_latest\s*=\s*TRUE/i);
  assert.match(backendSql, /NOT EXISTS[\s\S]*essay_grading_jobs/i);
  assert.match(backendSql, /LEAST[\s\S]*100/i);
  assert.match(backendSql, /REVOKE ALL[\s\S]*PUBLIC, anon, authenticated/i);
  assert.match(backendSql, /GRANT EXECUTE[\s\S]*service_role/i);
  assert.doesNotMatch(backendSql, /DROP\s+(TABLE|COLUMN)/i);
});
