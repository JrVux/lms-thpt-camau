import fs from 'fs';
import path from 'path';
import { uploadBufferToR2 } from './r2Service.js';

export const safeFileName = (fileName) => {
  if (!fileName) return '';
  const basename = path.basename(fileName);
  const normalized = basename.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const safe = normalized.replace(/[^a-zA-Z0-9._-]/g, '_');
  return safe.slice(0, 100);
};

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
    // 1. Fetch delivery & assignment safely
    const { data: delivery, error: delErr } = await db
      .from('assignment_deliveries')
      .select('*, classes:class_id(*)')
      .eq('id', deliveryId)
      .maybeSingle();

    if (delErr || !delivery) {
      throwNotFound('Không tìm thấy thông tin bài tập đã giao.');
    }

    let assignment = delivery.assignments || delivery.assignment;
    if (!assignment) {
      const targetId = delivery.assignment_id || delivery.library_assignment_id;
      if (targetId) {
        const { data: fetchAssign } = await db
          .from('assignments')
          .select('*')
          .eq('id', targetId)
          .maybeSingle();
        assignment = fetchAssign;
      }
    }

    if (!assignment) {
      throwNotFound('Không tìm thấy nội dung bài tập.');
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
    let targetAssignmentId = assignmentId;

    const { data: del } = await db
      .from('assignment_deliveries')
      .select('*')
      .eq('id', assignmentId)
      .maybeSingle();

    if (del) {
      targetAssignmentId = del.library_assignment_id || del.assignment_id || assignmentId;
    }

    const { data: assignment } = await db
      .from('assignments')
      .select('*')
      .eq('id', targetAssignmentId)
      .maybeSingle();

    if (!assignment) {
      return [];
    }

    const { data: deliveries } = await db
      .from('assignment_deliveries')
      .select('*, classes:class_id(id, name)')
      .or(`library_assignment_id.eq.${targetAssignmentId},assignment_id.eq.${targetAssignmentId},id.eq.${assignmentId}`);

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

  const submitStudentFile = async ({ studentId, deliveryId, fileName, mimeType, fileSize, fileData }) => {
    const detail = await getStudentDelivery({ studentId, deliveryId });
    const { delivery, assignment } = detail;

    if (delivery.due_date && new Date() > new Date(delivery.due_date) && !assignment.allow_late_submission) {
      const err = new Error('Bài tập đã quá hạn nộp.');
      err.code = 'DEADLINE_PASSED';
      throw err;
    }

    if (delivery.max_submissions !== null) {
      const { count } = await db
        .from('submissions')
        .select('id', { count: 'exact', head: true })
        .eq('delivery_id', deliveryId)
        .eq('user_id', studentId)
        .not('object_key', 'is', null);

      if (count !== null && count >= delivery.max_submissions) {
        const err = new Error(`Bạn đã nộp tối đa ${delivery.max_submissions} lần cho phép.`);
        err.code = 'MAX_SUBMISSIONS_EXCEEDED';
        throw err;
      }
    }

    const safeName = safeFileName(fileName) || 'file.bin';
    const relativePath = `${deliveryId}_${studentId}_${Date.now()}_${safeName}`;
    const UPLOADS_DIR = path.join(process.cwd(), 'uploads/submissions');
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
    const filePath = path.join(UPLOADS_DIR, relativePath);

    const base64Clean = (fileData || '').replace(/^data:.*?;base64,/, '');
    const buffer = Buffer.from(base64Clean, 'base64');
    fs.writeFileSync(filePath, buffer);

    const isLate = delivery.due_date ? new Date() > new Date(delivery.due_date) : false;

    const { data: submission, error: rpcErr } = await db.rpc('create_file_submission', {
      p_delivery_id: deliveryId,
      p_user_id: studentId,
      p_object_key: `local://${relativePath}`,
      p_file_name: safeName,
      p_mime_type: mimeType || 'application/octet-stream',
      p_file_size: buffer.length,
      p_is_late: isLate,
    });

    if (rpcErr) throw new Error(rpcErr.message);

    // Parallel sync to Cloudflare R2 in background
    uploadBufferToR2({
      objectKey: `${deliveryId}/${studentId}/${relativePath}`,
      buffer,
      mimeType,
    }).catch(() => {});

    const updatedDetail = await getStudentDelivery({ studentId, deliveryId });
    return { success: true, submission, history: updatedDetail.history };
  };

  const getSubmissionDownload = async ({ userId, userRole, submissionId }) => {
    const { data: sub, error: subErr } = await db
      .from('submissions')
      .select('*, assignment_deliveries!inner(class_id, teacher_id)')
      .eq('id', submissionId)
      .maybeSingle();

    if (subErr || !sub) throwNotFound('Không tìm thấy bài nộp.');

    if (userRole === 'student' && sub.user_id !== userId) {
      throwForbidden();
    }

    if (sub.object_key && sub.object_key.startsWith('local://')) {
      const relativePath = sub.object_key.replace('local://', '');
      const UPLOADS_DIR = path.join(process.cwd(), 'uploads/submissions');
      const filePath = path.join(UPLOADS_DIR, relativePath);
      if (!fs.existsSync(filePath)) {
        throwNotFound('File không còn tồn tại trên server.');
      }
      return { type: 'local', filePath, fileName: sub.file_name, mimeType: sub.mime_type };
    }

    throwNotFound('Không tìm thấy file bài nộp.');
  };

  const gradeStudentSubmission = async ({ teacherId, submissionId, score, feedback }) => {
    const { data: sub, error: subErr } = await db
      .from('submissions')
      .select('*, assignment_deliveries!inner(teacher_id)')
      .eq('id', submissionId)
      .maybeSingle();

    if (subErr || !sub) throwNotFound('Không tìm thấy bài nộp.');
    if (sub.assignment_deliveries?.teacher_id !== teacherId) {
      throwForbidden('Bạn không có quyền chấm bài nộp này.');
    }

    const now = new Date().toISOString();
    const { data: updated, error: updateErr } = await db
      .from('submissions')
      .update({
        score,
        feedback,
        graded_at: now,
        graded_by: teacherId,
      })
      .eq('id', submissionId)
      .select()
      .maybeSingle();

    if (updateErr) throw new Error(updateErr.message);
    return safeFileSubmission(updated);
  };

  return {
    getStudentDelivery,
    getTeacherRoster,
    exportRows,
    submitStudentFile,
    getSubmissionDownload,
    gradeStudentSubmission,
  };
};
