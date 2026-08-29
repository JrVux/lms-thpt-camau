import axios from 'axios';

const getSupabaseUrl = () => {
  return (import.meta.env?.VITE_SUPABASE_URL || 'https://sfanqrirgbxpgrhcamit.supabase.co').replace(/\/+$/, '');
};

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
};

const edgeUrl = (functionName) => `${getSupabaseUrl()}/functions/v1/${functionName}`;

const handleEdgeError = (error) => {
  if (error.response?.data?.error) {
    const errObj = error.response.data.error;
    const err = new Error(errObj.message || 'Thao tác thất bại.');
    err.code = errObj.code;
    throw err;
  }
  if (error.response?.data?.message) {
    throw new Error(error.response.data.message);
  }
  throw error;
};

export const requestUploadUrl = async ({ deliveryId, fileName, mimeType, fileSize }) => {
  try {
    const response = await axios.post(
      edgeUrl('get-upload-url'),
      { deliveryId, fileName, mimeType, fileSize },
      { headers: getAuthHeaders() }
    );
    return response.data; // { uploadUrl, uploadToken, expiresIn }
  } catch (error) {
    handleEdgeError(error);
  }
};

export const uploadFileToR2 = async (uploadUrl, file, onProgress) => {
  try {
    await axios.put(uploadUrl, file, {
      headers: {
        'Content-Type': file.type,
      },
      onUploadProgress: (evt) => {
        if (evt.total && onProgress) {
          const percent = Math.round((evt.loaded * 100) / evt.total);
          onProgress(percent);
        }
      },
    });
  } catch (error) {
    throw new Error('Tải file lên Cloudflare R2 thất bại. Vui lòng kiểm tra lại kết nối.');
  }
};

export const confirmSubmission = async ({ uploadToken }) => {
  try {
    const response = await axios.post(
      edgeUrl('confirm-submission'),
      { uploadToken },
      { headers: getAuthHeaders() }
    );
    return response.data; // { success: true, submission, history }
  } catch (error) {
    handleEdgeError(error);
  }
};

export const getDownloadUrl = async (submissionId) => {
  try {
    const response = await axios.post(
      edgeUrl('get-download-url'),
      { submissionId },
      { headers: getAuthHeaders() }
    );
    return response.data; // { downloadUrl, expiresIn, file }
  } catch (error) {
    handleEdgeError(error);
  }
};

export const gradeSubmission = async ({ submissionId, score, feedback }) => {
  try {
    const response = await axios.post(
      edgeUrl('grade-submission'),
      { submissionId, score, feedback },
      { headers: getAuthHeaders() }
    );
    return response.data; // { success: true, submission }
  } catch (error) {
    handleEdgeError(error);
  }
};
