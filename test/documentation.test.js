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
  assert.match(readme, /eaacd41/);
  assert.match(readme, /OmniRoute/);
  assert.match(readme, /Node\.js 18\+/);
  assert.match(readme, /VITE_API_URL=https:\/\/lms-thpt-camau\.onrender\.com/);
  assert.doesNotMatch(readme, /TEACHER_SECRET=[a-f0-9]{32,}/);
  assert.doesNotMatch(readme, /(?:JWT_SECRET|TEACHER_SECRET)=[a-f0-9]{32,}/i);
});

test('visual guide covers teacher and student journeys accessibly', async () => {
  const guide = await read('docs/huong-dan-su-dung.html');
  for (const id of ['giao-vien', 'hoc-sinh', 'xu-ly-loi']) {
    assert.match(guide, new RegExp(`id="${id}"`));
  }
  assert.match(guide, /Be Vietnam Pro/);
  assert.match(guide, /prefers-reduced-motion/);
  assert.match(guide, /skip-link/);
  for (const label of [
    'OmniRoute',
    'Lớp của tôi',
    'Kho bài tập',
    'Lớp học',
    'Bài tập của tôi',
    'Bảng điểm',
    'Giao bài',
    'Xóa vĩnh viễn',
  ]) {
    assert.match(guide, new RegExp(label));
  }
  assert.match(guide, /Cập nhật.*08\/08\/2026/);
  assert.match(guide, /\.matrix th,\.matrix td\s*\{\s*padding:3mm 4mm;/);
  assert.doesNotMatch(guide, /<img[^>]+src="https?:/);
  assert.doesNotMatch(guide, /TEACHER_SECRET\s*[=:]\s*[a-f0-9]{32,}/i);
  assert.doesNotMatch(guide, /(?:JWT_SECRET|TEACHER_SECRET)=[a-f0-9]{32,}/i);
});
