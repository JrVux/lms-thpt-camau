import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenRouterProvider } from '../src/ai/providers/openRouterProvider.js';
import { createGeminiProvider } from '../src/ai/providers/geminiProvider.js';

const schema = { type: 'object', additionalProperties: false, properties: { title: { type: 'string' } } };
const response = (data) => ({ ok: true, json: async () => data });

test('OpenRouter omits unsupported structured-output parameters', async () => {
  let body;
  const p = createOpenRouterProvider({
    apiKey: 'key', model: 'free-model',
    fetchImpl: async (_u, o) => (body = JSON.parse(o.body), response({ choices: [{ message: { content: '{"title":"A"}' } }], usage: {} }))
  });
  await p.generateStructured({ system: 's', user: 'u', schema });
  assert.equal(body.response_format, undefined);
  assert.equal(body.provider, undefined);
});

test('Gemini configures application/json responseMimeType without strict responseSchema', async () => {
  let body;
  const p = createGeminiProvider({
    apiKey: 'key', model: 'model',
    fetchImpl: async (_u, o) => (body = JSON.parse(o.body), response({ candidates: [{ content: { parts: [{ text: '{"title":"A"}' }] } }] }))
  });
  await p.generateStructured({ system: 's', user: 'u', schema });
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.equal(body.generationConfig.responseSchema?.additionalProperties, undefined);
});
