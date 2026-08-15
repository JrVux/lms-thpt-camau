import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCompetencySummary } from '../src/utils/competency.js';

test('class summary counts low-confidence students separately', () => {
  const summary = buildCompetencySummary([{ competency_id: 'c1', mastery: 20, confidence: 10 }]);
  assert.deepEqual(summary.c1, { insufficient: 1, emerging: 0, achieved: 0, mastered: 0 });
});

test('class summary partitions sufficient mastery levels', () => {
  const summary = buildCompetencySummary([
    { competency_id: 'c1', mastery: 35, confidence: 60 },
    { competency_id: 'c1', mastery: 65, confidence: 60 },
    { competency_id: 'c1', mastery: 85, confidence: 60 },
  ]);
  assert.deepEqual(summary.c1, { insufficient: 0, emerging: 1, achieved: 1, mastered: 1 });
});
