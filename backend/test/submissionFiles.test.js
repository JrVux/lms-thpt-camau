import test from 'node:test';
import assert from 'node:assert/strict';
import { groupSubmissionHistory, normalizeSubmissionFiles, safeSubmissionBundle } from '../src/services/submissionFiles.js';

test('normalizes ordered child files without exposing object keys', () => {
  const submission = {
    id: 's1', object_key: 'local://legacy.pdf',
    submission_files: [
      { id: 'f2', object_key: 'local://two.jpg', file_name: 'two.jpg', mime_type: 'image/jpeg', file_size: 20, sort_order: 1 },
      { id: 'f1', object_key: 'local://one.pdf', file_name: 'one.pdf', mime_type: 'application/pdf', file_size: 10, sort_order: 0 },
    ],
  };
  const result = safeSubmissionBundle(submission);
  assert.deepEqual(result.files.map((file) => file.id), ['f1', 'f2']);
  assert.equal(result.object_key, undefined);
  assert.equal(result.submission_files, undefined);
  assert.equal(JSON.stringify(result.files).includes('object_key'), false);
});

test('falls back to one legacy parent file when child rows do not exist', () => {
  assert.deepEqual(normalizeSubmissionFiles({
    file_name: 'legacy.pdf', mime_type: 'application/pdf', file_size: 10, submission_files: [],
  }), [{ id: null, file_name: 'legacy.pdf', mime_type: 'application/pdf', file_size: 10, sort_order: 0 }]);
});

test('groups teacher history by delivery and student without mixing attempts', () => {
  const grouped = groupSubmissionHistory([
    { id: 'new', delivery_id: 'd1', user_id: 'u1', submitted_at: '2026-09-14', submission_files: [{ id: 'new-file', sort_order: 0 }] },
    { id: 'old', delivery_id: 'd1', user_id: 'u1', submitted_at: '2026-09-13', submission_files: [{ id: 'old-file', sort_order: 0 }] },
    { id: 'other', delivery_id: 'd1', user_id: 'u2', submitted_at: '2026-09-14', submission_files: [{ id: 'other-file', sort_order: 0 }] },
  ]);
  assert.deepEqual(grouped.get('d1_u1').map((item) => item.id), ['new', 'old']);
  assert.deepEqual(grouped.get('d1_u1').flatMap((item) => item.files.map((file) => file.id)), ['new-file', 'old-file']);
  assert.deepEqual(grouped.get('d1_u2').map((item) => item.id), ['other']);
});
