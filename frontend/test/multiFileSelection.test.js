import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addSelectedFiles,
  moveSelectedFile,
  removeSelectedFile,
  validateSelectedFiles,
} from '../src/utils/fileSubmission.js';

const pdf = (name, size = 1024) => ({ name, type: 'application/pdf', size });
const settings = { allowed_mime_types: ['application/pdf'], max_file_size_mb: 1 };

test('adds at most five unique valid files and preserves order', () => {
  const result = addSelectedFiles([pdf('a.pdf')], [pdf('b.pdf'), pdf('c.pdf')], settings, 5);
  assert.deepEqual(result.files.map((file) => file.name), ['a.pdf', 'b.pdf', 'c.pdf']);
  assert.equal(result.error, null);
  assert.match(addSelectedFiles(result.files, [pdf('A.PDF')], settings, 5).error, /trùng/i);
  assert.match(addSelectedFiles(result.files, [pdf('d.pdf'), pdf('e.pdf'), pdf('f.pdf')], settings, 5).error, /5 file/i);
});

test('rejects the whole addition when one new file is invalid', () => {
  const existing = [pdf('a.pdf')];
  const result = addSelectedFiles(existing, [pdf('b.pdf'), { name: 'bad.txt', type: 'text/plain', size: 10 }], settings, 5);
  assert.strictEqual(result.files, existing);
  assert.match(result.error, /định dạng/i);
});

test('validates and removes files without mutating the original list', () => {
  const input = [pdf('a.pdf'), pdf('b.pdf')];
  assert.equal(validateSelectedFiles(input, settings, 5), null);
  const output = removeSelectedFile(input, 0);
  assert.deepEqual(output.map((file) => file.name), ['b.pdf']);
  assert.deepEqual(input.map((file) => file.name), ['a.pdf', 'b.pdf']);
});

test('reorders without mutating the original list', () => {
  const input = [pdf('a.pdf'), pdf('b.pdf')];
  const output = moveSelectedFile(input, 1, -1);
  assert.deepEqual(output.map((file) => file.name), ['b.pdf', 'a.pdf']);
  assert.deepEqual(input.map((file) => file.name), ['a.pdf', 'b.pdf']);
});
