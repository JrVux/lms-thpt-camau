import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('teacher percentage review exposes all approved explanation groups', async () => {
  const source = await readFile(new URL('../src/components/EssayPercentageReview.jsx', import.meta.url), 'utf8');
  for (const label of ['Phần trăm nội dung đúng', 'Điểm đề xuất', 'Nội dung làm đúng', 'Nội dung thiếu hoặc sai', 'Nội dung mâu thuẫn', 'Chất lượng trích xuất', 'Độ tin cậy AI']) {
    assert.match(source, new RegExp(label, 'i'));
  }
  assert.match(source, /evidence_snippets/);
  assert.match(source, /onPercentageChange/);
  assert.match(source, /onScoreChange/);
});
