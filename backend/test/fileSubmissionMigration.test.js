import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../src/database/migrations/014_file_submissions.sql', import.meta.url), 'utf8');

test('adds file assignment and submission fields without replacing legacy columns', () => {
  for (const field of ['submission_type', 'essay_content', 'allowed_mime_types', 'max_file_size_mb', 'allow_late_submission']) {
    assert.match(migration, new RegExp(`ADD COLUMN IF NOT EXISTS ${field}`, 'i'));
  }
  for (const field of ['object_key', 'file_name', 'mime_type', 'file_size', 'is_late', 'is_latest', 'feedback', 'graded_at', 'graded_by']) {
    assert.match(migration, new RegExp(`ADD COLUMN IF NOT EXISTS ${field}`, 'i'));
  }
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN/i);
});

test('enforces one latest file row and idempotent confirmation', () => {
  assert.match(migration, /WHERE object_key IS NOT NULL AND is_latest = TRUE/i);
  assert.match(migration, /UNIQUE.*object_key/i);
  assert.match(migration, /create_file_submission/i);
  assert.match(migration, /mark_previous_file_submissions_not_latest/i);
});
