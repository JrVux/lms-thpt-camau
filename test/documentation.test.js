import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('README documents production and links the visual guides', async () => {
  const readme = await read('README.md');
  assert.match(readme, /https:\/\/frontend-alpha-henna-71\.vercel\.app/);
  assert.match(readme, /docs\/huong-dan-su-dung\.html/);
  assert.match(readme, /output\/pdf\/cam-nang-su-dung-lms-thpt\.pdf/);
  assert.match(readme, /008_delete_class_transaction\.sql/);
  assert.doesNotMatch(readme, /TEACHER_SECRET=[a-f0-9]{32,}/);
});

test('visual guide covers teacher and student journeys accessibly', async () => {
  const guide = await read('docs/huong-dan-su-dung.html');
  for (const id of ['giao-vien', 'hoc-sinh', 'xu-ly-loi']) {
    assert.match(guide, new RegExp(`id="${id}"`));
  }
  assert.match(guide, /Be Vietnam Pro/);
  assert.match(guide, /prefers-reduced-motion/);
  assert.match(guide, /skip-link/);
  assert.doesNotMatch(guide, /<img[^>]+src="https?:/);
  assert.doesNotMatch(guide, /9ca01d06abd4b2ec/);
});
