import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudentAnalysisGateway, isFallbackEligible } from '../src/services/studentAnalysisGateway.js';
import { StudentAnalysisValidationError } from '../src/ai/studentAnalysisValidator.js';

class AIProviderError extends Error { constructor(m) { super(m); this.code = 'AI_PROVIDER_ERROR'; } }
class AIConfigError extends Error { constructor(m) { super(m); this.code = 'AI_CONFIGURATION_ERROR'; } }

const validAnalysis = () => ({
  teacher_report: {
    summary: 'Tốt',
    strengths: [{ text: 'a', evidence_refs: ['E01'], confidence: 'high' }, { text: 'b', evidence_refs: ['E02'], confidence: 'medium' }],
    reinforcement_areas: [{ text: 'c', evidence_refs: ['E03'], confidence: 'medium' }, { text: 'd', evidence_refs: ['E04'], confidence: 'low' }],
    common_errors: [],
    trend_interpretation: 'ok',
    insufficient_evidence: [],
    priority_goals: [{ goal: 'g1', evidence_refs: ['E03'] }, { goal: 'g2', evidence_refs: ['E04'] }],
    warnings: '',
  },
  student_report: { doing_well: 'ok', practice_more: 'ok', two_week_goals: 'ok', steps: ['s1'] },
});

const bundle = { student_code: 'STUDENT_01', evidence: [{ evidence_id: 'E01' }, { evidence_id: 'E02' }, { evidence_id: 'E03' }, { evidence_id: 'E04' }] };
const calls = [];
const provider = (name) => ({
  async generateStructured() { calls.push(name); return { value: validAnalysis(), usage: { total: 1 }, model: `${name}-model` }; },
});

const providerError = (err) => ({
  async generateStructured() { calls.push('err'); throw err; },
});

const reset = () => { calls.length = 0; };

test('returns the first valid Gemini result without calling fallbacks', async () => {
  reset();
  const gateway = createStudentAnalysisGateway({ gemini: provider('gemini'), deepseek: provider('deepseek'), openRouter: provider('openrouter') });
  const result = await gateway.generate(bundle);
  assert.equal(result.provider, 'gemini');
  assert.deepEqual(calls, ['gemini']);
  assert.equal(result.fallback_used, false);
});

test('falls back to DeepSeek after Gemini failure', async () => {
  reset();
  const gateway = createStudentAnalysisGateway({ gemini: providerError(new AIProviderError('429')), deepseek: provider('deepseek'), openRouter: provider('openrouter') });
  const result = await gateway.generate(bundle);
  assert.equal(result.provider, 'deepseek');
  assert.equal(result.fallback_used, true);
  assert.deepEqual(calls, ['err', 'deepseek']);
});

test('falls back to OpenRouter after Gemini and DeepSeek failures', async () => {
  reset();
  const gateway = createStudentAnalysisGateway({ gemini: providerError(new AIProviderError('429')), deepseek: providerError(new AIProviderError('500')), openRouter: provider('openrouter') });
  const result = await gateway.generate(bundle);
  assert.equal(result.provider, 'openrouter');
  assert.equal(result.fallback_used, true);
  assert.deepEqual(calls, ['err', 'err', 'openrouter']);
});

test('does not fallback for missing configuration error', async () => {
  reset();
  const gateway = createStudentAnalysisGateway({ gemini: providerError(new AIConfigError('missing')), openRouter: provider('openrouter') });
  await assert.rejects(gateway.generate(bundle), (err) => err.code === 'AI_CONFIGURATION_ERROR');
  assert.equal(calls.length, 1);
});

test('aborts providers at the configured timeout', async () => {
  const slow = { async generateStructured({ signal }) { if (!signal) throw new Error('no signal'); await new Promise((resolve, reject) => { signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))); }); } };
  const gateway = createStudentAnalysisGateway({ gemini: slow, openRouter: slow, timeoutMs: 5 });
  await assert.rejects(gateway.generate(bundle), /quá thời gian/);
});

test('isFallbackEligible classifies errors', () => {
  assert.equal(isFallbackEligible(new AIProviderError('x')), true);
  assert.equal(isFallbackEligible({ code: 'AI_ANALYSIS_INVALID' }), true);
  assert.equal(isFallbackEligible({ status: 429 }), true);
  assert.equal(isFallbackEligible(new AIConfigError('x')), false);
  assert.equal(isFallbackEligible({ status: 403 }), false);
});
