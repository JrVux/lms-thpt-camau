import api from './api';

export const requestUploadUrl = async ({ deliveryId, fileName, mimeType, fileSize }) => {
  return { uploadUrl: null, uploadToken: null };
};

export const uploadFileToR2 = async (uploadUrl, file, onProgress) => {
  return true;
};

export const confirmSubmission = async ({ uploadToken }) => {
  return { success: true };
};

export const getDownloadUrl = async (submissionId) => {
  const res = await api.get(`/api/file-submissions/${submissionId}/download`, { responseType: 'blob' });
  const blobUrl = URL.createObjectURL(res.data);
  return { downloadUrl: blobUrl, expiresIn: 3600 };
};

export const gradeSubmission = async ({ submissionId, score, feedback }) => {
  const res = await api.post(`/api/file-submissions/${submissionId}/grade`, {
    score,
    feedback,
  });
  return res.data;
};
