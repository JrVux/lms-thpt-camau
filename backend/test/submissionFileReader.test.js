import test from 'node:test';
import assert from 'node:assert/strict';
import { detectFileType, createSubmissionFileReader } from '../src/services/submissionFileReader.js';

test('detects supported document signatures', () => {
  assert.equal(detectFileType(Buffer.from('%PDF-1.7')), 'application/pdf');
  assert.equal(detectFileType(Buffer.from([0xff, 0xd8, 0xff, 0x00])), 'image/jpeg');
  assert.equal(detectFileType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png');
  assert.equal(detectFileType(Buffer.from('RIFF0000WEBP')), 'image/webp');
  assert.equal(detectFileType(Buffer.from('not-a-document')), null);
});

test('falls back to the deterministic private R2 key when local storage is gone', async () => {
  let requestedKey = '';
  const reader = createSubmissionFileReader({
    uploadsDir: 'Z:\\missing-essay-uploads',
    r2Download: async ({ objectKey }) => {
      requestedKey = objectKey;
      return Buffer.from([0xff, 0xd8, 0xff, 0x00]);
    },
  });
  const result = await reader.read({
    submission: { object_key: 'local://saved.jpg', delivery_id: 'd1', user_id: 'u1', mime_type: 'image/jpeg' },
    assignment: { max_file_size_mb: 1 },
  });
  assert.equal(requestedKey, 'd1/u1/saved.jpg');
  assert.equal(result.file.mimeType, 'image/jpeg');
});

test('reads child files sequentially in sort order', async () => {
  const requested = [];
  const reader = createSubmissionFileReader({
    uploadsDir: 'Z:\\missing-essay-uploads',
    r2Download: async ({ objectKey }) => {
      requested.push(objectKey);
      return Buffer.from([0xff, 0xd8, 0xff, 0x00]);
    },
  });
  const result = await reader.readMany({
    submission: { delivery_id: 'd1', user_id: 'u1' },
    files: [
      { object_key: 'local://tmp/s/f2.jpg', file_name: '2.jpg', mime_type: 'image/jpeg', sort_order: 1 },
      { object_key: 'local://tmp/s/f1.jpg', file_name: '1.jpg', mime_type: 'image/jpeg', sort_order: 0 },
    ],
    assignment: { max_file_size_mb: 1 },
  });
  assert.deepEqual(requested, ['d1/u1/tmp/s/f1.jpg', 'd1/u1/tmp/s/f2.jpg']);
  assert.deepEqual(result.map((item) => item.fileName), ['1.jpg', '2.jpg']);
});

test('keeps readable files when one child is unavailable', async () => {
  const reader = createSubmissionFileReader({
    uploadsDir: 'Z:\\missing-essay-uploads',
    r2Download: async ({ objectKey }) => objectKey.endsWith('2.jpg')
      ? Buffer.from([0xff, 0xd8, 0xff, 0x00])
      : null,
  });
  const result = await reader.readMany({
    submission: { delivery_id: 'd1', user_id: 'u1' },
    files: [
      { object_key: 'local://tmp/s/1.jpg', file_name: '1.jpg', mime_type: 'image/jpeg', sort_order: 0 },
      { object_key: 'local://tmp/s/2.jpg', file_name: '2.jpg', mime_type: 'image/jpeg', sort_order: 1 },
    ],
    assignment: { max_file_size_mb: 1 },
  });
  assert.equal(result[0].extractionMethod, 'unreadable');
  assert.match(result[0].warnings[0], /chưa sẵn sàng/i);
  assert.equal(result[1].file.mimeType, 'image/jpeg');
});
