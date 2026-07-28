const GRADE_CATEGORY = Object.freeze({
  10: 'grade_10',
  11: 'grade_11',
  12: 'grade_12',
});

export const categoryForGrade = (grade) => GRADE_CATEGORY[String(grade)];

export const eligibleTargetClasses = (assignment, classes) =>
  classes.filter((classItem) => assignment.category === 'advanced'
    ? classItem.subject === assignment.type
    : categoryForGrade(classItem.grade) === assignment.category
      && classItem.subject === assignment.type);
