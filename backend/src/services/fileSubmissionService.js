export const safeFileSubmission = (submission) => {
  if (!submission) return null;
  const { object_key, ...safe } = submission;
  return safe;
};

export const fileRosterStatus = (submission) => {
  if (!submission) return 'missing';
  if (submission.graded_at) return 'graded';
  if (submission.is_late) return 'late';
  return 'submitted';
};

export const toExportRows = (rows) => rows.map((row) => ({
  'Học sinh': row.student_name,
  'Lớp': row.class_name,
  'Trạng thái': fileRosterStatus(row.latest),
  'Thời gian nộp': row.latest?.submitted_at ?? '',
  'Nộp trễ': row.latest?.is_late ? 'Có' : 'Không',
  'Tên file': row.latest?.file_name ?? '',
  'Điểm': row.latest?.score ?? '',
  'Nhận xét': row.latest?.feedback ?? '',
}));

export const createFileSubmissionService = (db) => {
  const throwNotFound = (msg = 'Không tìm thấy thông tin bài tập') => {
    const err = new Error(msg);
    err.code = 'NOT_FOUND';
    throw err;
  };

  const throwForbidden = (msg = 'Bạn không có quyền truy cập') => {
    const err = new Error(msg);
    err.code = 'FORBIDDEN';
    throw err;
  };

  const getStudentDelivery = async ({ studentId, deliveryId }) => {
    // 1. Fetch delivery & assignment
    const { data: delivery, error: delErr } = await db
      .from('assignment_deliveries')
      .select('*, assignments(*), classes(*)')
      .eq('id', deliveryId)
      .maybeSingle();

    if (delErr || !delivery || !delivery.is_published) {
      throwNotFound();
    }

    const assignment = delivery.assignments;
    if (!assignment) {
      throwNotFound();
    }

    if (!['practice_file', 'essay'].includes(assignment.submission_type)) {
      const err = new Error('Bài tập này không phải dạng nộp file');
      err.code = 'BAD_REQUEST';
      throw err;
    }

    // 2. Check enrollment
    const { data: enrollment, error: enrollErr } = await db
      .from('enrollments')
      .select('*')
      .eq('class_id', delivery.class_id)
      .eq('user_id', studentId)
      .maybeSingle();

    if (enrollErr || !enrollment) throwForbidden();

    if (delivery.recipient_mode === 'selected') {
      const { data: recipient, error: recErr } = await db
        .from('assignment_recipients')
        .select('*')
        .eq('delivery_id', deliveryId)
        .eq('user_id', studentId)
        .maybeSingle();
      if (recErr || !recipient) throwForbidden();
    }

    // 3. Fetch submissions history
    const { data: submissions } = await db
      .from('submissions')
      .select('*')
      .eq('delivery_id', deliveryId)
      .eq('user_id', studentId)
      .not('object_key', 'is', null)
      .order('submitted_at', { ascending: false });

    return {
      delivery,
      assignment,
      history: (submissions || []).map(safeFileSubmission),
    };
  };

  const getTeacherRoster = async ({ teacherId, assignmentId }) => {
    // 1. Check teacher owns library assignment
    const { data: assignment, error: assignErr } = await db
      .from('assignments')
      .select('*')
      .eq('id', assignmentId)
      .eq('teacher_id', teacherId)
      .maybeSingle();

    if (assignErr || !assignment) throwForbidden('Bạn không có quyền quản lý bài tập này');

    // 2. Get all deliveries
    const { data: deliveries } = await db
      .from('assignment_deliveries')
      .select('*, classes(id, name)')
      .eq('library_assignment_id', assignmentId);

    if (!deliveries || deliveries.length === 0) return [];

    const deliveryIds = deliveries.map((d) => d.id);
    const classIds = deliveries.map((d) => d.class_id);

    // 3. Get enrollments for classes
    const { data: enrollments } = await db
      .from('enrollments')
      .select('class_id, user_id, users(id, full_name)')
      .in('class_id', classIds);

    // 4. Get recipients
    const { data: recipients } = await db
      .from('assignment_recipients')
      .select('delivery_id, user_id')
      .in('delivery_id', deliveryIds);

    const recipientMap = new Map();
    (recipients || []).forEach((r) => {
      if (!recipientMap.has(r.delivery_id)) recipientMap.set(r.delivery_id, new Set());
      recipientMap.get(r.delivery_id).add(r.user_id);
    });

    // 5. Get latest file submissions
    const { data: latestSubmissions } = await db
      .from('submissions')
      .select('*')
      .in('delivery_id', deliveryIds)
      .eq('is_latest', true)
      .not('object_key', 'is', null);

    const submissionMap = new Map();
    (latestSubmissions || []).forEach((s) => {
      submissionMap.set(`${s.delivery_id}_${s.user_id}`, safeFileSubmission(s));
    });

    // 6. Build roster
    const roster = [];
    const deliveryMap = new Map(deliveries.map((d) => [d.id, d]));

    for (const delivery of deliveries) {
      const classEnrollments = (enrollments || []).filter((e) => e.class_id === delivery.class_id);
      for (const enrollment of classEnrollments) {
        const studentId = enrollment.user_id;
        if (delivery.recipient_mode === 'selected') {
          const targeted = recipientMap.get(delivery.id)?.has(studentId);
          if (!targeted) continue;
        }

        const latest = submissionMap.get(`${delivery.id}_${studentId}`) || null;
        roster.push({
          student_id: studentId,
          student_name: enrollment.users?.full_name || 'Học sinh',
          class_id: delivery.class_id,
          class_name: delivery.classes?.name || '',
          delivery_id: delivery.id,
          status: fileRosterStatus(latest),
          latest,
        });
      }
    }

    return roster;
  };

  const exportRows = async ({ teacherId, assignmentId }) => {
    const roster = await getTeacherRoster({ teacherId, assignmentId });
    return toExportRows(roster);
  };

  return {
    getStudentDelivery,
    getTeacherRoster,
    exportRows,
  };
};
