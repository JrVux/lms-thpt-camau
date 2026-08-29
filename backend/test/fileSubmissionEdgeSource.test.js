import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const auth = await readFile(new URL('../../supabase/functions/_shared/authorization.ts', import.meta.url), 'utf8');
const r2 = await readFile(new URL('../../supabase/functions/_shared/r2.ts', import.meta.url), 'utf8');

test('authorization binds students and teachers to delivery ownership', () => {
  assert.match(auth, /enrollments/);
  assert.match(auth, /assignment_recipients/);
  assert.match(auth, /classes.*teacher_id/s);
});

test('R2 helper uses private S3 signing and fixed expiries', () => {
  assert.match(r2, /aws4fetch@1\.0\.17/);
  assert.match(r2, /300/);
  assert.match(r2, /900/);
  assert.doesNotMatch(r2, /console\.log\(.*url|console\.log\(.*key/i);
});

test('upload and confirmation repeat authorization and never return object keys', async () => {
  const upload = await readFile(new URL('../../supabase/functions/get-upload-url/index.ts', import.meta.url), 'utf8');
  const confirm = await readFile(new URL('../../supabase/functions/confirm-submission/index.ts', import.meta.url), 'utf8');
  assert.match(upload, /authorizeStudentDelivery/);
  assert.match(confirm, /authorizeStudentDelivery/);
  assert.match(confirm, /headObject/);
  assert.match(confirm, /create_file_submission/);
  assert.doesNotMatch(confirm, /object_key\s*:/);
});
