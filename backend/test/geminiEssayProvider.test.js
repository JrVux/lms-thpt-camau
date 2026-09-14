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
