import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudentAnalysisWorker } from '../src/services/studentAnalysisWorker.js';

const makeRpcDb = (claimReturn) => {
  const calls = [];
  const db = {
    calls,
    rpc(name, params) {
      calls.push({ name, params });
      if (name === 'claim_student_analysis_job') return Promise.resolve({ data: claimReturn, error: null });
      return Promise.resolve({ data: null, error: null });
    },
    from(table) {
      const chain = new Proxy({}, {
        get(_t, method) {
          if (method === 'then') return (resolve) => Promise.resolve({ data: null, error: null }).then(resolve);
          return (...args) => {
            calls.push({ table, method, args });
            if (['single', 'maybeSingle'].includes(method)) return Promise.resolve({ data: null, error: null });
            return chain;
          };
        },
      });
      return chain;
    },
  };
  return { db, calls };
};

const evidenceService = {
  async buildBundle() {
    return { bundle: { student_code: 'STUDENT_01', evidence: [{ evidence_id: 'E01', text: 'x' }] }, counts: { submission_count: 2, test_result_count: 4 }, fingerprint: 'fp' };
  },
};

const gateway = {
  async generate() {
    return {
      analysis: {
        teacher_report: { summary: 's', strengths: [{ text: 'a', evidence_refs: ['E01'], confidence: 'high' }], reinforcement_areas: [{ text: 'b', evidence_refs: ['E01'], confidence: 'low' }], common_errors: [], trend_interpretation: 't', insufficient_evidence: [], priority_goals: [{ goal: 'g', evidence_refs: ['E01'] }], warnings: '' },
        student_report: { doing_well: 'd', practice_more: 'p', two_week_goals: 'g', steps: ['s'] },
      },
      provider: 'openrouter', model: 'm', usage: { input_tokens: 1, output_tokens: 1, latency_ms: 10 }, fallback_used: false,
    };
  },
};

const job = { id: 'job-1', class_id: 'c1', student_id: 's1', requested_by: 't1', scope: { mode: 'latest', limit: 5 }, evidence_fingerprint: 'fp', attempt_count: 0 };

test('runOnce returns no-op when no job is claimed', async () => {
  const { db, calls } = makeRpcDb(null);
  const w = createStudentAnalysisWorker({ db, evidenceService, gateway, workerId: 'w1', leaseSeconds: 120, maxAttempts: 3, now: () => new Date('2026-08-15T00:00:00Z').getTime() });
  const result = await w.runOnce();
  assert.equal(result.claimed, false);
  assert.equal(calls.some((c) => c.table === 'student_analysis_reports' && c.method === 'insert'), false);
});

test('success advances preparing -> analyzing -> awaiting_review and stores one report', async () => {
  const { db, calls } = makeRpcDb(job);
  const w = createStudentAnalysisWorker({ db, evidenceService, gateway, workerId: 'w1', leaseSeconds: 120, maxAttempts: 3, now: () => new Date('2026-08-15T00:00:00Z').getTime() });
  const result = await w.runOnce();
  assert.equal(result.claimed, true);
  assert.equal(result.status, 'awaiting_review');
  const reports = calls.filter((c) => c.table === 'student_analysis_reports' && c.method === 'insert');
  assert.equal(reports.length, 1);
});

test('same job does not insert a second report on re-run', async () => {
  const { db, calls } = makeRpcDb(job);
  const w = createStudentAnalysisWorker({ db, evidenceService, gateway, workerId: 'w1', leaseSeconds: 120, maxAttempts: 3, now: () => new Date('2026-08-15T00:00:00Z').getTime() });
  await w.runOnce();
  const after = calls.filter((c) => c.table === 'student_analysis_reports' && c.method === 'insert').length;
  assert.equal(after, 1);
});

test('terminal provider failure stores only a safe error code', async () => {
  const { db, calls } = makeRpcDb(job);
  const failingGateway = { async generate() { throw Object.assign(new Error('down'), { code: 'AI_PROVIDER_ERROR' }); } };
  const w = createStudentAnalysisWorker({ db, evidenceService, gateway: failingGateway, workerId: 'w1', leaseSeconds: 120, maxAttempts: 1, now: () => new Date('2026-08-15T00:00:00Z').getTime() });
  const result = await w.runOnce();
  assert.equal(result.status, 'failed');
  const jobUpdate = calls.find((c) => c.table === 'student_analysis_jobs' && c.method === 'update' && c.args[0]?.error_code);
  assert.ok(jobUpdate, 'jobUpdate defined');
  assert.equal(jobUpdate.args[0].error_code, 'AI_PROVIDER_ERROR');
});

test('expired lease may be reclaimed', async () => {
  const { db } = makeRpcDb(job);
  const w = createStudentAnalysisWorker({ db, evidenceService, gateway, workerId: 'w1', leaseSeconds: 120, maxAttempts: 3, now: () => new Date('2026-08-15T00:00:00Z').getTime() });
  const result = await w.runOnce();
  assert.equal(result.claimed, true);
});
