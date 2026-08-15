import { AIConfigurationError, AIProviderError } from '../../services/aiGateway.js';

const geminiSchema = (value) => {
  if (Array.isArray(value)) return value.map(geminiSchema);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'additionalProperties').map(([key, item]) => [key, geminiSchema(item)]));
};

export const createGeminiProvider = ({ apiKey, model, fetchImpl = fetch } = {}) => {
  const resolvedKey = apiKey || process.env.GEMINI_API_KEY;
  const rawModel = model || process.env.GEMINI_MODEL;
  const resolvedModel = (!rawModel || rawModel === 'Auto') ? 'gemini-2.5-flash' : rawModel;
  return {
    isConfigured: Boolean(resolvedKey && resolvedModel),
    async generateStructured({ system, user, schema, signal }) {
      if (!resolvedKey || !resolvedModel) throw new AIConfigurationError('Thiếu cấu hình Gemini.');
      const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(resolvedModel)}:generateContent`, {
        method: 'POST', signal, headers: { 'x-goog-api-key': resolvedKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: geminiSchema(schema) } }),
      });
      if (!response.ok) throw new AIProviderError(`Gemini HTTP ${response.status}`);
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '{}';
      return { value: JSON.parse(text), usage: { input_tokens: data.usageMetadata?.promptTokenCount, output_tokens: data.usageMetadata?.candidatesTokenCount }, model: resolvedModel };
    },
  };
};
