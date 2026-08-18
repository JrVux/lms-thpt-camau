import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL(
  '../src/database/migrations/013_delete_assignment_transaction.sql',
  import.meta.url
);

test('delete migration creates a teacher-scoped transaction RPC', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.delete_assignment_owned\(/);
  assert.match(sql, /SECURITY INVOKER SET search_path = ''/);
  assert.match(sql, /p_teacher_id UUID/);
  assert.match(sql, /p_library_only BOOLEAN DEFAULT FALSE/);
  assert.match(sql, /teacher_id = p_teacher_id/);
  assert.match(sql, /FOR UPDATE/);
});

test('delete migration removes deliveries, copies, and submissions safely', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /assignment_deliveries[\s\S]*WHERE library_assignment_id = p_assignment_id/);
  assert.match(sql, /DELETE FROM public\.submissions/);
  assert.match(sql, /DELETE FROM public\.assignments WHERE id = ANY\(copy_ids\)/);
  assert.match(sql, /SET source_assignment_id = NULL/);
  assert.match(sql, /DELETE FROM public\.assignments WHERE id = p_assignment_id/);
});

test('delete migration is service-role-only', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /REVOKE ALL ON FUNCTION public\.delete_assignment_owned\(UUID, UUID, BOOLEAN\)[\s\S]*FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.delete_assignment_owned\(UUID, UUID, BOOLEAN\)[\s\S]*TO service_role/);
});
