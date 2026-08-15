export const ACTIVE_ANALYSIS_STATUSES = new Set(['queued', 'preparing_evidence', 'analyzing']);

export const shouldPollAnalysis = (status) => ACTIVE_ANALYSIS_STATUSES.has(status);

export const buildScopePayload = (input) => {
  if (!input || typeof input !== 'object') return { scope: { mode: 'latest', limit: 5 } };
  if (input.mode === 'dates') {
    return { scope: { mode: 'dates', from: input.from, to: input.to } };
  }
  const limit = Number(input.limit ?? 5);
  if (![3, 5, 10].includes(limit)) return { scope: { mode: 'latest', limit: 5 } };
  return { scope: { mode: 'latest', limit } };
};

export const STATUS_LABELS = {
  queued: 'Đang xếp hàng',
  preparing_evidence: 'Đang chuẩn bị bằng chứng',
  analyzing: 'Đang phân tích',
  awaiting_review: 'Chờ duyệt',
  approved_internal: 'Đã duyệt nội bộ',
  published: 'Đã công bố',
  failed: 'Thất bại',
  rejected: 'Đã từ chối',
  stale: 'Cũ (cần làm lại)',
  withdrawn: 'Đã thu hồi',
};

export const analysisStatusLabel = (status) => STATUS_LABELS[status] ?? status;

export const effectiveTeacherReport = (report) => report?.edited_teacher_report ?? report?.ai_teacher_report ?? null;

export const effectiveStudentReport = (report) => report?.edited_student_report ?? report?.ai_student_report ?? null;

export const createEditableReport = (report) => {
  if (!report) return { teacher_report: null, student_report: null };
  return {
    teacher_report: JSON.parse(JSON.stringify(report.edited_teacher_report ?? report.ai_teacher_report ?? {})),
    student_report: JSON.parse(JSON.stringify(report.edited_student_report ?? report.ai_student_report ?? {})),
  };
};