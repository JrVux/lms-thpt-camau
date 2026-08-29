export const authorizeStudentDelivery = async (
  db: any,
  studentId: string,
  deliveryId: string
) => {
  const { data: delivery, error: delErr } = await db
    .from('assignment_deliveries')
    .select('*, classes(id, name, teacher_id), assignments:assignment_id(*), assignment_recipients(user_id)')
    .eq('id', deliveryId)
    .eq('is_published', true)
    .single();

  if (delErr || !delivery) {
    throw { code: 'NOT_FOUND', message: 'Không tìm thấy bài tập đã giao.', status: 404 };
  }

  const assignment = delivery.assignments;
  if (!['practice_file', 'essay'].includes(assignment?.submission_type)) {
    throw { code: 'BAD_REQUEST', message: 'Bài tập này không phải dạng nộp file.', status: 400 };
  }

  const { data: enrollment, error: enrollErr } = await db
    .from('enrollments')
    .select('*')
    .eq('class_id', delivery.class_id)
    .eq('user_id', studentId)
    .single();

  if (enrollErr || !enrollment) {
    throw { code: 'FORBIDDEN', message: 'Bạn không thuộc lớp học này.', status: 403 };
  }

  if (delivery.recipient_mode === 'selected') {
    const isTargeted = (delivery.assignment_recipients || []).some(
      (r: any) => r.user_id === studentId
    );
    if (!isTargeted) {
      throw { code: 'FORBIDDEN', message: 'Bạn không được chỉ định làm bài tập này.', status: 403 };
    }
  }

  return { delivery, assignment, class: delivery.classes };
};

export const authorizeTeacherSubmission = async (
  db: any,
  teacherId: string,
  submissionId: string
) => {
  const { data: submission, error: subErr } = await db
    .from('submissions')
    .select('*, assignment_deliveries:delivery_id(*, classes:class_id(id, teacher_id), assignments:assignment_id(*))')
    .eq('id', submissionId)
    .single();

  if (subErr || !submission) {
    throw { code: 'NOT_FOUND', message: 'Không tìm thấy bài nộp.', status: 404 };
  }

  const delivery = submission.assignment_deliveries;
  const cls = delivery?.classes;

  if (!cls || cls.teacher_id !== teacherId) {
    throw { code: 'FORBIDDEN', message: 'Bạn không có quyền quản lý bài nộp này.', status: 403 };
  }

  return {
    submission,
    delivery,
    class: cls,
    assignment: delivery.assignments,
  };
};
