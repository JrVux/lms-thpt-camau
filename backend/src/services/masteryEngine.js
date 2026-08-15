export const DEFAULT_MASTERY_CONFIG = Object.freeze({
  version: 1,
  recentHalfLifeDays: 45,
  confidenceEvidenceTarget: 6,
  confidenceAssignmentTarget: 3,
  lowConfidenceThreshold: 40,
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (value) => Math.round(clamp(value, 0, 100));

const masteryLabel = (mastery) => {
  if (mastery < 40) return 'Chưa hình thành';
  if (mastery < 60) return 'Đang hình thành';
  if (mastery < 80) return 'Đạt';
  return 'Thành thạo';
};

const average = (rows) => rows.reduce((sum, row) => sum + row.value, 0) / rows.length;

export const calculateSkillSnapshot = (evidence = [], supplied = {}) => {
  const config = { ...DEFAULT_MASTERY_CONFIG, ...supplied };
  if (evidence.length === 0) {
    return {
      mastery: 0,
      confidence: 0,
      label: 'Chưa đủ dữ liệu',
      trend: 'insufficient',
      evidence_count: 0,
      assignment_count: 0,
    };
  }

  const nowMs = new Date(config.now ?? Date.now()).getTime();
  if (!Number.isFinite(nowMs)) throw new Error('Thời điểm tính năng lực không hợp lệ.');

  const weighted = evidence.map((item) => {
    const occurredAt = new Date(item.occurred_at).getTime();
    if (!Number.isFinite(occurredAt)) throw new Error('Thời điểm bằng chứng không hợp lệ.');
    const ageDays = Math.max(0, (nowMs - occurredAt) / 86400000);
    const recency = 2 ** (-ageDays / config.recentHalfLifeDays);
    const difficulty = 0.8 + (Number(item.difficulty) * 0.1);
    const calculatedWeight = recency * difficulty * Number(item.weight);
    return {
      ...item,
      occurredAt,
      calculatedWeight,
      value: clamp(Number(item.score_ratio), 0, 1),
    };
  });
  const totalWeight = weighted.reduce((sum, item) => sum + item.calculatedWeight, 0);
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
    throw new Error('Trọng số bằng chứng không hợp lệ.');
  }

  const mastery = round(100 * weighted.reduce(
    (sum, item) => sum + (item.value * item.calculatedWeight),
    0
  ) / totalWeight);
  const assignments = new Set(evidence.map((item) => item.assignment_id));
  const evidenceCoverage = Math.min(1, evidence.length / config.confidenceEvidenceTarget);
  const assignmentCoverage = Math.min(1, assignments.size / config.confidenceAssignmentTarget);
  const confidence = round(100 * ((evidenceCoverage + assignmentCoverage) / 2));
  const chronological = [...weighted].sort((left, right) => left.occurredAt - right.occurredAt);
  const midpoint = Math.ceil(chronological.length / 2);
  const delta = chronological.length < 2
    ? 0
    : average(chronological.slice(midpoint)) - average(chronological.slice(0, midpoint));
  const trend = chronological.length < 2
    ? 'insufficient'
    : delta > 0.1 ? 'improving' : delta < -0.1 ? 'declining' : 'stable';

  return {
    mastery,
    confidence,
    label: confidence < config.lowConfidenceThreshold ? 'Chưa đủ dữ liệu' : masteryLabel(mastery),
    trend,
    evidence_count: evidence.length,
    assignment_count: assignments.size,
  };
};
