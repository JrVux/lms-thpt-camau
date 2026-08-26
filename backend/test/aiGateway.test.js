import test from 'node:test';
import assert from 'node:assert/strict';
import { createAIGateway, AIProviderError } from '../src/services/aiGateway.js';

const draft = {
  title: 'Tổng', type: 'python', grade: '10', difficulty: 2, description: 'Mô tả',
  starter_code: '# code', solution_code: 'print(3)', setup_sql: '',
  test_code: 'class TinhTong(PythonTestSuite):\n    inputs=["4"]\n    def afterRun(self):\n        expect(student_output).to_contain("10").with_options(points=10, test_name="Thuong")',
  max_score: 10,
  test_cases: [
    { test_name: 'Thuong', test_kind: 'normal', input_data: '1', expected_output: '1', points: 4 },
    { test_name: 'Bien', test_kind: 'boundary', input_data: '0', expected_output: '0', points: 3 },
    { test_name: 'Hardcode', test_kind: 'anti_hardcode', input_data: '2', expected_output: '2', points: 3 }
  ],
  competencies: []
};

const provider = (name, outcomes, calls) => ({
  generateStructured: async ({ repair }) => {
    calls.push(repair ? `${name}:repair` : name);
    const x = outcomes.shift();
    if (x instanceof Error) throw x;
    return { value: x, usage: { input_tokens: 1, output_tokens: 2 }, model: name + '-model' };
  }
});

test('uses Gemini first', async () => {
  const c = [];
  const g = createAIGateway({
    gemini: provider('gemini', [draft], c),
    deepseek: provider('deepseek', [draft], c),
    openRouter: provider('openrouter', [draft], c)
  });
  const res = await g.generateAssignment({ request: 'x' });
  assert.equal(res.provider, 'gemini');
  assert.equal(res.fallback_used, false);
  assert.deepEqual(c, ['gemini']);
});

test('falls back to DeepSeek when Gemini fails', async () => {
  const c = [];
  const g = createAIGateway({
    gemini: provider('gemini', [new AIProviderError('429')], c),
    deepseek: provider('deepseek', [draft], c),
    openRouter: provider('openrouter', [draft], c)
  });
  const res = await g.generateAssignment({ request: 'x' });
  assert.equal(res.provider, 'deepseek');
  assert.equal(res.fallback_used, true);
  assert.deepEqual(c, ['gemini', 'deepseek']);
});

test('falls back to OpenRouter when Gemini and DeepSeek fail', async () => {
  const c = [];
  const g = createAIGateway({
    gemini: provider('gemini', [new AIProviderError('429')], c),
    deepseek: provider('deepseek', [new AIProviderError('500')], c),
    openRouter: provider('openrouter', [draft], c)
  });
  const res = await g.generateAssignment({ request: 'x' });
  assert.equal(res.provider, 'openrouter');
  assert.equal(res.fallback_used, true);
  assert.deepEqual(c, ['gemini', 'deepseek', 'openrouter']);
});
