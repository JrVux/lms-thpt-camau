import test from 'node:test';
import assert from 'node:assert/strict';

import { categoryForGrade, eligibleTargetClasses } from '../src/utils/assignmentLibrary.js';

test('maps grades to stable assignment categories', () => {
  assert.equal(categoryForGrade('10'), 'grade_10');
  assert.equal(categoryForGrade(11), 'grade_11');
  assert.equal(categoryForGrade('12'), 'grade_12');
});

test('filters grade assignments by grade and subject', () => {
  const classes = [
    { id: 'c1', grade: '10', subject: 'python' },
    { id: 'c2', grade: '10', subject: 'sql' },
    { id: 'c3', grade: '11', subject: 'python' },
  ];
  assert.deepEqual(
    eligibleTargetClasses({ category: 'grade_10', type: 'python' }, classes).map((item) => item.id),
    ['c1']
  );
});

test('advanced assignments filter only by subject without mutating classes', () => {
  const classes = [
    { id: 'c1', grade: '10', subject: 'html' },
    { id: 'c2', grade: '12', subject: 'html' },
    { id: 'c3', grade: '12', subject: 'sql' },
  ];
  const snapshot = structuredClone(classes);
  assert.deepEqual(
    eligibleTargetClasses({ category: 'advanced', type: 'html' }, classes).map((item) => item.id),
    ['c1', 'c2']
  );
  assert.deepEqual(classes, snapshot);
});
