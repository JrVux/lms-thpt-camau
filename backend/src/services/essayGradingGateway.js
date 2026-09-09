import { ESSAY_GRADING_SCHEMA, validateEssayGrade } from '../ai/essayGradingSchema.js';
import { buildEssayGradingPrompt } from '../ai/essayGradingPrompt.js';

export const createEssayGradingGateway = ({ gemini, timeoutMs = 90000 }) => ({
  async generate(input) {
    if (!gemini?.isConfigured) { const error = new Error('Thiếu cấu hình Gemini.'); error.code = 'AI_CONFIGURATION_ERROR'; throw error; }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const prompt = buildEssayGradingPrompt(input);
      const result = await gemini.grade({ ...prompt, schema: ESSAY_GRADING_SCHEMA, file: input.file, signal: controller.signal });
      return { grade: validateEssayGrade(result.value, input.rubric, input.maxScore), provider: 'gemini', model: result.model, usage: result.usage || {} };
    } catch (error) {
      if (error?.name === 'AbortError') { const timeout = new Error('Gemini quá thời gian.'); timeout.code = 'AI_TIMEOUT'; throw timeout; }
      throw error;
    } finally { clearTimeout(timer); }
  },
});
