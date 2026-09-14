export const safeSubmissionFile = (file) => {
  if (!file) return null;
  const { object_key: _objectKey, submission_id: _submissionId, ...safe } = file;
  return safe;
};

export const normalizeSubmissionFiles = (submission) => {
  const children = Array.isArray(submission?.submission_files)
    ? [...submission.submission_files].sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
    : [];
  if (children.length) return children.map(safeSubmissionFile);
  if (!submission?.file_name) return [];
  return [{
    id: null,
    file_name: submission.file_name,
    mime_type: submission.mime_type,
    file_size: submission.file_size,
    sort_order: 0,
  }];
};

export const safeSubmissionBundle = (submission) => {
  if (!submission) return null;
  const { object_key: _objectKey, submission_files: _rawFiles, ...safe } = submission;
  return { ...safe, files: normalizeSubmissionFiles(submission) };
};

export const groupSubmissionHistory = (submissions = []) => {
  const grouped = new Map();
  const ordered = [...submissions].sort((a, b) => new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0));
  for (const submission of ordered) {
    const key = `${submission.delivery_id}_${submission.user_id}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(safeSubmissionBundle(submission));
  }
  return grouped;
};

export const internalSubmissionFiles = (submission) => {
  const children = Array.isArray(submission?.submission_files)
    ? [...submission.submission_files].sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
    : [];
  if (children.length) return children;
  if (!submission?.object_key) return [];
  return [{
    id: null,
    submission_id: submission.id,
    object_key: submission.object_key,
    file_name: submission.file_name,
    mime_type: submission.mime_type,
    file_size: submission.file_size,
    sort_order: 0,
  }];
};
