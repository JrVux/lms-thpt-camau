import test from 'node:test';
import assert from 'node:assert/strict';
import { validateStudentAnalysis, StudentAnalysisValidationError } from '../src/ai/studentAnalysisValidator.js';
import { STUDENT_ANALYSIS_SCHEMA_VERSION } from '../src/ai/studentAnalysisSchema.js';

const allowed = ['E01', 'E02', 'E03', 'E04'];

const validTeacher = () => ({
  summary: 'Học sinh nắm bắt vòng lặp cơ bản.',
  strengths: [
    { text: 'Viết vòng lặp đúng', evidence_refs: ['E01'], confidence: 'high' },
    { text: 'Hiểu biến', evidence_refs: ['E02'], confidence: 'medium' },
  ],
  reinforcement_areas: [
    { text: 'Lỗi biên', evidence_refs: ['E03'], confidence: 'medium' },
    { text: 'Hardcode', evidence_refs: ['E04'], confidence: 'low' },
  ],
  common_errors: [{ error: 'Sai biên', possible_knowledge_cause: 'Chưa hiểu chỉ số' }],
  trend_interpretation: 'Đang tiến bộ.',
  insufficient_evidence: ['Chưa đủ để kết luận về hàm.'],
  priority_goals: [
    { goal: 'Luyện bài biên', evidence_refs: ['E03'] },
    { goal: 'Luyện hardcode', evidence_refs: ['E04'] },
  ],
  warnings: '',
});

const validStudent = () => ({
  doing_well: 'Em làm được vòng lặp.',
  practice_more: 'Em luyện thêm bài biên.',
  two_week_goals: 'Vượt qua lỗi biên.',
  steps: ['Xem ví dụ', 'Làm bài 1', 'Làm bài 2'],
});

const validFixture = () => ({ teacher_report: validTeacher(), student_report: validStudent() });

test('accepts a valid analysis fixture', () => {
  const result = validateStudentAnalysis(validFixture(), allowed);
  assert.equal(result.schema_version, STUDENT_ANALYSIS_SCHEMA_VERSION);
  assert.equal(result.teacher_report.strengths.length, 2);
});

test('rejects unknown evidence ref', () => {
  const fixture = validFixture();
  fixture.teacher_report.strengths[0].evidence_refs = ['E99'];
  assert.throws(() => validateStudentAnalysis(fixture, allowed), /E99/);
});

test('rejects more than four strengths', () => {
  const fixture = validFixture();
  fixture.teacher_report.strengths.push({ text: 'x', evidence_refs: ['E01'], confidence: 'low' });
  fixture.teacher_report.strengths.push({ text: 'y', evidence_refs: ['E02'], confidence: 'low' });
  fixture.teacher_report.strengths.push({ text: 'z', evidence_refs: ['E03'], confidence: 'low' });
  assert.throws(() => validateStudentAnalysis(fixture, allowed), /strengths/);
});

test('rejects empty required text', () => {
  const fixture = validFixture();
  fixture.teacher_report.summary = '';
  assert.throws(() => validateStudentAnalysis(fixture, allowed), /summary/);
});

test('rejects banned trait claims', () => {
  const fixture = validFixture();
  fixture.teacher_report.summary = 'Học sinh rất thông minh và chăm chỉ.';
  assert.throws(() => validateStudentAnalysis(fixture, allowed), /thái độ/);
});

test('rejects a string with PII', () => {
  const fixture = validFixture();
  fixture.teacher_report.warnings = 'email: a@b.com';
  assert.throws(() => validateStudentAnalysis(fixture, allowed), /định danh/);
});

test('parses a JSON string input', () => {
  const result = validateStudentAnalysis(JSON.stringify(validFixture()), allowed);
  assert.ok(result.teacher_report);
});
