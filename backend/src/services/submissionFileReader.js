import path from 'path';
import { readFile } from 'fs/promises';
import { extractTextFromDocx, extractTextFromPdf } from './documentPipelineService.js';

const starts = (buffer, bytes) => bytes.every((byte, index) => buffer[index] === byte);

export const detectFileType = (buffer) => {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  if (starts(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (starts(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (starts(buffer, [0x50, 0x4b, 0x03, 0x04])) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return null;
};

const fail = (code, message) => { const error = new Error(message); error.code = code; throw error; };

export const createSubmissionFileReader = ({ uploadsDir = path.join(process.cwd(), 'uploads/submissions') } = {}) => ({
  async read({ submission, assignment }) {
    if (!submission?.object_key?.startsWith('local://')) fail('FILE_NOT_AVAILABLE', 'Không tìm thấy bản file nội bộ để chấm.');
    const root = path.resolve(uploadsDir);
    const filePath = path.resolve(root, submission.object_key.slice('local://'.length));
    if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) fail('FILE_INVALID', 'Đường dẫn file không hợp lệ.');
    let buffer;
    try { buffer = await readFile(filePath); } catch { fail('FILE_NOT_AVAILABLE', 'File bài làm chưa sẵn sàng.'); }
    const maxBytes = Number(assignment?.max_file_size_mb || 25) * 1024 * 1024;
    if (buffer.length > maxBytes) fail('FILE_TOO_LARGE', 'File vượt quá dung lượng cho phép.');
    const mimeType = detectFileType(buffer);
    if (!mimeType || mimeType !== submission.mime_type) fail('FILE_INVALID', 'Nội dung file không khớp định dạng khai báo.');
    if (mimeType.includes('wordprocessingml')) {
      const pages = await extractTextFromDocx(buffer);
      return { extractedText: pages.map((page) => page.text).join('\n').trim(), extractionMethod: 'docx_text' };
    }
    if (mimeType === 'application/pdf') {
      const pages = await extractTextFromPdf(buffer);
      const extractedText = pages.map((page) => page.text).join('\n').trim();
      if (extractedText) return { extractedText, extractionMethod: 'pdf_text' };
    }
    return { file: { mimeType, base64: buffer.toString('base64') }, extractionMethod: 'gemini_vision' };
  },
});
