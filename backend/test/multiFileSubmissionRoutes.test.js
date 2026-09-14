import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('registers student upload-session routes before submission-id routes', async () => {
  const source = await readFile(new URL('../src/routes/index.js', import.meta.url), 'utf8');
  const create = source.indexOf("deliveries/:deliveryId/upload-sessions");
  const upload = source.indexOf("upload-sessions/:sessionId/files/:fileId");
  const confirm = source.indexOf("upload-sessions/:sessionId/confirm");
  const cancel = source.indexOf("upload-sessions/:sessionId'");
  const legacyDownload = source.indexOf(":submissionId/download");
  assert.ok(create > 0 && upload > create && confirm > upload && cancel > confirm);
  assert.ok(cancel < legacyDownload);
  assert.match(source, /raw\(\{\s*type:\s*\(\)\s*=>\s*true,\s*limit:\s*'101mb'/s);
});
