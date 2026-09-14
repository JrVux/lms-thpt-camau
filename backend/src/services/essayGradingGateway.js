import { ESSAY_GRADING_SCHEMA, validateEssayGrade } from '../ai/essayGradingSchema.js';
import { ESSAY_PERCENTAGE_GRADING_SCHEMA, PERCENTAGE_GRADING_METHOD, validatePercentageGrade } from '../ai/essayPercentageGrading.js';
import { buildEssayGradingPrompt, buildPercentageGradingPrompt } from '../ai/essayGradingPrompt.js';
import { ESSAY_FILE_EXTRACTION_SCHEMA, buildEssayFileExtractionPrompt, validateEssayFileExtraction } from '../ai/essayFileExtraction.js';

export const createEssayGradingGateway = ({ gemini, timeoutMs = 90000 }) => {
  const withTimeout = async (operation) => {
    if (!gemini?.isConfigured) { const error = new Error('Thiếu cấu hình Gemini.'); error.code = 'AI_CONFIGURATION_ERROR'; throw error; }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await operation(controller.signal);
    } catch (error) {
      if (error?.name === 'AbortError') { const timeout = new Error('Gemini quá thời gian.'); timeout.code = 'AI_TIMEOUT'; throw timeout; }
      throw error;
    } finally { clearTimeout(timer); }
  };

  return {
    async generate(input) {
      return withTimeout(async (signal) => {
      const percentage = input.gradingMethod === PERCENTAGE_GRADING_METHOD;
      const prompt = percentage ? buildPercentageGradingPrompt(input) : buildEssayGradingPrompt(input);
      const schema = percentage ? ESSAY_PERCENTAGE_GRADING_SCHEMA : ESSAY_GRADING_SCHEMA;
      const result = await gemini.grade({ ...prompt, schema, file: input.file, signal });
      const grade = percentage
        ? validatePercentageGrade(result.value, input.maxScore)
        : validateEssayGrade(result.value, input.rubric, input.maxScore);
      return { grade, provider: 'gemini', model: result.model, usage: result.usage || {} };
      });
    },
    async extractFile({ file, fileName }) {
      return withTimeout(async (signal) => {
        if (typeof gemini.extract !== 'function') { const error = new Error('Gemini chưa hỗ trợ trích xuất file.'); error.code = 'AI_CONFIGURATION_ERROR'; throw error; }
        const prompt = buildEssayFileExtractionPrompt(fileName);
        const result = await gemini.extract({ ...prompt, schema: ESSAY_FILE_EXTRACTION_SCHEMA, file, signal });
        return { ...validateEssayFileExtraction(result.value), provider: 'gemini', model: result.model, usage: result.usage || {} };
      });
    },
  };
};
