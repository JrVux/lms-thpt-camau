const allowedStatuses = new Set(['proposed', 'approved', 'rejected']);
const gradeByCategory = {
  grade_10: '10',
  grade_11: '11',
  grade_12: '12',
};

export const normalizeMappings = (rows = []) => rows.map((row) => ({
  competency_id: String(row.competency_id ?? '').trim(),
  assignment_id: String(row.assignment_id ?? '').trim(),
  test_case_id: String(row.test_case_id ?? '').trim() || null,
  difficulty: Number(row.difficulty),
  weight: Number(row.weight),
  status: row.status ?? 'proposed',
}));

export const validateCompetencyScope = ({ competency, teacherId, subject, grade }) => {
  if (!competency || !competency.is_active) {
    throw new Error('Kỹ năng không tồn tại hoặc đã ngừng sử dụng.');
  }
  if (competency.owner_teacher_id && competency.owner_teacher_id !== teacherId) {
    throw new Error('Bạn không có quyền sử dụng kỹ năng riêng của giáo viên khác.');
  }
  if (competency.subject !== subject) {
    throw new Error('Kỹ năng không phù hợp môn của bài tập.');
  }
  if (grade && competency.grade !== grade) {
    throw new Error('Kỹ năng không phù hợp khối của bài tập.');
  }
};

export const validateMappings = ({ mappings = [], assignment, competencies = [], teacherId }) => {
  if (!assignment) throw new Error('Không tìm thấy bài tập.');
  const tests = new Set((assignment.test_cases ?? []).map((testCase) => testCase.id));
  const competencyById = new Map(competencies.map((competency) => [competency.id, competency]));
  const seen = new Set();
  const grade = gradeByCategory[assignment.category] ?? null;

  for (const mapping of mappings) {
    if (mapping.assignment_id !== assignment.id) {
      throw new Error('Ánh xạ không thuộc bài tập đang chỉnh sửa.');
    }
    if (mapping.test_case_id && !tests.has(mapping.test_case_id)) {
      throw new Error('Test case được chọn không thuộc bài tập.');
    }
    if (!Number.isInteger(mapping.difficulty) || mapping.difficulty < 1 || mapping.difficulty > 5) {
      throw new Error('Độ khó phải là số nguyên từ 1 đến 5.');
    }
    if (!Number.isFinite(mapping.weight) || mapping.weight <= 0 || mapping.weight > 10) {
      throw new Error('Trọng số phải lớn hơn 0 và không vượt quá 10.');
    }
    if (!allowedStatuses.has(mapping.status)) {
      throw new Error('Trạng thái ánh xạ không hợp lệ.');
    }

    const competency = competencyById.get(mapping.competency_id);
    validateCompetencyScope({
      competency,
      teacherId,
      subject: assignment.type,
      grade,
    });

    const key = `${mapping.test_case_id ?? 'assignment'}:${mapping.competency_id}`;
    if (seen.has(key)) throw new Error('Kỹ năng và test case bị trùng.');
    seen.add(key);
  }
};
