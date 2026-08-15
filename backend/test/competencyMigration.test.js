import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL(
  '../src/database/migrations/009_competency_foundation.sql',
  import.meta.url
);

test('competency migration creates versioned service-role-only tables', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  for (const table of [
    'competency_framework_versions',
    'competencies',
    'assignment_competency_mappings',
    'competency_evidence',
    'student_competency_snapshots',
    'mastery_config_versions',
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
    assert.match(sql, new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`));
    assert.match(sql, new RegExp(`REVOKE ALL ON ${table} FROM anon, authenticated`));
  }
  assert.match(sql, /idx_global_competency_code/);
  assert.match(sql, /idx_teacher_competency_code/);
  assert.match(sql, /idx_mapping_assignment_skill/);
  assert.match(sql, /idx_mapping_test_skill/);
  assert.match(sql, /UNIQUE\(submission_result_id, competency_id\)/);
  assert.match(sql, /CHECK \(status IN \('proposed', 'approved', 'rejected'\)\)/);
  assert.match(sql, /idx_competency_evidence_student_skill_time/);
  assert.match(sql, /PY10\.LOOP/);
});
