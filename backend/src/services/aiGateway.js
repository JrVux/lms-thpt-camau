import { ASSIGNMENT_DRAFT_SCHEMA } from '../ai/assignmentDraftSchema.js';
import { validateAndNormalizeDraft, AssignmentDraftValidationError } from '../ai/assignmentDraftValidator.js';
import { buildAssignmentPrompt, buildRepairPrompt } from '../ai/btcodehsPrompt.js';

export class AIConfigurationError extends Error { constructor(m) { super(m); this.code = 'AI_CONFIGURATION_ERROR'; } }
export class AIProviderError extends Error { constructor(m) { super(m); this.code = 'AI_PROVIDER_ERROR'; } }

const run = async (provider, args, timeoutMs) => {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);
  try {
    return await provider.generateStructured({ ...args, signal: c.signal });
  } catch (e) {
    if (e.name === 'AbortError') throw new AIProviderError('AI quá thời gian.');
    throw e;
  } finally {
    clearTimeout(t);
  }
};

export const createAIGateway = ({ gemini, deepseek, openRouter, timeoutMs = 90000 }) => ({
  async generateAssignment(input) {
    const base = buildAssignmentPrompt(input);
    let invalid = null, issues = [];
    const attempts = [
      ['gemini', gemini, base, false],
      ['deepseek', deepseek, base, false],
      ['openrouter', openRouter, base, false],
      ['openrouter', openRouter, null, true],
    ];
    let last;
    let attemptedCount = 0;
    for (const [name, p, prompt, repair] of attempts) {
      if (repair && !invalid) continue;
      if (!p || p?.isConfigured === false) continue;
      attemptedCount++;
      try {
        const q = repair ? buildRepairPrompt({ input, invalidOutput: invalid, issues }) : prompt;
        const result = await run(p, { ...q, schema: ASSIGNMENT_DRAFT_SCHEMA, repair }, timeoutMs);
        try {
          const checked = validateAndNormalizeDraft(result.value, input.subject);
          return { ...checked, provider: name, model: result.model, usage: result.usage, fallback_used: name !== 'gemini' };
        } catch (e) {
          if (!(e instanceof AssignmentDraftValidationError)) throw e;
          invalid = result.value; issues = e.issues; last = e;
        }
      } catch (e) {
        if (e instanceof AIConfigurationError) { last = e; continue; }
        last = e;
      }
    }
    if (attemptedCount === 0) {
      throw new AIConfigurationError('Thiếu cấu hình API Key AI (GEMINI_API_KEY, DEEPSEEK_API_KEY hoặc OPENROUTER_API_KEY) trên máy chủ.');
    }
    throw last || new AIProviderError('Không thể tạo bài.');
  }
});
