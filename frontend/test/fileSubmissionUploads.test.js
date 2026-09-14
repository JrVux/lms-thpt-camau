import test from 'node:test';
import assert from 'node:assert/strict';
import { submitFileBundle } from '../src/services/fileSubmissionUploads.js';

const pdf = (name) => new File([new Uint8Array([1, 2, 3])], name, { type: 'application/pdf' });

test('uploads files sequentially then confirms once', async () => {
  const calls = [];
  const apiClient = {
    post: async (url, body, config) => {
      if (url.endsWith('/upload-sessions')) {
        calls.push('create');
        assert.deepEqual(body.files.map((file) => file.name), ['a.pdf', 'b.pdf']);
        return { data: { id: 'session-1', files: [{ id: 'f1' }, { id: 'f2' }] } };
      }
      if (url.includes('/files/f1')) calls.push('upload:0');
      else if (url.includes('/files/f2')) calls.push('upload:1');
      else if (url.endsWith('/confirm')) calls.push('confirm');
      if (config?.onUploadProgress) config.onUploadProgress({ loaded: 3, total: 3 });
      return { data: { success: true } };
    },
    delete: async () => { calls.push('cancel'); },
  };
  const progress = [];
  await submitFileBundle({ deliveryId: 'd1', files: [pdf('a.pdf'), pdf('b.pdf')], apiClient, onProgress: (value) => progress.push(value) });
  assert.deepEqual(calls, ['create', 'upload:0', 'upload:1', 'confirm']);
  assert.deepEqual(progress.at(-1), { fileIndex: 1, filePercent: 100, totalPercent: 100 });
});

test('cancels the session and skips confirm after one upload fails', async () => {
  const calls = [];
  const failure = new Error('upload failed');
  const apiClient = {
    post: async (url) => {
      if (url.endsWith('/upload-sessions')) { calls.push('create'); return { data: { id: 'session-1', files: [{ id: 'f1' }, { id: 'f2' }] } }; }
      if (url.includes('/files/f1')) { calls.push('upload:0'); return { data: { success: true } }; }
      if (url.includes('/files/f2')) { calls.push('upload:1'); throw failure; }
      calls.push('confirm');
      return { data: {} };
    },
    delete: async () => { calls.push('cancel'); },
  };
  await assert.rejects(
    submitFileBundle({ deliveryId: 'd1', files: [pdf('a.pdf'), pdf('b.pdf')], apiClient }),
    (error) => error === failure,
  );
  assert.deepEqual(calls, ['create', 'upload:0', 'upload:1', 'cancel']);
});
