import test from 'node:test';
import assert from 'node:assert/strict';
import { displayMastery, sortCompetencies } from '../src/utils/competency.js';

test('hides mastery labels when confidence is low', () => {
  assert.deepEqual(displayMastery({ mastery: 18, confidence: 39, label: 'Chưa hình thành' }), {
    label: 'Chưa đủ dữ liệu', tone: 'neutral', value: null,
  });
});

test('shows approved mastery when confidence is sufficient', () => {
  assert.deepEqual(displayMastery({ mastery: 82, confidence: 70, label: 'Thành thạo' }), {
    label: 'Thành thạo', tone: 'success', value: 82,
  });
});

test('sorts competencies by framework code without mutating input', () => {
  const input = [{ code: 'PY10.2' }, { code: 'PY10.1' }];
  assert.deepEqual(sortCompetencies(input).map((item) => item.code), ['PY10.1', 'PY10.2']);
  assert.equal(input[0].code, 'PY10.2');
});
