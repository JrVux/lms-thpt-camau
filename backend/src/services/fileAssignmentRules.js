export const FILE_SUBMISSION_TYPES = ['practice_file', 'essay'];
export const ALL_SUBMISSION_TYPES = ['autograde', ...FILE_SUBMISSION_TYPES];
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

export const normalizeFileAssignment = (input) => {
  if (input.submission_type === undefined) return {};
  const submissionType = input.submission_type;
  if (submissionType === 'autograde') return { submission_type: 'autograde' };
  return {
    submission_type: submissionType,
    essay_content: submissionType === 'essay' ? String(input.essay_content ?? '').trim() : null,
    allowed_mime_types: [...new Set(input.allowed_mime_types ?? SUPPORTED_FILE_MIME_TYPES)],
    max_file_size_mb: Number(input.max_file_size_mb ?? 25),
    allow_late_submission: input.allow_late_submission === true,
  };
};

export const validateFileAssignment = (input) => {
  if (input.submission_type === undefined) return null;
  const normalized = normalizeFileAssignment(input);
  if (!ALL_SUBMISSION_TYPES.includes(normalized.submission_type)) return 'Hình thức nộp bài không hợp lệ.';
  if (normalized.submission_type === 'autograde') return null;
  if (normalized.submission_type === 'essay' && !normalized.essay_content) return 'Vui lòng nhập đề bài tự luận.';
  if (!normalized.allowed_mime_types.length || normalized.allowed_mime_types.some((mime) => !SUPPORTED_FILE_MIME_TYPES.includes(mime))) return 'Định dạng file cho phép không hợp lệ.';
  if (!Number.isInteger(normalized.max_file_size_mb) || normalized.max_file_size_mb < 1 || normalized.max_file_size_mb > 100) return 'Dung lượng file tối đa phải từ 1 đến 100 MB.';
  return null;
};
