export const SUPPORTED_FILE_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png',
  'image/webp',
];

export const AI_ESSAY_FILE_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/webp',
];

export const formatFileSize = (bytes) => {
  if (!bytes || isNaN(bytes)) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const validateSelectedFile = (file, settings = {}) => {
  if (!file) return 'Vui lòng chọn 1 file bài làm.';
  const allowed = settings.allowed_mime_types || SUPPORTED_FILE_MIME_TYPES;
  if (!allowed.includes(file.type)) {
    return 'Định dạng file không được hỗ trợ.';
  }
  const maxMb = settings.max_file_size_mb || 25;
  if (file.size > maxMb * 1024 * 1024) {
    return `File vượt quá dung lượng cho phép (${maxMb} MB).`;
  }
  return null;
};

const normalizeSelectedFileName = (name) => String(name || '')
  .trim()
  .normalize('NFKC')
  .toLocaleLowerCase('vi-VN');

export const validateSelectedFiles = (files = [], settings = {}, maxFiles = 5) => {
  if (!Array.isArray(files) || files.length === 0) return 'Vui lòng chọn ít nhất 1 file bài làm.';
  if (files.length > maxFiles) return `Chỉ được chọn tối đa ${maxFiles} file.`;

  const names = new Set();
  for (const file of files) {
    const error = validateSelectedFile(file, settings);
    if (error) return `${file?.name || 'File'}: ${error}`;

    const normalizedName = normalizeSelectedFileName(file?.name);
    if (!normalizedName) return 'Tên file không hợp lệ.';
    if (names.has(normalizedName)) return `Tên file bị trùng: ${file.name}`;
    names.add(normalizedName);
  }

  return null;
};

export const addSelectedFiles = (currentFiles = [], newFiles = [], settings = {}, maxFiles = 5) => {
  const additions = Array.from(newFiles || []);
  if (additions.length === 0) return { files: currentFiles, error: null };

  const combined = [...currentFiles, ...additions];
  const error = validateSelectedFiles(combined, settings, maxFiles);
  return error
    ? { files: currentFiles, error }
    : { files: combined, error: null };
};

export const removeSelectedFile = (files = [], index) => files.filter((_, itemIndex) => itemIndex !== index);

export const moveSelectedFile = (files = [], index, offset) => {
  const output = [...files];
  const targetIndex = index + offset;
  if (index < 0 || index >= output.length || targetIndex < 0 || targetIndex >= output.length) return output;
  [output[index], output[targetIndex]] = [output[targetIndex], output[index]];
  return output;
};

export const fileAssignmentStatus = (latestSubmission, isOverdue = false) => {
  if (!latestSubmission) {
    return isOverdue ? 'overdue' : 'pending';
  }
  if (latestSubmission.graded_at) return 'graded';
  if (latestSubmission.is_late) return 'late';
  return 'submitted';
};

export const previewKind = (mimeType) => {
  if (!mimeType) return 'unknown';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'pdf';
  if (
    mimeType === 'application/msword' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/vnd.ms-powerpoint' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ) {
    return 'office';
  }
  return 'unknown';
};

export const sortFileDeliveries = (deliveries = []) => {
  const statusOrder = { pending: 1, late: 2, submitted: 3, regrade: 4, graded: 5, overdue: 6 };
  return [...deliveries].sort((a, b) => {
    const orderA = statusOrder[a.assignment_status] || 99;
    const orderB = statusOrder[b.assignment_status] || 99;
    if (orderA !== orderB) return orderA - orderB;
    const dueA = a.due_date ? new Date(a.due_date).getTime() : Infinity;
    const dueB = b.due_date ? new Date(b.due_date).getTime() : Infinity;
    return dueA - dueB;
  });
};

export const toReportRows = (roster = []) => {
  return roster.map((row) => ({
    'Học sinh': row.student_name || 'Học sinh',
    'Lớp': row.class_name || '',
    'Trạng thái': row.status === 'graded' ? 'Đã chấm' : row.status === 'late' ? 'Nộp trễ' : row.status === 'submitted' ? 'Đã nộp' : 'Chưa nộp',
    'Thời gian nộp': row.latest?.submitted_at ? new Date(row.latest.submitted_at).toLocaleString('vi-VN') : '',
    'Nộp trễ': row.latest?.is_late ? 'Có' : 'Không',
    'Tên file': (
      row.latest?.files
      || (row.latest?.file_name ? [{ file_name: row.latest.file_name }] : [])
    ).map((file) => file.file_name).join('; '),
    'Điểm': row.latest?.score ?? '',
    'Nhận xét': row.latest?.feedback || '',
  }));
};

export const buildFileAssignmentPayload = (formState) => {
  const submissionType = formState.submission_type || 'essay';
  const payload = {
    submission_type: submissionType,
    essay_content: submissionType === 'essay' ? String(formState.essay_content || '').trim() : null,
    allowed_mime_types: formState.ai_grading_enabled
      ? AI_ESSAY_FILE_MIME_TYPES.filter((mime) => (formState.allowed_mime_types || AI_ESSAY_FILE_MIME_TYPES).includes(mime))
      : formState.allowed_mime_types || SUPPORTED_FILE_MIME_TYPES,
    max_file_size_mb: Number(formState.max_file_size_mb || 25),
    allow_late_submission: Boolean(formState.allow_late_submission),
  };
  if (submissionType === 'essay' && formState.ai_grading_enabled !== undefined) {
    payload.ai_grading_enabled = Boolean(formState.ai_grading_enabled);
    payload.essay_model_answer = payload.ai_grading_enabled ? String(formState.essay_model_answer || '').trim() : null;
    payload.essay_rubric = [];
    payload.show_model_answer_after_publish = payload.ai_grading_enabled && Boolean(formState.show_model_answer_after_publish);
  }
  return payload;
};

export const validateAiEssayAuthoring = (settings = {}, maxScore) => {
  if (settings.submission_type !== 'essay' || settings.ai_grading_enabled !== true) return null;
  if (!String(settings.essay_model_answer || '').trim()) return 'Vui lòng nhập đáp án mẫu để AI chấm bài';
  if (!Number.isFinite(Number(maxScore)) || Number(maxScore) <= 0) return 'Điểm tối đa phải lớn hơn 0';
  return null;
};

export const studentFileCard = (delivery = {}) => {
  const assignment = delivery.assignments || {};
  const isEssay = assignment.submission_type === 'essay';
  const badge = isEssay ? 'Tự luận' : 'Thực hành';

  const latest = [...(delivery.submissions || [])]
    .sort((a, b) => new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0))[0];

  let statusText = 'Chưa nộp';
  if (latest) {
    if (latest.published_result) {
      statusText = `Đã công bố: ${latest.published_result.score}/${latest.max_score ?? assignment.max_score ?? 10}`;
    } else if (latest.grading_status === 'under_review' || latest.grading_status === 'processing') {
      statusText = 'Đã nộp · Đang chấm';
    } else if ((latest.graded_at || delivery.assignment_status === 'graded') && latest.score !== null && latest.score !== undefined) {
      statusText = `Đã chấm: ${latest.score}/${latest.max_score ?? assignment.max_score ?? 10}`;
    } else if (latest.is_late) {
      statusText = 'Đã nộp trễ';
    } else {
      statusText = 'Đã nộp bài';
    }
  }

  return {
    href: `/deliveries/${delivery.id}/file-submission`,
    badge,
    status: statusText,
  };
};

export const filterRoster = (roster = [], filterKey = 'all') => {
  if (filterKey === 'all') return roster;
  if (filterKey === 'ai_processing') return roster.filter((row) => ['queued', 'extracting', 'grading'].includes(row.essay_grading?.job?.status));
  if (filterKey === 'ai_review') return roster.filter((row) => row.essay_grading?.report?.review_status === 'pending' && !row.essay_grading.report.published_at);
  if (filterKey === 'ai_approved') return roster.filter((row) => row.essay_grading?.report?.review_status === 'approved' && !row.essay_grading.report.published_at);
  if (filterKey === 'ai_published') return roster.filter((row) => Boolean(row.essay_grading?.report?.published_at));
  if (filterKey === 'ai_failed') return roster.filter((row) => ['failed', 'not_queued'].includes(row.essay_grading?.job?.status) || row.essay_grading?.report?.review_status === 'rejected');
  return roster.filter((r) => r.status === filterKey);
};

export const nextRosterIndex = (filteredRoster = [], currentIndex = 0) => {
  if (filteredRoster.length <= 1) return 0;
  return (currentIndex + 1) % filteredRoster.length;
};
