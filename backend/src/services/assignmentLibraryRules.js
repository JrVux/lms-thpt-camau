export const CATEGORY_GRADE = Object.freeze({
  grade_10: '10',
  grade_11: '11',
  grade_12: '12',
});

export const eligibleClassesForAssignment = (assignment, classes) =>
  classes.filter((classItem) => assignment.category === 'advanced'
    ? classItem.subject === assignment.type
    : String(classItem.grade) === CATEGORY_GRADE[assignment.category]
      && classItem.subject === assignment.type);

const mapGet = (collection, key) => collection instanceof Map
  ? collection.get(key)
  : collection?.[key];

export const validateDeliveryTargets = (
  assignment,
  deliveries,
  classesById,
  studentsByClass
) => {
  if (!Array.isArray(deliveries) || deliveries.length === 0) {
    throw new Error('Vui lòng chọn ít nhất một lớp để giao bài.');
  }

  const seenClassIds = new Set();

  for (const delivery of deliveries) {
    const classId = delivery.class_id;
    if (seenClassIds.has(classId)) {
      throw new Error('Mỗi lớp chỉ được cấu hình một lần.');
    }
    seenClassIds.add(classId);

    const classItem = mapGet(classesById, classId);
    if (!classItem) {
      throw new Error('Không tìm thấy lớp được chọn.');
    }

    if (eligibleClassesForAssignment(assignment, [classItem]).length === 0) {
      throw new Error('Lớp được chọn không phù hợp với khối hoặc môn của bài tập.');
    }

    if (delivery.recipient_mode !== 'all' && delivery.recipient_mode !== 'selected') {
      throw new Error('Đối tượng nhận bài không hợp lệ.');
    }

    if (delivery.recipient_mode === 'all') {
      continue;
    }

    const studentIds = [...new Set(delivery.student_ids ?? [])];
    if (studentIds.length === 0) {
      throw new Error('Vui lòng chọn ít nhất một học sinh cho lớp đã chỉ định.');
    }

    const enrolledStudentIds = mapGet(studentsByClass, classId) ?? new Set();
    if (studentIds.some((studentId) => !enrolledStudentIds.has(studentId))) {
      throw new Error('Danh sách chỉ định có học sinh không thuộc lớp.');
    }
  }
};
