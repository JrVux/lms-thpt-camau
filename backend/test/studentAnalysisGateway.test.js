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
const invalidProvider = (name) => ({
  async generateStructured() { calls.push(name); throw new StudentAnalysisValidationError(['bad']); },
});

const reset = () => { calls.length = 0; };

test('returns the first valid OpenRouter result without calling Gemini', async () => {
  reset();
  const gateway = createStudentAnalysisGateway({ openRouter: provider('openrouter'), gemini: provider('gemini') });
  const result = await gateway.generate(bundle);
  assert.equal(result.provider, 'openrouter');
  assert.deepEqual(calls, ['openrouter']);
  assert.equal(result.fallback_used, false);
});

test('repairs invalid OpenRouter output once before fallback', async () => {
  reset();
  const bad = new StudentAnalysisValidationError(['bad']); bad.candidate = { teacher_report: {}, student_report: {} };
  const open = { async generateStructured() { calls.push('openrouter'); if (calls.filter((c) => c === 'openrouter').length === 1) throw bad; return { value: validAnalysis(), usage: {}, model: 'or' }; } };
  const gateway = createStudentAnalysisGateway({ openRouter: open, gemini: provider('gemini') });
  const result = await gateway.generate(bundle);
  assert.equal(result.provider, 'openrouter');
  assert.deepEqual(calls, ['openrouter', 'openrouter']);
});

test('falls back to Gemini after retryable OpenRouter failures', async () => {
  reset();
  const gateway = createStudentAnalysisGateway({ openRouter: providerError(new AIProviderError('429')), gemini: provider('gemini') });
  const result = await gateway.generate(bundle);
  assert.equal(result.provider, 'gemini');
  assert.equal(result.fallback_used, true);
});

test('does not fallback for invalid teacher input or missing configuration', async () => {
  reset();
  const gateway = createStudentAnalysisGateway({ openRouter: providerError(new AIConfigError('missing')), gemini: provider('gemini') });
  await assert.rejects(gateway.generate(bundle), (err) => err.code === 'AI_CONFIGURATION_ERROR');
  assert.equal(calls.length, 1);
});

test('aborts providers at the configured timeout', async () => {
  const slow = { async generateStructured({ signal }) { if (!signal) throw new Error('no signal'); await new Promise((resolve, reject) => { signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))); }); } };
  const gateway = createStudentAnalysisGateway({ openRouter: slow, gemini: slow, timeoutMs: 5 });
  await assert.rejects(gateway.generate(bundle), /quá thời gian/);
});

test('isFallbackEligible classifies errors', () => {
  assert.equal(isFallbackEligible(new AIProviderError('x')), true);
  assert.equal(isFallbackEligible({ code: 'AI_ANALYSIS_INVALID' }), true);
  assert.equal(isFallbackEligible({ status: 429 }), true);
  assert.equal(isFallbackEligible(new AIConfigError('x')), false);
  assert.equal(isFallbackEligible({ status: 403 }), false);
});
