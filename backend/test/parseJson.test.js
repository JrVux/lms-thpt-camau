import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanAndParseJson } from '../src/ai/utils/parseJson.js';

test('cleanAndParseJson parses clean JSON', () => {
  const result = cleanAndParseJson('{"title": "Python 10"}');
  assert.equal(result.title, 'Python 10');
});

test('cleanAndParseJson strips User Safety header', () => {
  const input = 'User Safety: safe\n\n{\n  "title": "Safety Test"\n}';
  const result = cleanAndParseJson(input);
  assert.equal(result.title, 'Safety Test');
});

test('cleanAndParseJson strips markdown code fences', () => {
  const input = '```json\n{\n  "title": "Fence Test"\n}\n```';
  const result = cleanAndParseJson(input);
  assert.equal(result.title, 'Fence Test');
});

test('cleanAndParseJson handles User Safety + markdown fence combined', () => {
  const input = 'User Safety: safe\n\n```json\n{\n  "title": "Combined Test"\n}\n```';
  const result = cleanAndParseJson(input);
  assert.equal(result.title, 'Combined Test');
});

test('cleanAndParseJson fixes trailing commas', () => {
  const input = '{\n  "title": "Comma Test",\n  "difficulty": 2,\n}';
  const result = cleanAndParseJson(input);
  assert.equal(result.title, 'Comma Test');
  assert.equal(result.difficulty, 2);
});
