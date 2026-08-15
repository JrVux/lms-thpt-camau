import { AIConfigurationError, AIProviderError } from '../../services/aiGateway.js';

export const createOpenRouterProvider = ({ apiKey, model, fetchImpl = fetch } = {}) => {
  const resolvedModel = model || process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b:free';
  const resolvedKey = apiKey || process.env.OPENROUTER_API_KEY;
  return {
    isConfigured: Boolean(resolvedKey && resolvedModel),
    async generateStructured({ system, user, signal }) {
      if (!resolvedKey || !resolvedModel) throw new AIConfigurationError('Thiếu cấu hình OpenRouter.');
      const response = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST', signal,
        headers: { Authorization: `Bearer ${resolvedKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: resolvedModel, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
      });
      if (!response.ok) throw new AIProviderError(`OpenRouter HTTP ${response.status}`);
      const data = await response.json();
      return { value: JSON.parse(data.choices?.[0]?.message?.content || '{}'), usage: data.usage || {}, model: data.model || resolvedModel };
    },
  };
};
