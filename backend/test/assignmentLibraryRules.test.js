import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY_GRADE,
  eligibleClassesForAssignment,
  validateDeliveryTargets,
} from '../src/services/assignmentLibraryRules.js';

const classes = [
  { id: '10a1', grade: '10', subject: 'python' },
  { id: '10a2', grade: '10', subject: 'sql' },
  { id: '11a1', grade: '11', subject: 'python' },
];

test('maps the three grade categories exactly', () => {
  assert.deepEqual(CATEGORY_GRADE, {
    grade_10: '10',
    grade_11: '11',
    grade_12: '12',
  });
});

test('returns only classes matching both grade and subject', () => {
  const eligible = eligibleClassesForAssignment(
    { category: 'grade_10', type: 'python' },
    classes
  );

  assert.deepEqual(eligible.map((item) => item.id), ['10a1']);
});

test('advanced assignments match subject without restricting grade', () => {
  const eligible = eligibleClassesForAssignment(
    { category: 'advanced', type: 'python' },
    classes
  );

  assert.deepEqual(eligible.map((item) => item.id), ['10a1', '11a1']);
});

test('rejects selected mode without any selected student', () => {
  assert.throws(
    () => validateDeliveryTargets(
      { category: 'grade_10', type: 'python' },
      [{ class_id: '10a1', recipient_mode: 'selected', student_ids: [] }],
      new Map(classes.map((item) => [item.id, item])),
      new Map([['10a1', new Set(['student-1'])]])
    ),
    { message: 'Vui lòng chọn ít nhất một học sinh cho lớp đã chỉ định.' }
  );
});

test('rejects a selected student who is not enrolled in the class', () => {
  assert.throws(
    () => validateDeliveryTargets(
      { category: 'grade_10', type: 'python' },
      [{ class_id: '10a1', recipient_mode: 'selected', student_ids: ['student-2'] }],
      new Map(classes.map((item) => [item.id, item])),
      new Map([['10a1', new Set(['student-1'])]])
    ),
    { message: 'Danh sách chỉ định có học sinh không thuộc lớp.' }
  );
});

test('rejects duplicate target classes', () => {
  assert.throws(
    () => validateDeliveryTargets(
      { category: 'grade_10', type: 'python' },
      [
        { class_id: '10a1', recipient_mode: 'all' },
        { class_id: '10a1', recipient_mode: 'all' },
      ],
      new Map(classes.map((item) => [item.id, item])),
      new Map()
    ),
    { message: 'Mỗi lớp chỉ được cấu hình một lần.' }
  );
});

test('all mode ignores an empty student list', () => {
  assert.doesNotThrow(() => validateDeliveryTargets(
    { category: 'grade_10', type: 'python' },
    [{ class_id: '10a1', recipient_mode: 'all', student_ids: [] }],
    new Map(classes.map((item) => [item.id, item])),
    new Map()
  ));
});
