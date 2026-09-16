import test from 'node:test';
import assert from 'node:assert/strict';
import { createGeminiEssayProvider } from '../src/ai/providers/geminiEssayProvider.js';
import { ESSAY_GRADING_SCHEMA } from '../src/ai/essayGradingSchema.js';

test('sends inline image and response schema', async () => {
  let request;
  const provider = createGeminiEssayProvider({ apiKey: 'key', model: 'gemini-test', fetchImpl: async (url, init) => {
    request = { url, body: JSON.parse(init.body) };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }], usageMetadata: {} }) };
  } });
  await provider.grade({ system: 'system', user: 'user', schema: ESSAY_GRADING_SCHEMA, file: { mimeType: 'image/jpeg', base64: 'AA==' } });
  assert.equal(request.body.contents[0].parts[0].inline_data.mime_type, 'image/jpeg');
  assert.equal(request.body.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(request.body.generationConfig.responseSchema, ESSAY_GRADING_SCHEMA);
});

test('sends a single vision file for extraction without grading content', async () => {
  let request;
  const provider = createGeminiEssayProvider({ apiKey: 'key', model: 'gemini-test', fetchImpl: async (_url, init) => {
    request = JSON.parse(init.body);
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"extracted_text":"Bài","extraction_quality":"sufficient","extraction_warnings":[]}' }] } }], usageMetadata: {} }) };
  } });
  await provider.extract({
    system: 'Chỉ trích xuất', user: 'File: trang-1.jpg',
    schema: { type: 'object' }, file: { mimeType: 'image/jpeg', base64: 'AA==' },
  });
  assert.equal(request.contents[0].parts.length, 2);
  assert.equal(request.contents[0].parts[0].inline_data.mime_type, 'image/jpeg');
  assert.match(request.contents[0].parts[1].text, /trang-1\.jpg/);
});

test('serializes Gemini calls and spaces request starts', async () => {
  let clock = 0;
  const starts = [];
  const provider = createGeminiEssayProvider({
    apiKey: 'key',
    model: 'gemini-test',
    minRequestIntervalMs: 4000,
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
    fetchImpl: async () => {
      starts.push(clock);
      return {
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
          usageMetadata: {},
        }),
      };
    },
  });

  await Promise.all([
    provider.grade({ system: 's', user: 'u1', schema: { type: 'object' } }),
    provider.extract({ system: 's', user: 'u2', schema: { type: 'object' } }),
  ]);

  assert.deepEqual(starts, [0, 4000]);
});

test('maps 429 to a shared Retry-After cooldown', async () => {
  let clock = 0;
  const starts = [];
  let calls = 0;
  const provider = createGeminiEssayProvider({
    apiKey: 'key',
    model: 'gemini-test',
    minRequestIntervalMs: 4000,
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
    fetchImpl: async () => {
      starts.push(clock);
      calls += 1;
      if (calls === 1) {
        return {
          ok: false,
          status: 429,
          headers: { get: (name) => name.toLowerCase() === 'retry-after' ? '43' : null },
          json: async () => ({ error: { status: 'RESOURCE_EXHAUSTED' } }),
        };
      }
      return {
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }),
      };
    },
  });

  await assert.rejects(
    provider.grade({ system: 's', user: 'u1', schema: { type: 'object' } }),
    (error) => error.code === 'AI_RATE_LIMITED' && error.retryAfterMs === 43000,
  );
  await provider.grade({ system: 's', user: 'u2', schema: { type: 'object' } });

  assert.deepEqual(starts, [0, 43000]);
});
