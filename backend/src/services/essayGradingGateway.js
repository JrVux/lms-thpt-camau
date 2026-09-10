import { ESSAY_GRADING_SCHEMA, validateEssayGrade } from '../ai/essayGradingSchema.js';
import { ESSAY_PERCENTAGE_GRADING_SCHEMA, PERCENTAGE_GRADING_METHOD, validatePercentageGrade } from '../ai/essayPercentageGrading.js';
import { buildEssayGradingPrompt, buildPercentageGradingPrompt } from '../ai/essayGradingPrompt.js';

export const createEssayGradingGateway = ({ gemini, timeoutMs = 90000 }) => ({
  async generate(input) {
    if (!gemini?.isConfigured) { const error = new Error('Thiếu cấu hình Gemini.'); error.code = 'AI_CONFIGURATION_ERROR'; throw error; }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const percentage = input.gradingMethod === PERCENTAGE_GRADING_METHOD;
      const prompt = percentage ? buildPercentageGradingPrompt(input) : buildEssayGradingPrompt(input);
      const schema = percentage ? ESSAY_PERCENTAGE_GRADING_SCHEMA : ESSAY_GRADING_SCHEMA;
      const result = await gemini.grade({ ...prompt, schema, file: input.file, signal: controller.signal });
      const grade = percentage
        ? validatePercentageGrade(result.value, input.maxScore)
        : validateEssayGrade(result.value, input.rubric, input.maxScore);
      return { grade, provider: 'gemini', model: result.model, usage: result.usage || {} };
    } catch (error) {
      if (error?.name === 'AbortError') { const timeout = new Error('Gemini quá thời gian.'); timeout.code = 'AI_TIMEOUT'; throw timeout; }
      throw error;
    } finally { clearTimeout(timer); }
  },
});
