import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { filterRoster, nextRosterIndex, toReportRows } from '../src/utils/fileSubmission.js';

const rows = [{ status: 'missing' }, { status: 'submitted' }, { status: 'late' }];
test('filters and advances within the visible roster', () => {
  assert.equal(filterRoster(rows, 'submitted').length, 1);
  assert.equal(nextRosterIndex(rows, 1), 2);
  assert.equal(nextRosterIndex(rows, 2), 0);
});

test('report rows contain no private URL fields', () => {
  const [row] = toReportRows([{ student_name: 'An', class_name: '10A', status: 'submitted', latest: { file_name: 'a.pdf' } }]);
  assert.equal(JSON.stringify(row).includes('url'), false);
  assert.equal(JSON.stringify(row).includes('object_key'), false);
});

test('report joins bundle names without private fields', () => {
  const [row] = toReportRows([{
    student_name: 'An',
    status: 'submitted',
    latest: { files: [{ file_name: 'a.pdf' }, { file_name: 'b.jpg' }] },
  }]);
  assert.equal(row['Tên file'], 'a.pdf; b.jpg');
  assert.doesNotMatch(JSON.stringify(row), /object_key|downloadUrl|token/i);
});

test('teacher preview uses a file-specific download route', async () => {
  const source = await readFile(new URL('../src/components/FilePreview.jsx', import.meta.url), 'utf8');
  assert.match(source, /files\/\$\{fileId\}\/download/);
  assert.match(source, /revokeObjectURL/);
});

test('teacher can inspect historical attempts without changing the grading target', async () => {
  const source = await readFile(new URL('../src/pages/FileSubmissionManager.jsx', import.meta.url), 'utf8');
  assert.match(source, /selectedAttemptId/);
  assert.match(source, /Các lần nộp trước/);
  assert.match(source, /isViewingHistorical/);
  assert.match(source, /fieldset disabled=\{isViewingHistorical\}/);
  assert.match(source, /selectedItem\.latest\.id/);
});

test('filters the teacher roster by AI review and publication states', () => {
  const aiRows = [
    { essay_grading: { job: { status: 'grading' }, report: null } },
    { essay_grading: { job: { status: 'awaiting_review' }, report: { review_status: 'pending' } } },
    { essay_grading: { job: { status: 'awaiting_review' }, report: { review_status: 'approved', published_at: null } } },
    { essay_grading: { job: { status: 'awaiting_review' }, report: { review_status: 'approved', published_at: 'now' } } },
    { essay_grading: { job: { status: 'failed' }, report: null } },
  ];
  assert.equal(filterRoster(aiRows, 'ai_processing').length, 1);
  assert.equal(filterRoster(aiRows, 'ai_review').length, 1);
  assert.equal(filterRoster(aiRows, 'ai_approved').length, 1);
  assert.equal(filterRoster(aiRows, 'ai_published').length, 1);
  assert.equal(filterRoster(aiRows, 'ai_failed').length, 1);
});

test('percentage review rejects a blank percentage before sending the request', async () => {
  const source = await readFile(new URL('../src/pages/FileSubmissionManager.jsx', import.meta.url), 'utf8');
  assert.match(source, /correctnessPercentage\s*===\s*''/);
  assert.match(source, /Vui lòng nhập phần trăm nội dung đúng/);
});
