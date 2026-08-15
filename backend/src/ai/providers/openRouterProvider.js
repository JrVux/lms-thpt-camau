import { AIConfigurationError, AIProviderError } from '../../services/aiGateway.js';

export const createOpenRouterProvider = ({ apiKey, model, fetchImpl = fetch }) => ({
  async generateStructured({ system, user, signal }) {
    if (!apiKey || !model) throw new AIConfigurationError('Thiếu cấu hình OpenRouter.');
    const response = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    });
    if (!response.ok) throw new AIProviderError(`OpenRouter HTTP ${response.status}`);
    const data = await response.json();
    return { value: JSON.parse(data.choices?.[0]?.message?.content || '{}'), usage: data.usage || {}, model: data.model || model };
  },
});
