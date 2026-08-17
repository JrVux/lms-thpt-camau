export const AIConfigurationError = class extends Error {
  constructor(m) { super(m); this.code = 'AI_CONFIGURATION_ERROR'; }
};
export const AIProviderError = class extends Error {
  constructor(m) { super(m); this.code = 'AI_PROVIDER_ERROR'; }
};

const runWithTimeout = async (provider, method, args, timeoutMs) => {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);
  try {
    return await provider[method]({ ...args, signal: c.signal });
  } catch (e) {
    if (e.name === 'AbortError') throw new AIProviderError('AI quá thời gian.');
    throw e;
  } finally {
    clearTimeout(t);
  }
};

export const createPythonAiGateway = ({ openRouter, gemini, timeoutMs = 120000 }) => ({
  async generateChat({ system, user }) {
    const providers = [
      { name: 'openrouter', p: openRouter },
      { name: 'gemini', p: gemini },
    ];
    for (const { name, p } of providers) {
      if (p?.isConfigured === false) continue;
      try {
        const result = await runWithTimeout(p, 'generateChat', { system, user }, timeoutMs);
        return { content: result.content, provider: name, usage: result.usage };
      } catch (e) {
        if (e instanceof AIConfigurationError) continue;
        throw e;
      }
    }
    throw new AIConfigurationError('Thiếu cấu hình AI provider.');
  },
  async generateStructured({ system, user }) {
    const providers = [
      { name: 'openrouter', p: openRouter },
      { name: 'gemini', p: gemini },
    ];
    for (const { name, p } of providers) {
      if (p?.isConfigured === false) continue;
      try {
        return await runWithTimeout(p, 'generateStructured', { system, user }, timeoutMs);
      } catch (e) {
        if (e instanceof AIConfigurationError) continue;
        throw e;
      }
    }
    throw new AIConfigurationError('Thiếu cấu hình AI provider.');
  },
});