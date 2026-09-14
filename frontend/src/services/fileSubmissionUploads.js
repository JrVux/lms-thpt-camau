import api from './api.js';

export const submitFileBundle = async ({ deliveryId, files, onProgress, apiClient }) => {
  const client = apiClient || api;
  let sessionId = null;
  try {
    const createResponse = await client.post(
      `/api/file-submissions/deliveries/${deliveryId}/upload-sessions`,
      {
        files: files.map((file) => ({
          name: file.name,
          type: file.type,
          size: file.size,
        })),
      },
    );
    sessionId = createResponse.data.id;
    const sessionFiles = createResponse.data.files || [];
    if (!sessionId || sessionFiles.length !== files.length) {
      throw new Error('Máy chủ không tạo đủ vị trí cho bộ file bài làm.');
    }

    for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
      const file = files[fileIndex];
      const sessionFile = sessionFiles[fileIndex];
      await client.post(
        `/api/file-submissions/upload-sessions/${sessionId}/files/${sessionFile.id}`,
        file,
        {
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
            'x-file-mime': file.type || 'application/octet-stream',
            'x-file-size': String(file.size),
          },
          onUploadProgress: (event) => {
            const total = Number(event.total || file.size || 1);
            const filePercent = Math.max(0, Math.min(100, Math.round((Number(event.loaded || 0) * 100) / total)));
            const totalPercent = Math.round(((fileIndex + filePercent / 100) / files.length) * 100);
            onProgress?.({ fileIndex, filePercent, totalPercent });
          },
        },
      );
      onProgress?.({
        fileIndex,
        filePercent: 100,
        totalPercent: Math.round(((fileIndex + 1) / files.length) * 100),
      });
    }

    const confirmResponse = await client.post(`/api/file-submissions/upload-sessions/${sessionId}/confirm`);
    return confirmResponse.data;
  } catch (error) {
    if (sessionId) {
      try {
        await client.delete(`/api/file-submissions/upload-sessions/${sessionId}`);
      } catch {
        // Preserve the upload/confirm error; the server cleanup worker retries abandoned sessions.
      }
    }
    throw error;
  }
};
