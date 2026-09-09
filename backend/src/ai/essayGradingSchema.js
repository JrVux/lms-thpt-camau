export const ESSAY_GRADING_SCHEMA = {
  type: 'object',
  required: ['extracted_text', 'extraction_quality', 'extraction_warnings', 'criteria_results', 'overall_feedback', 'strengths', 'improvements'],
  properties: {
    extracted_text: { type: 'string' },
    extraction_quality: { type: 'string', enum: ['sufficient', 'uncertain', 'empty'] },
    extraction_warnings: { type: 'array', items: { type: 'string' } },
    criteria_results: { type: 'array', items: { type: 'object', required: ['rubric_item_id', 'awarded_points', 'status', 'explanation', 'evidence_snippets', 'confidence'], properties: {
      rubric_item_id: { type: 'string' },
      awarded_points: { type: 'number' },
      status: { type: 'string', enum: ['met', 'partial', 'not_met', 'uncertain'] },
      explanation: { type: 'string' },
      evidence_snippets: { type: 'array', items: { type: 'string' } },
      confidence: { type: 'number' },
    } } },
    overall_feedback: { type: 'string' },
    strengths: { type: 'array', items: { type: 'string' } },
    improvements: { type: 'array', items: { type: 'string' } },
  },
};

export class EssayGradeValidationError extends Error {
  constructor(message) { super(message); this.code = 'AI_ESSAY_INVALID'; }
}

const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;

export const validateEssayGrade = (value, rubric, maxScore) => {
  if (!value || !Array.isArray(value.criteria_results)) throw new EssayGradeValidationError('Kết quả AI thiếu tiêu chí rubric.');
  const expected = new Map(rubric.map((item) => [item.id, Number(item.max_points)]));
  const seen = new Set();
  for (const item of value.criteria_results) {
    if (!expected.has(item.rubric_item_id)) throw new EssayGradeValidationError('Kết quả AI chứa rubric ID không hợp lệ.');
    if (seen.has(item.rubric_item_id)) throw new EssayGradeValidationError('Kết quả AI lặp rubric ID.');
    seen.add(item.rubric_item_id);
    const points = Number(item.awarded_points);
    if (!Number.isFinite(points) || points < 0 || points > expected.get(item.rubric_item_id)) throw new EssayGradeValidationError('Điểm AI vượt giới hạn rubric.');
    if (!['met', 'partial', 'not_met', 'uncertain'].includes(item.status)) throw new EssayGradeValidationError('Trạng thái tiêu chí không hợp lệ.');
    if (!nonEmpty(item.explanation)) throw new EssayGradeValidationError('Thiếu giải thích tiêu chí.');
    if (!Number.isFinite(Number(item.confidence)) || item.confidence < 0 || item.confidence > 1) throw new EssayGradeValidationError('Độ tin cậy không hợp lệ.');
  }
  if (seen.size !== expected.size) throw new EssayGradeValidationError('Kết quả AI chưa đủ rubric.');
  if (!['sufficient', 'uncertain', 'empty'].includes(value.extraction_quality)) throw new EssayGradeValidationError('Chất lượng trích xuất không hợp lệ.');
  const score = value.criteria_results.reduce((sum, item) => sum + Number(item.awarded_points), 0);
  if (score > Number(maxScore)) throw new EssayGradeValidationError('Tổng điểm AI vượt điểm tối đa.');
  return { ...value, score };
};
