const GRADE_CATEGORY = Object.freeze({
  10: 'grade_10',
  11: 'grade_11',
  12: 'grade_12',
});

export const categoryForGrade = (grade) => GRADE_CATEGORY[String(grade)];

export const eligibleTargetClasses = (assignment, classes = []) =>
  classes.filter((classItem) => {
    const isFileSub = ['practice_file', 'essay'].includes(assignment.submission_type);
    const subjectMatch = isFileSub || !assignment.type || assignment.type === 'general' || classItem.subject === assignment.type;
    return assignment.category === 'advanced'
      ? subjectMatch
      : (categoryForGrade(classItem.grade) === assignment.category || !assignment.category) && subjectMatch;
  });
