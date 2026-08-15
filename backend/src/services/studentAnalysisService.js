import { normalizeAnalysisScope } from './studentEvidenceService.js';
import { STUDENT_ANALYSIS_SCHEMA_VERSION, STUDENT_ANALYSIS_PROMPT_VERSION } from '../ai/studentAnalysisSchema.js';

const mapCode = (error) => {
  if (error?.code === '23505') return 'ANALYSIS_ALREADY_RUNNING';
  return error?.message ?? 'Lỗi cơ sở dữ liệu.';
};

const requireOwnedClass = async (db, classId, teacherId) => {
  const { data, error } = await db.from('classes').select('id,teacher_id').eq('id', classId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.teacher_id !== teacherId) throw new Error('Bạn không có quyền truy cập lớp này.');
  return data;
};

const requireEnrollment = async (db, classId, studentId) => {
  const { data, error } = await db.from('enrollments').select('id').eq('class_id', classId).eq('user_id', studentId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Học sinh không thuộc lớp này.');
  return data;
};

const requireOwnedJob = async (db, jobId, teacherId) => {
  const { data, error } = await db.from('student_analysis_jobs').select('*').eq('id', jobId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Không tìm thấy tác vụ phân tích.');
  const { data: classData, error: classError } = await db.from('classes').select('teacher_id').eq('id', data.class_id).maybeSingle();
  if (classError) throw new Error(classError.message);
  if (!classData || classData.teacher_id !== teacherId) throw new Error('Bạn không có quyền truy cập tác vụ này.');
  return data;
};

export const createStudentAnalysisService = ({ db, evidenceService }) => ({
  async preview({ teacherId, classId, studentId, scope }) {
    const normalized = normalizeAnalysisScope(scope);
    await requireOwnedClass(db, classId, teacherId);
    await requireEnrollment(db, classId, studentId);
    return evidenceService.preview({ teacherId, classId, studentId, scope: normalized });
  },

  async createJob({ teacherId, classId, studentId, scope, confirmSparseData = false }) {
    const normalized = normalizeAnalysisScope(scope);
    await requireOwnedClass(db, classId, teacherId);
    await requireEnrollment(db, classId, studentId);
    const { bundle, fingerprint } = await evidenceService.buildBundle({ teacherId, classId, studentId, scope: normalized, confirmSparseData });
    const payload = {
      class_id: classId,
      student_id: studentId,
      requested_by: teacherId,
      scope: normalized,
      evidence_fingerprint: fingerprint,
      status: 'queued',
    };
    const { data, error } = await db.from('student_analysis_jobs').insert(payload).select().single();
    if (error) {
      const wrapped = new Error(mapCode(error));
      if (error.code === '23505') wrapped.code = 'ANALYSIS_ALREADY_RUNNING';
      throw wrapped;
    }
    return data;
  },

  async listReports({ teacherId, classId, studentId }) {
    await requireOwnedClass(db, classId, teacherId);
    await requireEnrollment(db, classId, studentId);
    const { data, error } = await db.from('student_analysis_jobs')
      .select('id,class_id,student_id,status,created_at,student_analysis_reports(id,review_status,created_at)')
      .eq('class_id', classId).eq('student_id', studentId);
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  async getJob({ teacherId, jobId }) {
    const job = await requireOwnedJob(db, jobId, teacherId);
    return job;
  },

  async getReport({ teacherId, jobId, reportId }) {
    const job = await requireOwnedJob(db, jobId, teacherId);
    const { data, error } = await db.from('student_analysis_reports').select('*').eq('id', reportId).eq('job_id', job.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Không tìm thấy báo cáo.');
    return data;
  },

  async reviewReport({ teacherId, jobId, reportId, review }) {
    const job = await requireOwnedJob(db, jobId, teacherId);
    const { data: report, error: reportError } = await db.from('student_analysis_reports').select('*').eq('id', reportId).eq('job_id', job.id).maybeSingle();
    if (reportError) throw new Error(reportError.message);
    if (!report) throw new Error('Không tìm thấy báo cáo.');
    const decision = review.decision;
    if (!['approved_internal', 'published', 'rejected'].includes(decision)) throw new Error('Quyết định không hợp lệ.');
    const now = new Date().toISOString();
    const patch = {
      edited_teacher_report: review.teacher_report ?? report.ai_teacher_report,
      edited_student_report: review.student_report ?? report.ai_student_report,
      review_status: decision === 'rejected' ? 'rejected' : decision,
      review_decision: decision,
      reviewed_by: teacherId,
      reviewed_at: now,
      published_at: decision === 'published' ? now : null,
    };
    const { data, error } = await db.from('student_analysis_reports').update(patch).eq('id', reportId).select().single();
    if (error) throw new Error(error.message);
    const eventType = decision === 'rejected' ? 'rejected' : decision === 'published' ? 'published' : 'approved_internal';
    await db.from('student_analysis_events').insert({
      job_id: jobId, report_id: reportId, event_type: eventType, actor_id: teacherId,
      metadata: { instruction: review.instruction ?? null },
    }).select().single();
    if (decision === 'rejected') {
      const { data: newJob, error: jobError } = await db.from('student_analysis_jobs')
        .insert({ class_id: job.class_id, student_id: job.student_id, requested_by: teacherId, scope: job.scope, evidence_fingerprint: job.evidence_fingerprint, status: 'queued' })
        .select().single();
      if (!jobError && newJob) {
        await db.from('student_analysis_events').insert({ job_id: newJob.id, report_id: null, event_type: 'retry_requested', actor_id: teacherId, metadata: { from_job: jobId, instruction: review.instruction ?? null } }).select().single();
      }
    } else {
      const nextStatus = decision === 'published' ? 'published' : 'approved_internal';
      await db.from('student_analysis_jobs').update({ status: nextStatus, completed_at: now }).eq('id', jobId).select().single();
    }
    return data;
  },

  async retryJob({ teacherId, jobId }) {
    const job = await requireOwnedJob(db, jobId, teacherId);
    const { data, error } = await db.from('student_analysis_jobs')
      .insert({ class_id: job.class_id, student_id: job.student_id, requested_by: teacherId, scope: job.scope, evidence_fingerprint: job.evidence_fingerprint, status: 'queued' })
      .select().single();
    if (error) throw new Error(mapCode(error));
    await db.from('student_analysis_events').insert({ job_id: data.id, report_id: null, event_type: 'retry_requested', actor_id: teacherId, metadata: { from_job: jobId } }).select().single();
    return data;
  },
});

export { STUDENT_ANALYSIS_SCHEMA_VERSION, STUDENT_ANALYSIS_PROMPT_VERSION };
