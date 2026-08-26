import { buildStudentAnalysisPrompt, buildStudentAnalysisRepairPrompt } from '../ai/studentAnalysisPrompt.js';
import { validateStudentAnalysis, StudentAnalysisValidationError } from '../ai/studentAnalysisValidator.js';

export const isFallbackEligible = (error) =>
  error?.code === 'AI_PROVIDER_ERROR' ||
  error?.code === 'AI_ANALYSIS_INVALID' ||
  error?.status === 408 || error?.status === 429 || error?.status >= 500;

const run = async (provider, args, timeoutMs) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await provider.generateStructured({ ...args, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeout = new Error('AI quá thời gian.');
      timeout.code = 'AI_PROVIDER_ERROR';
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

export const createStudentAnalysisGateway = ({ gemini, deepseek, openRouter, timeoutMs = 90000 }) => ({
  async generate(bundle) {
    const allowedEvidenceIds = (bundle?.evidence ?? []).map((item) => item.evidence_id);
    const base = buildStudentAnalysisPrompt(bundle);
    let invalid = null;
    let issues = [];
    const attempts = [
      ['gemini', gemini, base, false],
      ['deepseek', deepseek, base, false],
      ['openrouter', openRouter, base, false],
      ['openrouter', openRouter, null, true],
    ];
    let lastError;
    let attemptedCount = 0;
    for (const [name, provider, prompt, repair] of attempts) {
      if (repair && !invalid) continue;
      if (!provider || provider?.isConfigured === false) continue;
      attemptedCount++;
      try {
        const request = repair
          ? buildStudentAnalysisRepairPrompt({ bundle, invalidOutput: invalid, issues })
          : prompt;
        const result = await run(provider, request, timeoutMs);
        const analysis = validateStudentAnalysis(result.value, allowedEvidenceIds);
        return { analysis, provider: name, model: result.model, usage: result.usage ?? {}, fallback_used: name !== 'gemini' };
      } catch (error) {
        if (error?.code === 'AI_CONFIGURATION_ERROR' || error?.name === 'AIConfigurationError') {
          throw error;
        }
        if (error instanceof StudentAnalysisValidationError) {
          invalid = error.candidate ?? null;
          issues = error.issues;
          const wrapped = new Error(error.message);
          wrapped.code = 'AI_ANALYSIS_INVALID';
          lastError = wrapped;
          continue;
        }
        if (!isFallbackEligible(error)) throw error;
        invalid = null;
        issues = [];
        lastError = error;
      }
    }
    if (attemptedCount === 0) {
      const configErr = new Error('Thiếu cấu hình API Key AI (GEMINI_API_KEY, DEEPSEEK_API_KEY hoặc OPENROUTER_API_KEY) trên máy chủ.');
      configErr.code = 'AI_CONFIGURATION_ERROR';
      throw configErr;
    }
    throw lastError || new Error('Không thể phân tích học sinh.');
  },
});
