import { cleanAndParseJson } from '../utils/parseJson.js';

export const createGeminiEssayProvider = ({ apiKey, model, fetchImpl = fetch } = {}) => {
  const resolvedKey = apiKey || process.env.GEMINI_API_KEY;
  const resolvedModel = model || process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  return {
    isConfigured: Boolean(resolvedKey && resolvedModel),
    async grade({ system, user, schema, file, signal }) {
      if (!resolvedKey) { const error = new Error('Thiếu cấu hình Gemini.'); error.code = 'AI_CONFIGURATION_ERROR'; throw error; }
      const parts = file ? [{ inline_data: { mime_type: file.mimeType, data: file.base64 } }, { text: user }] : [{ text: user }];
      const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(resolvedModel)}:generateContent`, {
        method: 'POST', signal,
        headers: { 'x-goog-api-key': resolvedKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', responseSchema: schema } }),
      });
      if (!response.ok) { const error = new Error(`Gemini HTTP ${response.status}`); error.code = 'AI_PROVIDER_ERROR'; throw error; }
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '{}';
      return { value: cleanAndParseJson(text), model: resolvedModel, usage: { input_tokens: data.usageMetadata?.promptTokenCount, output_tokens: data.usageMetadata?.candidatesTokenCount } };
    },
  };
};
