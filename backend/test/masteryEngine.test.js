import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSkillSnapshot } from '../src/services/masteryEngine.js';

const config = {
  version: 1,
  recentHalfLifeDays: 30,
  confidenceEvidenceTarget: 4,
  confidenceAssignmentTarget: 2,
  lowConfidenceThreshold: 40,
  now: '2026-08-15T00:00:00.000Z',
};

test('returns insufficient for no evidence', () => {
  assert.deepEqual(calculateSkillSnapshot([], config), {
    mastery: 0,
    confidence: 0,
    label: 'Chưa đủ dữ liệu',
    trend: 'insufficient',
    evidence_count: 0,
    assignment_count: 0,
  });
});

test('weights recent, difficult, and approved evidence deterministically', () => {
  const snapshot = calculateSkillSnapshot([
    { assignment_id: 'a1', passed: false, score_ratio: 0, difficulty: 1, weight: 1, occurred_at: '2026-05-01T00:00:00Z' },
    { assignment_id: 'a2', passed: true, score_ratio: 1, difficulty: 3, weight: 2, occurred_at: '2026-08-14T00:00:00Z' },
  ], config);
  assert.ok(snapshot.mastery >= 75);
  assert.equal(snapshot.assignment_count, 2);
  assert.equal(snapshot.confidence, 75);
  assert.equal(snapshot.label, 'Thành thạo');
  assert.equal(snapshot.trend, 'improving');
});

test('never emits a weak label below the confidence threshold', () => {
  const snapshot = calculateSkillSnapshot([
    { assignment_id: 'a1', passed: false, score_ratio: 0, difficulty: 2, weight: 1, occurred_at: '2026-08-14T00:00:00Z' },
  ], config);
  assert.equal(snapshot.label, 'Chưa đủ dữ liệu');
  assert.equal(snapshot.confidence, 38);
});

test('clamps malformed score ratios and rejects invalid dates', () => {
  const high = calculateSkillSnapshot([
    { assignment_id: 'a1', score_ratio: 9, difficulty: 2, weight: 1, occurred_at: '2026-08-14T00:00:00Z' },
  ], { ...config, lowConfidenceThreshold: 0 });
  assert.equal(high.mastery, 100);
  assert.throws(() => calculateSkillSnapshot([
    { assignment_id: 'a1', score_ratio: 1, difficulty: 2, weight: 1, occurred_at: 'not-a-date' },
  ], config), /thời điểm bằng chứng/i);
});
