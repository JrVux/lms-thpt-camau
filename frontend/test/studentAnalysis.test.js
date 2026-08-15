import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScopePayload, analysisStatusLabel, shouldPollAnalysis, effectiveTeacherReport, effectiveStudentReport, createEditableReport } from '../src/utils/studentAnalysis.js';

test('buildScopePayload default latest', () => {
  const payload = buildScopePayload({});
  assert.deepEqual(payload, { scope: { mode: 'latest', limit: 5 } });
});

test('buildScopePayload explicit latest limit', () => {
  const payload = buildScopePayload({ mode: 'latest', limit: 10 });
  assert.deepEqual(payload, { scope: { mode: 'latest', limit: 10 } });
});

test('buildScopePayload date range', () => {
  const payload = buildScopePayload({ mode: 'dates', from: '2026-08-01', to: '2026-08-31' });
  assert.deepEqual(payload, { scope: { mode: 'dates', from: '2026-08-01', to: '2026-08-31' } });
});

test('analysisStatusLabel covers all statuses', () => {
  const statuses = ['queued', 'preparing_evidence', 'analyzing', 'awaiting_review', 'approved_internal', 'published', 'failed', 'rejected', 'stale', 'withdrawn'];
  for (const s of statuses) {
    assert.ok(analysisStatusLabel(s), `Missing label for ${s}`);
  }
});

test('shouldPollAnalysis true for active statuses', () => {
  assert.ok(shouldPollAnalysis('queued'));
  assert.ok(shouldPollAnalysis('preparing_evidence'));
  assert.ok(shouldPollAnalysis('analyzing'));
});

test('shouldPollAnalysis false for terminal statuses', () => {
  assert.ok(!shouldPollAnalysis('awaiting_review'));
  assert.ok(!shouldPollAnalysis('approved_internal'));
  assert.ok(!shouldPollAnalysis('published'));
  assert.ok(!shouldPollAnalysis('failed'));
  assert.ok(!shouldPollAnalysis('rejected'));
  assert.ok(!shouldPollAnalysis('stale'));
  assert.ok(!shouldPollAnalysis('withdrawn'));
});

test('effectiveTeacherReport prefers edited over AI', () => {
  const report = { ai_teacher_report: { summary: 'ai' }, edited_teacher_report: { summary: 'edited' } };
  assert.deepEqual(effectiveTeacherReport(report), { summary: 'edited' });
});

test('effectiveTeacherReport falls back to AI', () => {
  const report = { ai_teacher_report: { summary: 'ai' } };
  assert.deepEqual(effectiveTeacherReport(report), { summary: 'ai' });
});

test('effectiveStudentReport prefers edited over AI', () => {
  const report = { ai_student_report: { doing_well: 'ai' }, edited_student_report: { doing_well: 'edited' } };
  assert.deepEqual(effectiveStudentReport(report), { doing_well: 'edited' });
});

test('effectiveStudentReport falls back to AI', () => {
  const report = { ai_student_report: { doing_well: 'ai' } };
  assert.deepEqual(effectiveStudentReport(report), { doing_well: 'ai' });
});

test('createEditableReport deep clones and preserves AI originals', () => {
  const report = { ai_teacher_report: { summary: 'ai' }, ai_student_report: { doing_well: 'ai' } };
  const editable = createEditableReport(report);
  editable.teacher_report.summary = 'edited';
  editable.student_report.doing_well = 'edited';
  assert.deepEqual(report.ai_teacher_report, { summary: 'ai' });
  assert.deepEqual(report.ai_student_report, { doing_well: 'ai' });
  assert.deepEqual(editable.teacher_report, { summary: 'edited' });
  assert.deepEqual(editable.student_report, { doing_well: 'edited' });
});