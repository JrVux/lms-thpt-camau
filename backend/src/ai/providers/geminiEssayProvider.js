import { cleanAndParseJson } from '../utils/parseJson.js';

const DEFAULT_INTERVAL_MS = 4000;
const DEFAULT_RETRY_AFTER_MS = 60000;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseRetryAfterMs = (response, body) => {
  const retryAfterHeader = response.headers?.get?.('retry-after');
  if (retryAfterHeader !== null && retryAfterHeader !== undefined && String(retryAfterHeader).trim() !== '') {
    const headerSeconds = Number(retryAfterHeader);
    if (Number.isFinite(headerSeconds) && headerSeconds >= 0) return headerSeconds * 1000;
  }
  const match = String(body?.error?.message || '').match(/retry in\s+([0-9.]+)s/i);
  if (match) return Math.ceil(Number(match[1]) * 1000);
  return DEFAULT_RETRY_AFTER_MS;
};

export const createGeminiEssayProvider = ({
  apiKey,
  model,
  fetchImpl = fetch,
  minRequestIntervalMs,
  now = () => Date.now(),
  sleep = wait,
} = {}) => {
  const resolvedKey = apiKey || process.env.GEMINI_API_KEY;
  const resolvedModel = model || process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  const configuredInterval = minRequestIntervalMs ?? Number(process.env.GEMINI_ESSAY_MIN_REQUEST_INTERVAL_MS);
  const intervalMs = Number.isFinite(configuredInterval) && configuredInterval >= 0
    ? configuredInterval
    : DEFAULT_INTERVAL_MS;
  let chain = Promise.resolve();
  let nextRequestAt = 0;
  let cooldownUntil = 0;

  const schedule = (operation) => {
    const run = async () => {
      const currentTime = now();
      const delay = Math.max(0, nextRequestAt - currentTime, cooldownUntil - currentTime);
      if (delay) await sleep(delay);
      const startedAt = now();
      nextRequestAt = startedAt + intervalMs;
      return operation();
    };
    const result = chain.then(run, run);
    chain = result.catch(() => undefined);
    return result;
  };

  const generateJson = async ({ system, user, schema, file, signal }) => {
    if (!resolvedKey) { const error = new Error('Thiếu cấu hình Gemini.'); error.code = 'AI_CONFIGURATION_ERROR'; throw error; }
    return schedule(async () => {
      const parts = file ? [{ inline_data: { mime_type: file.mimeType, data: file.base64 } }, { text: user }] : [{ text: user }];
      const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(resolvedModel)}:generateContent`, {
        method: 'POST', signal,
        headers: { 'x-goog-api-key': resolvedKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', responseSchema: schema } }),
      });
      if (!response.ok) {
        let body = null;
        try { body = await response.json(); } catch { /* provider body is optional */ }
        if (response.status === 429) {
          const retryAfterMs = parseRetryAfterMs(response, body);
          cooldownUntil = Math.max(cooldownUntil, now() + retryAfterMs);
          const error = new Error('Gemini rate limit exceeded.');
          error.code = 'AI_RATE_LIMITED';
          error.retryAfterMs = retryAfterMs;
          throw error;
        }
        const error = new Error(`Gemini HTTP ${response.status}`);
        error.code = 'AI_PROVIDER_ERROR';
        throw error;
      }
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '{}';
      return { value: cleanAndParseJson(text), model: resolvedModel, usage: { input_tokens: data.usageMetadata?.promptTokenCount, output_tokens: data.usageMetadata?.candidatesTokenCount } };
    });
  };
  return {
    isConfigured: Boolean(resolvedKey && resolvedModel),
    grade: generateJson,
    extract: generateJson,
  };
};
