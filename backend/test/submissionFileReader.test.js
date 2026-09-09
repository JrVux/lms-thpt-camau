import test from 'node:test';
import assert from 'node:assert/strict';
import { detectFileType } from '../src/services/submissionFileReader.js';

test('detects supported document signatures', () => {
  assert.equal(detectFileType(Buffer.from('%PDF-1.7')), 'application/pdf');
  assert.equal(detectFileType(Buffer.from([0xff, 0xd8, 0xff, 0x00])), 'image/jpeg');
  assert.equal(detectFileType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png');
  assert.equal(detectFileType(Buffer.from('RIFF0000WEBP')), 'image/webp');
  assert.equal(detectFileType(Buffer.from('not-a-document')), null);
});
