export const PERCENTAGE_GRADING_METHOD = 'percentage_v2';

export const ESSAY_PERCENTAGE_GRADING_SCHEMA = {
  type: 'object',
  required: [
    'extracted_text', 'extraction_quality', 'extraction_warnings',
    'correctness_percentage', 'overall_feedback', 'correct_content',
    'missing_or_incorrect_content', 'contradictions', 'strengths',
    'improvements', 'confidence',
  ],
  properties: {
    extracted_text: { type: 'string' },
    extraction_quality: { type: 'string', enum: ['sufficient', 'uncertain', 'empty'] },
    extraction_warnings: { type: 'array', items: { type: 'string' } },
    correctness_percentage: { type: 'number', minimum: 0, maximum: 100 },
    overall_feedback: { type: 'string' },
    correct_content: {
      type: 'array',
      items: {
        type: 'object',
        required: ['description', 'evidence_snippets'],
        properties: {
          description: { type: 'string' },
          evidence_snippets: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    missing_or_incorrect_content: {
      type: 'array',
      items: {
        type: 'object',
        required: ['description', 'explanation'],
        properties: { description: { type: 'string' }, explanation: { type: 'string' } },
      },
    },
    contradictions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['description', 'explanation'],
        properties: { description: { type: 'string' }, explanation: { type: 'string' } },
      },
    },
    strengths: { type: 'array', items: { type: 'string' } },
    improvements: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
};

export class EssayPercentageValidationError extends Error {
  constructor(message) {
    super(message);
    this.code = 'AI_ESSAY_INVALID';
  }
}

const fail = (message) => { throw new EssayPercentageValidationError(message); };
const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;
const validTextArray = (value, maxItems, maxLength) => Array.isArray(value)
  && value.length <= maxItems
  && value.every((item) => nonEmpty(item) && item.length <= maxLength);

const validAnalysisItems = (items, secondKey, label) => {
  if (!Array.isArray(items) || items.length > 20) fail(`${label} không hợp lệ.`);
  for (const item of items) {
    if (!nonEmpty(item?.description) || item.description.length > 2000) fail(`${label} không hợp lệ.`);
    if (secondKey === 'evidence_snippets') {
      if (!Array.isArray(item.evidence_snippets) || item.evidence_snippets.length > 10
        || item.evidence_snippets.some((text) => typeof text !== 'string' || text.length > 2000)) {
        fail(`${label} không hợp lệ.`);
      }
    } else if (!nonEmpty(item?.[secondKey]) || item[secondKey].length > 2000) {
      fail(`${label} không hợp lệ.`);
    }
  }
};

export const roundPercentageScore = (maxScore, percentage) => {
  const maximum = Number(maxScore);
  const percent = Number(percentage);
  if (!Number.isFinite(maximum) || maximum <= 0) fail('Điểm tối đa không hợp lệ.');
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) fail('Phần trăm nội dung đúng không hợp lệ.');
  return Number((maximum * percent / 100).toFixed(1));
};

export const validatePercentageGrade = (value, maxScore) => {
  if (!value || !nonEmpty(value.extracted_text) || value.extracted_text.length > 100000 || value.extraction_quality === 'empty') {
    fail('Không trích xuất được nội dung bài làm để chấm.');
  }
  if (!['sufficient', 'uncertain', 'empty'].includes(value.extraction_quality)) fail('Chất lượng trích xuất không hợp lệ.');
  if (!validTextArray(value.extraction_warnings || [], 20, 1000)) fail('Cảnh báo trích xuất không hợp lệ.');
  if (!nonEmpty(value.overall_feedback) || value.overall_feedback.length > 10000) fail('Nhận xét tổng hợp không hợp lệ.');
  validAnalysisItems(value.correct_content, 'evidence_snippets', 'Nội dung đúng');
  validAnalysisItems(value.missing_or_incorrect_content, 'explanation', 'Nội dung thiếu hoặc sai');
  validAnalysisItems(value.contradictions, 'explanation', 'Nội dung mâu thuẫn');
  if (!validTextArray(value.strengths || [], 20, 2000) || !validTextArray(value.improvements || [], 20, 2000)) {
    fail('Danh sách nhận xét không hợp lệ.');
  }
  if (!Number.isFinite(Number(value.confidence)) || Number(value.confidence) < 0 || Number(value.confidence) > 1) {
    fail('Độ tin cậy không hợp lệ.');
  }
  if (typeof value.correctness_percentage !== 'number' || !Number.isFinite(value.correctness_percentage)
    || value.correctness_percentage < 0 || value.correctness_percentage > 100) {
    fail('Phần trăm nội dung đúng không hợp lệ.');
  }
  const percentage = value.correctness_percentage;
  return { ...value, correctness_percentage: percentage, confidence: Number(value.confidence), score: roundPercentageScore(maxScore, percentage) };
};
