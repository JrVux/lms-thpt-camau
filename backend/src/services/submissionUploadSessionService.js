import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  persistSubmissionBuffer,
  safeFileName,
  validateSubmissionBuffer,
} from './fileSubmissionService.js';
import { createEssayGradingService } from './essayGradingService.js';
import { reportEssayQueueError } from './essayQueueDiagnostics.js';
import { createSubmissionUploadCleanupWorker } from './submissionUploadCleanupWorker.js';

const fail = (code, message) => {
  const error = new Error(message);
  error.code = code;
  throw error;
};

const safeSubmission = (submission) => {
  if (!submission) return null;
  const { object_key: _objectKey, ...safe } = submission;
  return safe;
};

const normalizedNameKey = (name) => String(name || '').trim().normalize('NFKC').toLocaleLowerCase('vi-VN');

export const validateUploadMetadata = (files, assignment = {}) => {
  if (!Array.isArray(files) || files.length < 1 || files.length > 5) {
    fail('BAD_REQUEST', 'Mỗi lần nộp tự luận phải có từ 1 đến 5 file.');
  }
  const allowed = assignment.allowed_mime_types || [];
  const maxBytes = Number(assignment.max_file_size_mb || 25) * 1024 * 1024;
  const seen = new Set();
  return files.map((file, sortOrder) => {
    const nameKey = normalizedNameKey(file?.name);
    const cleanedName = safeFileName(file?.name);
    const size = Number(file?.size);
    if (!nameKey || !cleanedName) fail('BAD_REQUEST', `Tên file thứ ${sortOrder + 1} không hợp lệ.`);
    if (seen.has(nameKey)) fail('BAD_REQUEST', `Tên file bị trùng: ${file.name}`);
    seen.add(nameKey);
    if (!allowed.includes(file?.type)) fail('BAD_REQUEST', `Định dạng file không được phép: ${file.name}`);
    if (!Number.isSafeInteger(size) || size <= 0) fail('BAD_REQUEST', `Dung lượng file không hợp lệ: ${file.name}`);
    if (size > maxBytes) fail('BAD_REQUEST', `File vượt quá dung lượng cho phép: ${file.name}`);
    return { file_name: cleanedName, mime_type: file.type, declared_size: size, sort_order: sortOrder };
  });
};

const mapRpcError = (error) => {
  const message = String(error?.message || error || '');
  if (/UPLOAD_SESSION_NOT_FOUND|DELIVERY_NOT_FOUND/.test(message)) fail('NOT_FOUND', 'Không tìm thấy phiên upload hoặc bài tập đã giao.');
  if (/UPLOAD_SESSION_FORBIDDEN/.test(message)) fail('FORBIDDEN', 'Bạn không có quyền sử dụng phiên upload này.');
  if (/UPLOAD_SESSION_EXPIRED/.test(message)) fail('BAD_REQUEST', 'Phiên upload đã hết hạn. Vui lòng chọn và nộp lại toàn bộ file.');
  if (/MAX_SUBMISSIONS_EXCEEDED/.test(message)) fail('MAX_SUBMISSIONS_EXCEEDED', 'Bạn đã nộp đủ số lần cho phép.');
  if (/UPLOAD_SESSION_INCOMPLETE/.test(message)) fail('BAD_REQUEST', 'Bộ file chưa được tải lên đầy đủ.');
  if (/UPLOAD_SESSION_INVALID_STATE|ASSIGNMENT_MISMATCH/.test(message)) fail('CONFLICT', 'Trạng thái phiên upload không hợp lệ.');
  throw error instanceof Error ? error : new Error(message || 'Không thể xác nhận bài nộp.');
};

