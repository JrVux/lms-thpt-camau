export const STUDENT_ANALYSIS_SCHEMA_VERSION = '1.0';
export const STUDENT_ANALYSIS_PROMPT_VERSION = '1.0';

const evidenceItem = {
  type: 'object',
  additionalProperties: false,
  required: ['text', 'evidence_refs', 'confidence'],
  properties: {
    text: { type: 'string', minLength: 1, maxLength: 600 },
    evidence_refs: { type: 'array', items: { type: 'string' }, maxItems: 12 },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
  },
};

export const STUDENT_ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['teacher_report', 'student_report'],
  properties: {
    teacher_report: {
      type: 'object',
      additionalProperties: false,
      required: ['summary', 'strengths', 'reinforcement_areas', 'common_errors', 'trend_interpretation', 'insufficient_evidence', 'priority_goals', 'warnings'],
      properties: {
        summary: { type: 'string', minLength: 1, maxLength: 800 },
        strengths: { type: 'array', minItems: 2, maxItems: 4, items: evidenceItem },
        reinforcement_areas: { type: 'array', minItems: 2, maxItems: 4, items: evidenceItem },
        common_errors: {
          type: 'array', maxItems: 6, items: {
            type: 'object', additionalProperties: false,
            required: ['error', 'possible_knowledge_cause'],
            properties: {
              error: { type: 'string', minLength: 1, maxLength: 400 },
              possible_knowledge_cause: { type: 'string', minLength: 1, maxLength: 400 },
            },
          },
        },
        trend_interpretation: { type: 'string', minLength: 1, maxLength: 600 },
        insufficient_evidence: { type: 'array', items: { type: 'string' } },
        priority_goals: {
          type: 'array', minItems: 2, maxItems: 3, items: {
            type: 'object', additionalProperties: false,
            required: ['goal', 'evidence_refs'],
            properties: {
              goal: { type: 'string', minLength: 1, maxLength: 400 },
              evidence_refs: { type: 'array', items: { type: 'string' } },
            },
          },
        },
        warnings: { type: 'string', maxLength: 600 },
      },
    },
    student_report: {
      type: 'object',
      additionalProperties: false,
      required: ['doing_well', 'practice_more', 'two_week_goals', 'steps'],
      properties: {
        doing_well: { type: 'string', minLength: 1, maxLength: 600 },
        practice_more: { type: 'string', minLength: 1, maxLength: 600 },
        two_week_goals: { type: 'string', minLength: 1, maxLength: 600 },
        steps: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'string', maxLength: 300 } },
      },
    },
  },
};
