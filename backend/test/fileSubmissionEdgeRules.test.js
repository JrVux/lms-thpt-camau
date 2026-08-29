import test from 'node:test';
import assert from 'node:assert/strict';
import { safeFileName, deadlineState, validateFile, validateScore } from '../../supabase/functions/_shared/fileRules.ts';

test('sanitizes names and validates assignment limits', () => {
  assert.equal(safeFileName('../Bài làm 01.pdf'), 'Bai_lam_01.pdf');
  assert.equal(validateFile({ mimeType: 'application/pdf', fileSize: 1024 }, { allowed_mime_types: ['application/pdf'], max_file_size_mb: 1 }), null);
  assert.equal(validateFile({ mimeType: 'text/plain', fileSize: 10 }, { allowed_mime_types: ['application/pdf'], max_file_size_mb: 1 }).code, 'UNSUPPORTED_FILE_TYPE');
});

test('deadline and score rules are deterministic', () => {
  assert.deepEqual(deadlineState('2026-08-28T00:00:00Z', true, new Date('2026-08-29T00:00:00Z')), { isLate: true, allowed: true });
  assert.equal(validateScore(8, 10), null);
  assert.equal(validateScore(11, 10).code, 'INVALID_SCORE');
});
