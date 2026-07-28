export const normalizeIds = (ids = []) => [...new Set(ids.filter(Boolean))];

export const validateShareRequest = ({
  sourceClass,
  targetClasses,
  targetClassIds,
  assignments,
  assignmentIds,
  teacherId,
}) => {
  if (!sourceClass || sourceClass.teacher_id !== teacherId) {
    throw new Error('Bạn không phải giáo viên của lớp nguồn');
  }

  if (targetClasses.length !== targetClassIds.length) {
    throw new Error('Một số lớp đích không tồn tại');
  }

  for (const targetClass of targetClasses) {
    if (targetClass.id === sourceClass.id) {
      throw new Error('Không thể chia sẻ bài tập trở lại lớp nguồn');
    }
    if (targetClass.teacher_id !== teacherId) {
      throw new Error(`Bạn không phải giáo viên của lớp ${targetClass.id}`);
    }
    if (String(targetClass.grade) !== String(sourceClass.grade)) {
      throw new Error('Chỉ có thể chia sẻ bài tập sang lớp cùng khối');
    }
  }

  if (assignmentIds.length === 0) {
    throw new Error('Vui lòng chọn ít nhất một bài tập');
  }

  if (assignments.length !== assignmentIds.length) {
    throw new Error('Một số bài tập không tồn tại');
  }

  if (assignments.some((assignment) => assignment.class_id !== sourceClass.id)) {
    throw new Error('Một số bài tập không thuộc lớp nguồn');
  }
};

export const copyAssignmentsIndependently = async ({
  targetClassIds,
  assignments,
  repository,
}) => {
  const failures = [];
  let copied = 0;

  for (const targetClassId of normalizeIds(targetClassIds)) {
    for (const assignment of assignments) {
      const {
        test_cases: testCases = [],
        id,
        class_id,
        created_at,
        is_published,
        ...copyData
      } = assignment;
      let created;

      try {
        created = await repository.createAssignment({
          ...copyData,
          class_id: targetClassId,
          is_published: false,
        });

        if (testCases.length > 0) {
          const rows = testCases.map((testCase, index) => {
            const {
              id: testCaseId,
              assignment_id: sourceAssignmentId,
              created_at: testCaseCreatedAt,
              ...testCaseData
            } = testCase;
            return {
              ...testCaseData,
              assignment_id: created.id,
              order_index: testCase.order_index ?? index,
            };
          });

          await repository.createTestCases(rows);
          const maxScore = rows.reduce((total, testCase) => total + (testCase.points ?? 1), 0);
          await repository.updateAssignmentMaxScore(created.id, maxScore);
        }

        copied += 1;
      } catch (error) {
        if (created?.id) {
          await repository.deleteAssignment(created.id);
        }
        failures.push({
          assignmentId: id,
          targetClassId,
          message: error.message || 'Sao chép bài tập thất bại',
        });
      }
    }
  }

  return {
    copied,
    failed: failures.length,
    targetCount: normalizeIds(targetClassIds).length,
    failures,
  };
};
