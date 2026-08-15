import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeMappings,
  validateCompetencyScope,
  validateMappings,
} from '../src/services/competencyRules.js';

test('normalizes identifiers and numeric mapping fields', () => {
  assert.deepEqual(normalizeMappings([{
    competency_id: ' c1 ', assignment_id: ' a1 ', test_case_id: '',
    difficulty: '3', weight: '1.5', status: 'approved',
  }]), [{
    competency_id: 'c1', assignment_id: 'a1', test_case_id: null,
    difficulty: 3, weight: 1.5, status: 'approved',
  }]);
});

test('rejects a test mapping that does not belong to the assignment', () => {
  assert.throws(() => validateMappings({
    teacherId: 't1',
    assignment: { id: 'a1', type: 'python', category: 'grade_10', test_cases: [{ id: 't1' }] },
    competencies: [{ id: 'c1', subject: 'python', grade: '10', is_active: true, owner_teacher_id: null }],
    mappings: [{ assignment_id: 'a1', test_case_id: 'missing', competency_id: 'c1', difficulty: 2, weight: 1, status: 'approved' }],
  }), /không thuộc bài/);
});

test('rejects cross-subject competency mappings', () => {
  assert.throws(() => validateMappings({
    teacherId: 't1',
    assignment: { id: 'a1', type: 'python', category: 'grade_10', test_cases: [{ id: 't1' }] },
    competencies: [{ id: 'sql1', subject: 'sql', grade: '11', is_active: true, owner_teacher_id: null }],
    mappings: [{ assignment_id: 'a1', test_case_id: 't1', competency_id: 'sql1', difficulty: 2, weight: 1, status: 'approved' }],
  }), /không phù hợp môn/);
});

test('rejects duplicate competency and test pairs', () => {
  const base = { assignment_id: 'a1', test_case_id: 't1', competency_id: 'c1', difficulty: 2, weight: 1, status: 'approved' };
  assert.throws(() => validateMappings({
    teacherId: 't1',
    assignment: { id: 'a1', type: 'python', category: 'grade_10', test_cases: [{ id: 't1' }] },
    competencies: [{ id: 'c1', subject: 'python', grade: '10', is_active: true, owner_teacher_id: null }],
    mappings: [base, base],
  }), /bị trùng/);
});

test('rejects a competency owned by another teacher', () => {
  assert.throws(() => validateCompetencyScope({
    competency: { owner_teacher_id: 't2', subject: 'python', grade: '10', is_active: true },
    teacherId: 't1', subject: 'python', grade: '10',
  }), /không có quyền/);
});

test('accepts active standard and teacher-owned competencies in scope', () => {
  assert.doesNotThrow(() => validateMappings({
    teacherId: 't1',
    assignment: { id: 'a1', type: 'python', category: 'grade_10', test_cases: [{ id: 't1' }] },
    competencies: [
      { id: 'c1', subject: 'python', grade: '10', is_active: true, owner_teacher_id: null },
      { id: 'c2', subject: 'python', grade: '10', is_active: true, owner_teacher_id: 't1' },
    ],
    mappings: [
      { assignment_id: 'a1', test_case_id: 't1', competency_id: 'c1', difficulty: 2, weight: 1, status: 'approved' },
      { assignment_id: 'a1', test_case_id: null, competency_id: 'c2', difficulty: 3, weight: 0.5, status: 'proposed' },
    ],
  }));
});
