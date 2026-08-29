import { supabase } from '../services/supabaseClient.js';
import { createFileSubmissionService } from '../services/fileSubmissionService.js';

const service = createFileSubmissionService(supabase);

const failure = (res, error) => {
  const status = error.code === 'NOT_FOUND' ? 404
    : error.code === 'FORBIDDEN' ? 403
    : error.code === 'BAD_REQUEST' ? 400
    : 500;
  return res.status(status).json({ success: false, message: error.message || 'Thao tác không thành công', code: error.code || 'ERROR' });
};

export const getStudentDelivery = async (req, res) => {
  try {
    const { deliveryId } = req.params;
    const data = await service.getStudentDelivery({
      studentId: req.user.id,
      deliveryId,
    });
    return res.json(data);
  } catch (error) {
    return failure(res, error);
  }
};

export const getTeacherRoster = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const roster = await service.getTeacherRoster({
      teacherId: req.user.id,
      assignmentId,
    });
    return res.json(roster);
  } catch (error) {
    return failure(res, error);
  }
};

export const exportReport = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const format = (req.query.format || 'json').toLowerCase();
    const rows = await service.exportRows({
      teacherId: req.user.id,
      assignmentId,
    });

    if (format === 'csv') {
      const headers = Object.keys(rows[0] || {});
      const escape = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
      const csvLines = [
        headers.map(escape).join(','),
        ...rows.map((r) => headers.map((h) => escape(r[h])).join(',')),
      ];
      // UTF-8 BOM
      const csvString = '\uFEFF' + csvLines.join('\r\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="file_submissions_${assignmentId}.csv"`);
      return res.send(csvString);
    }

    return res.json(rows);
  } catch (error) {
    return failure(res, error);
  }
};

export const submitFile = async (req, res) => {
  try {
    const { deliveryId } = req.params;
    const { fileName, mimeType, fileSize, fileData } = req.body;
    if (!fileName || !fileData) {
      return res.status(400).json({ message: 'Thiếu thông tin file nộp.' });
    }
    const result = await service.submitStudentFile({
      studentId: req.user.id,
      deliveryId,
      fileName,
      mimeType,
      fileSize,
      fileData,
    });
    return res.json(result);
  } catch (error) {
    return failure(res, error);
  }
};

export const downloadFile = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const fileInfo = await service.getSubmissionDownload({
      userId: req.user.id,
      userRole: req.user.role,
      submissionId,
    });
    if (fileInfo.type === 'local') {
      res.setHeader('Content-Type', fileInfo.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileInfo.fileName)}"`);
      return res.sendFile(fileInfo.filePath);
    }
    return res.status(404).json({ message: 'Không tìm thấy file' });
  } catch (error) {
    return failure(res, error);
  }
};

export const gradeFileSubmission = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { score, feedback } = req.body;
    const submission = await service.gradeStudentSubmission({
      teacherId: req.user.id,
      submissionId,
      score,
      feedback,
    });
    return res.json({ success: true, submission });
  } catch (error) {
    return failure(res, error);
  }
};
