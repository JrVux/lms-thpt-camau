import test from 'node:test';
import assert from 'node:assert/strict';
import * as fileSubmissionController from '../src/controllers/fileSubmissionController.js';

test('sends an authorized R2 buffer with the original file metadata', () => {
  assert.equal(typeof fileSubmissionController.sendSubmissionFile, 'function');
  const headers = {};
  let sent = null;
  const res = {
    setHeader: (name, value) => { headers[name] = value; },
    send: (value) => { sent = value; return res; },
  };
  const buffer = Buffer.from([0xff, 0xd8, 0xff]);
  fileSubmissionController.sendSubmissionFile(res, {
    type: 'buffer',
    buffer,
    fileName: 'bai-lam.jpg',
    mimeType: 'image/jpeg',
  });
  assert.equal(headers['Content-Type'], 'image/jpeg');
  assert.match(headers['Content-Disposition'], /bai-lam\.jpg/);
  assert.equal(sent, buffer);
});
