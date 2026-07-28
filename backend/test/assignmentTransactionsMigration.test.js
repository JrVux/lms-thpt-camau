import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL(
  '../src/database/migrations/005_assignment_transactions.sql',
  import.meta.url
);
const securityMigrationUrl = new URL(
  '../src/database/migrations/006_lock_assignment_rpcs.sql',
  import.meta.url
);

test('transaction migration is independently deployable and hardened', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  for (const routine of [
    'replace_assignment_tests',
    'update_assignment_content',
    'create_submission_with_results',
    'complete_submission_regrade',
  ]) {
    assert.match(sql, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${routine}`));
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${routine}`));
    assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${routine}`));
  }
  assert.doesNotMatch(sql, /SET search_path = public/);
  assert.match(sql, /SET search_path = pg_catalog/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /assignment\.content_version <> p_content_version/);
  assert.match(sql, /public\.assignment_recipients/);
  assert.match(sql, /public\.enrollments/);
});

test('security migration explicitly blocks public API roles', async () => {
  const sql = await readFile(securityMigrationUrl, 'utf8');
  for (const routine of [
    'replace_assignment_tests',
    'update_assignment_content',
    'create_submission_with_results',
    'complete_submission_regrade',
  ]) {
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${routine}`));
  }
  assert.match(sql, /FROM PUBLIC, anon, authenticated/g);
});