export const createSubmissionUploadSessionService = (db, {
  uploadsDir = path.join(process.cwd(), 'uploads/submissions'),
  getStudentDelivery,
  loadOwnedSession,
  loadSessionFile,
  persistBuffer = persistSubmissionBuffer,
  markUploaded,
  cleanupSession,
  confirmRpc,
  loadAssignment,
  ensureQueued,
  reportQueueError = reportEssayQueueError,
  now = () => Date.now(),
} = {}) => {
  const essayGrading = createEssayGradingService(db);
  const ensureEssayQueued = ensureQueued || essayGrading.ensureQueued;
  const cleanupWorker = createSubmissionUploadCleanupWorker({ db, uploadsDir, now });

  const defaultLoadOwnedSession = async ({ studentId, sessionId }) => {
    const { data, error } = await db.from('submission_upload_sessions').select('*').eq('id', sessionId).maybeSingle();
    if (error || !data) fail('NOT_FOUND', 'Không tìm thấy phiên upload.');
    if (data.user_id !== studentId) fail('FORBIDDEN', 'Bạn không có quyền sử dụng phiên upload này.');
    return data;
  };

  const getOwnedSession = (input) => (loadOwnedSession || defaultLoadOwnedSession)(input);

  const defaultLoadSessionFile = async ({ sessionId, fileId }) => {
    const { data, error } = await db.from('submission_upload_session_files').select('*').eq('id', fileId).eq('session_id', sessionId).maybeSingle();
    if (error || !data) fail('NOT_FOUND', 'Không tìm thấy file trong phiên upload.');
    return data;
  };

  const getSessionFile = (input) => (loadSessionFile || defaultLoadSessionFile)(input);

  const defaultMarkUploaded = async (fileId, fileSize) => {
    const { data, error } = await db
      .from('submission_upload_session_files')
      .update({ status: 'uploaded', file_size: fileSize, updated_at: new Date(now()).toISOString() })
      .eq('id', fileId)
      .eq('status', 'pending')
      .select('id,status,file_size')
      .maybeSingle();
    if (error || !data) fail('CONFLICT', 'File đã được xử lý hoặc phiên upload không còn hợp lệ.');
    return data;
  };

  const cleanup = async (session, reason) => {
    if (cleanupSession) return cleanupSession(session, reason);
    if (!session || session.status === 'confirmed') return false;
    const { error } = await db
      .from('submission_upload_sessions')
      .update({ status: 'cleanup_pending', cleanup_reason: reason, updated_at: new Date(now()).toISOString() })
      .eq('id', session.id)
      .neq('status', 'confirmed');
    if (error) return false;
    return cleanupWorker.cleanupSession({ ...session, status: 'cleanup_pending', cleanup_reason: reason });
  };

  const requireEssayDetail = async (studentId, deliveryId) => {
    if (typeof getStudentDelivery !== 'function') throw new Error('getStudentDelivery is required');
    const detail = await getStudentDelivery({ studentId, deliveryId });
    if (detail?.assignment?.submission_type !== 'essay') fail('BAD_REQUEST', 'Chỉ bài tự luận mới hỗ trợ nộp nhiều file.');
    return detail;
  };

  const requireOpenDeadline = (detail) => {
    const overdue = detail.delivery?.due_date && now() > new Date(detail.delivery.due_date).getTime();
    if (overdue && !detail.assignment?.allow_late_submission) fail('DEADLINE_PASSED', 'Bài tập đã quá hạn nộp.');
  };

  const createSession = async ({ studentId, deliveryId, files }) => {
    const detail = await requireEssayDetail(studentId, deliveryId);
    requireOpenDeadline(detail);
    if (detail.delivery?.max_submissions !== null
        && detail.delivery?.max_submissions !== undefined
        && (detail.history || []).length >= Number(detail.delivery.max_submissions)) {
      fail('MAX_SUBMISSIONS_EXCEEDED', `Bạn đã nộp tối đa ${detail.delivery.max_submissions} lần cho phép.`);
    }
    const metadata = validateUploadMetadata(files, detail.assignment);
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(now() + 60 * 60 * 1000).toISOString();
    const { data: session, error: sessionError } = await db
      .from('submission_upload_sessions')
      .insert({ id: sessionId, delivery_id: deliveryId, user_id: studentId, expected_file_count: metadata.length, expires_at: expiresAt })
      .select()
      .maybeSingle();
    if (sessionError || !session) throw new Error(sessionError?.message || 'Không thể tạo phiên upload.');

    const rows = metadata.map((file) => {
      const id = crypto.randomUUID();
      return { ...file, id, session_id: sessionId, object_key: `local://tmp/${sessionId}/${id}_${file.file_name}` };
    });
    const { data: insertedFiles, error: filesError } = await db.from('submission_upload_session_files').insert(rows).select();
    if (filesError) {
      await db.from('submission_upload_sessions').delete().eq('id', sessionId);
      throw new Error(filesError.message);
    }
    return {
      id: session.id,
      expires_at: session.expires_at,
      files: (insertedFiles || rows).sort((a, b) => a.sort_order - b.sort_order).map((file) => ({
        id: file.id,
        file_name: file.file_name,
        mime_type: file.mime_type,
        file_size: file.declared_size,
        sort_order: file.sort_order,
      })),
    };
  };

  const uploadSessionFile = async ({ studentId, sessionId, fileId, buffer, declaredMimeType, declaredSize }) => {
    const session = await getOwnedSession({ studentId, sessionId });
    try {
      if (session.status !== 'uploading') fail('CONFLICT', 'Phiên upload không còn nhận file.');
      if (session.expires_at && new Date(session.expires_at).getTime() <= now()) fail('BAD_REQUEST', 'Phiên upload đã hết hạn.');
      const detail = await requireEssayDetail(studentId, session.delivery_id);
      requireOpenDeadline(detail);
      const file = await getSessionFile({ sessionId, fileId });
      if (file.status === 'uploaded' && file.file_size === buffer?.length) return { id: file.id, status: 'uploaded', file_size: file.file_size };
      if (file.status !== 'pending') fail('CONFLICT', 'File không còn ở trạng thái chờ upload.');
      if (!Buffer.isBuffer(buffer) || buffer.length === 0) fail('BAD_REQUEST', 'File bài làm không có dữ liệu.');
      if (declaredMimeType !== file.mime_type || Number(declaredSize) !== Number(file.declared_size) || buffer.length !== Number(file.declared_size)) {
        fail('BAD_REQUEST', 'Metadata hoặc dung lượng file không khớp phiên upload.');
      }
      const validationError = validateSubmissionBuffer(buffer, declaredMimeType, detail.assignment);
      if (validationError) fail('BAD_REQUEST', validationError);

      const relativePath = file.object_key.slice('local://'.length).replace(/\\/g, '/');
      const localPath = path.resolve(uploadsDir, relativePath);
      const root = path.resolve(uploadsDir);
      if (!localPath.startsWith(`${root}${path.sep}`)) fail('BAD_REQUEST', 'Đường dẫn file upload không hợp lệ.');
      await fs.promises.mkdir(path.dirname(localPath), { recursive: true });
      await persistBuffer({
        localPath,
        objectKey: `${session.delivery_id}/${studentId}/${relativePath}`,
        buffer,
        mimeType: declaredMimeType,
      });
      return (markUploaded || defaultMarkUploaded)(file.id, buffer.length);
    } catch (error) {
      await cleanup(session, 'upload_failed');
      throw error;
    }
  };

  const defaultConfirmRpc = async (params) => {
    const { data, error } = await db.rpc('confirm_multi_file_submission', params);
    if (error) mapRpcError(error);
    return Array.isArray(data) ? data[0] : data;
  };

  const confirmSession = async ({ studentId, sessionId }) => {
    const session = await getOwnedSession({ studentId, sessionId });
    const detail = await requireEssayDetail(studentId, session.delivery_id);
    requireOpenDeadline(detail);
    let result;
    try {
      result = await (confirmRpc || defaultConfirmRpc)({
        p_session_id: sessionId,
        p_user_id: studentId,
        p_assignment_id: detail.assignment.id,
        p_max_score: detail.assignment.max_score,
        p_is_late: Boolean(detail.delivery?.due_date && now() > new Date(detail.delivery.due_date).getTime()),
      });
    } catch (error) {
      let latestSession = session;
      try { latestSession = await getOwnedSession({ studentId, sessionId }); } catch { /* keep original session */ }
      if (latestSession.status !== 'confirmed') await cleanup(latestSession, 'confirm_failed');
      throw error;
    }
    const submission = result?.submission;
    if (!submission?.id) fail('CONFLICT', 'Không nhận được bài nộp sau khi xác nhận.');
    let gradingQueued = false;
    if (detail.assignment.ai_grading_enabled) {
      try {
        let gradingAssignment = detail.assignment;
        if (loadAssignment) {
          gradingAssignment = await loadAssignment(detail.assignment.id);
        } else if (typeof db?.from === 'function') {
          const { data } = await db.from('assignments').select('*').eq('id', detail.assignment.id).maybeSingle();
          if (data) gradingAssignment = data;
        }
        const queueResult = await ensureEssayQueued({ submission, assignment: gradingAssignment, studentId });
        gradingQueued = Boolean(queueResult?.job);
      } catch (error) {
        reportQueueError({
          operation: 'confirm_upload_session',
          submissionId: submission.id,
          assignmentId: detail.assignment.id,
          error,
        });
      }
    }
    let history = detail.history;
    try { history = (await getStudentDelivery({ studentId, deliveryId: session.delivery_id })).history; } catch { /* retain current history */ }
    return { success: true, submission: safeSubmission(submission), history, grading_queued: gradingQueued };
  };

  const cancelSession = async ({ studentId, sessionId }) => {
    const session = await getOwnedSession({ studentId, sessionId });
    if (session.status === 'confirmed') fail('CONFLICT', 'Không thể hủy bài nộp đã xác nhận.');
    await cleanup(session, 'cancelled');
    return { success: true };
  };

  return { createSession, uploadSessionFile, confirmSession, cancelSession };
};
