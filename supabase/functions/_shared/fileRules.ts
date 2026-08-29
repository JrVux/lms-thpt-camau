export const safeFileName = (name: string): string => {
  return name
    .replace(/^.*[\\/]/, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 120);
};

export const deadlineState = (
  deadline: string | null,
  allowLate: boolean,
  now = new Date()
): { isLate: boolean; allowed: boolean } => {
  const isLate = Boolean(deadline && now > new Date(deadline));
  return { isLate, allowed: !isLate || allowLate };
};

export const validateFile = (
  file: { mimeType: string; fileSize: number },
  assignment: { allowed_mime_types: string[]; max_file_size_mb: number }
): { code: string; message: string; status: number } | null => {
  if (!assignment.allowed_mime_types.includes(file.mimeType)) {
    return {
      code: 'UNSUPPORTED_FILE_TYPE',
      message: 'Định dạng file không được hỗ trợ.',
      status: 415,
    };
  }
  const maxBytes = assignment.max_file_size_mb * 1024 * 1024;
  if (file.fileSize > maxBytes) {
    return {
      code: 'FILE_TOO_LARGE',
      message: `Dung lượng file vượt quá giới hạn (${assignment.max_file_size_mb} MB).`,
      status: 413,
    };
  }
  return null;
};

export const validateScore = (
  score: number,
  maxScore: number
): { code: string; message: string; status: number } | null => {
  if (typeof score !== 'number' || isNaN(score) || score < 0 || score > maxScore) {
    return {
      code: 'INVALID_SCORE',
      message: `Điểm số phải từ 0 đến ${maxScore}.`,
      status: 400,
    };
  }
  return null;
};
