import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const paths = [
  new URL('../src/database/migrations/017_multi_file_essay_submissions.sql', import.meta.url),
  new URL('../../supabase/migrations/022_multi_file_essay_submissions.sql', import.meta.url),
];

test('multi-file migrations are identical, additive and private', async () => {
  const [backendSql, supabaseSql] = await Promise.all(paths.map((url) => readFile(url, 'utf8')));
  assert.equal(backendSql, supabaseSql);
  assert.doesNotMatch(backendSql, /DROP\s+(TABLE|COLUMN)/i);
  for (const name of ['submission_files', 'submission_upload_sessions', 'submission_upload_session_files']) {
    assert.match(backendSql, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${name}`, 'i'));
    assert.match(backendSql, new RegExp(`ALTER TABLE public\\.${name} ENABLE ROW LEVEL SECURITY`, 'i'));
    assert.match(backendSql, new RegExp(`REVOKE ALL ON TABLE public\\.${name} FROM anon, authenticated`, 'i'));
  }
  assert.match(backendSql, /sort_order BETWEEN 0 AND 4/i);
  assert.match(backendSql, /expected_file_count BETWEEN 1 AND 5/i);
  assert.match(backendSql, /confirm_multi_file_submission/i);
  assert.match(backendSql, /pg_advisory_xact_lock/i);
  assert.match(backendSql, /confirmed_submission_id/i);
});
