import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const paths = [
  new URL('../src/database/migrations/015_ai_essay_grading.sql', import.meta.url),
  new URL('../../supabase/migrations/020_ai_essay_grading.sql', import.meta.url),
];

for (const path of paths) {
  test(`AI essay migration contract: ${path.pathname}`, async () => {
    const sql = await readFile(path, 'utf8');
    for (const field of ['ai_grading_enabled', 'essay_model_answer', 'essay_rubric', 'show_model_answer_after_publish']) {
      assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS ${field}`, 'i'));
    }
    for (const table of ['essay_grading_jobs', 'essay_grading_reports', 'essay_grading_events']) {
      assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}`, 'i'));
      assert.match(sql, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, 'i'));
    }
    assert.match(sql, /FOR UPDATE SKIP LOCKED/i);
    assert.match(sql, /claim_essay_grading_job/i);
    assert.match(sql, /TO service_role/i);
    assert.doesNotMatch(sql, /DROP TABLE|DROP COLUMN/i);
  });
}
