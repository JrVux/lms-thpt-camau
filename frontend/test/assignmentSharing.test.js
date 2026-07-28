import test from 'node:test';
import assert from 'node:assert/strict';
import { getEligibleTargetClasses } from '../src/utils/assignmentSharing.js';

test('returns only other classes in the same grade', () => {
  const classes = [
    { id: 'source', name: '10A1', grade: '10' },
    { id: 'same-grade-string', name: '10A2', grade: '10' },
    { id: 'same-grade-number', name: '10A3', grade: 10 },
    { id: 'other-grade', name: '11A1', grade: '11' },
  ];

  assert.deepEqual(
    getEligibleTargetClasses(classes, 'source').map((item) => item.id),
    ['same-grade-string', 'same-grade-number']
  );
});

test('returns an empty list when the source class is unavailable', () => {
  assert.deepEqual(
    getEligibleTargetClasses([{ id: 'class-a', grade: '10' }], 'missing'),
    []
  );
});

test('does not mutate the class list', () => {
  const classes = [
    { id: 'source', grade: '10' },
    { id: 'target', grade: '10' },
  ];
  const snapshot = structuredClone(classes);

  getEligibleTargetClasses(classes, 'source');

  assert.deepEqual(classes, snapshot);
});
