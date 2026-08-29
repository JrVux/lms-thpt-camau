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
    'Tên file': row.latest?.file_name || '',
    'Điểm': row.latest?.score ?? '',
    'Nhận xét': row.latest?.feedback || '',
  }));
};

export const buildFileAssignmentPayload = (formState) => {
  const submissionType = formState.submission_type || 'essay';
  return {
    submission_type: submissionType,
    essay_content: submissionType === 'essay' ? String(formState.essay_content || '').trim() : null,
    allowed_mime_types: formState.allowed_mime_types || SUPPORTED_FILE_MIME_TYPES,
    max_file_size_mb: Number(formState.max_file_size_mb || 25),
    allow_late_submission: Boolean(formState.allow_late_submission),
  };
};

export const studentFileCard = (delivery = {}) => {
  const assignment = delivery.assignments || {};
  const isEssay = assignment.submission_type === 'essay';
  const badge = isEssay ? 'Tự luận' : 'Thực hành';

  const latest = [...(delivery.submissions || [])]
    .sort((a, b) => new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0))[0];

  let statusText = 'Chưa nộp';
  if (latest) {
    if ((latest.graded_at || delivery.assignment_status === 'graded') && latest.score !== null && latest.score !== undefined) {
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
  return roster.filter((r) => r.status === filterKey);
};

export const nextRosterIndex = (filteredRoster = [], currentIndex = 0) => {
  if (filteredRoster.length <= 1) return 0;
  return (currentIndex + 1) % filteredRoster.length;
};
