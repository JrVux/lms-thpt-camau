import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreFromPercentage, percentageFromScore } from '../src/utils/essayPercentageGrading.js';

test('synchronizes percentage and score with one-decimal rounding', () => {
  assert.equal(scoreFromPercentage(10, 83), 8.3);
  assert.equal(scoreFromPercentage(7, 33.3), 2.3);
  assert.equal(percentageFromScore(10, 8.3), 83);
  assert.equal(percentageFromScore(7, 2.3), 32.9);
});

test('rejects values outside their allowed range', () => {
  assert.throws(() => scoreFromPercentage(10, 101), /phần trăm/i);
  assert.throws(() => percentageFromScore(10, 11), /điểm/i);
});
