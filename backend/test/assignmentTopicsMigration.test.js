import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL(
  '../src/database/migrations/012_assignment_topics.sql',
  import.meta.url
);

test('topic migration creates a teacher-scoped topic table with service-role-only access', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /CREATE TABLE IF NOT EXISTS assignment_topics/);
  assert.match(sql, /teacher_id UUID NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/);
  assert.match(sql, /category VARCHAR\(20\) NOT NULL/);
  assert.match(sql, /name VARCHAR\(100\) NOT NULL/);
  assert.match(sql, /UNIQUE \(teacher_id, category, name\)/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON assignment_topics FROM anon, authenticated/);
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE, DELETE ON assignment_topics TO service_role/);
});

test('topic migration links assignments to topics without deleting them', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /ADD COLUMN IF NOT EXISTS topic_id UUID REFERENCES assignment_topics\(id\) ON DELETE SET NULL/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_assignments_teacher_topic/);
});

test('topic migration extends the content update RPC to sync topic_id', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.update_assignment_content/);
  assert.match(sql, /topic_id = CASE[\s\S]*p_updates \? 'topic_id'/);
  assert.match(sql, /SET search_path = pg_catalog/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.update_assignment_content\(UUID, UUID, JSONB, BOOLEAN\)[\s\S]*FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.update_assignment_content\(UUID, UUID, JSONB, BOOLEAN\)[\s\S]*TO service_role/);
});
