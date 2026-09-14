import path from 'path';
import { readFile } from 'fs/promises';
import { extractTextFromDocx, extractTextFromPdf } from './documentPipelineService.js';
import { downloadBufferFromR2 } from './r2Service.js';

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
const SKIPPABLE_BUNDLE_FILE_ERRORS = new Set(['FILE_INVALID', 'FILE_NOT_AVAILABLE', 'FILE_TOO_LARGE']);

export const createSubmissionFileReader = ({ uploadsDir = path.join(process.cwd(), 'uploads/submissions'), r2Download = downloadBufferFromR2 } = {}) => {
  const reader = {
    async read({ submission, assignment }) {
    if (!submission?.object_key?.startsWith('local://')) fail('FILE_NOT_AVAILABLE', 'Không tìm thấy bản file nội bộ để chấm.');
    const root = path.resolve(uploadsDir);
    const filePath = path.resolve(root, submission.object_key.slice('local://'.length));
    if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) fail('FILE_INVALID', 'Đường dẫn file không hợp lệ.');
    let buffer;
    try {
      buffer = await readFile(filePath);
    } catch {
      const r2ObjectKey = `${submission.delivery_id}/${submission.user_id}/${submission.object_key.slice('local://'.length).replace(/\\/g, '/')}`;
      try { buffer = await r2Download({ objectKey: r2ObjectKey }); } catch { buffer = null; }
      if (!buffer) fail('FILE_NOT_AVAILABLE', 'File bài làm chưa sẵn sàng.');
    }
    const maxBytes = Number(assignment?.max_file_size_mb || 25) * 1024 * 1024;
    if (buffer.length > maxBytes) fail('FILE_TOO_LARGE', 'File vượt quá dung lượng cho phép.');
    const mimeType = detectFileType(buffer);
    if (!mimeType || mimeType !== submission.mime_type) fail('FILE_INVALID', 'Nội dung file không khớp định dạng khai báo.');
    if (mimeType.includes('wordprocessingml')) {
      const pages = await extractTextFromDocx(buffer);
      return { extractedText: pages.map((page) => page.text).join('\n').trim(), extractionMethod: 'docx_text' };
    }
    if (mimeType === 'application/pdf') {
      try {
        const pages = await extractTextFromPdf(buffer);
        const extractedText = pages.map((page) => page.text).join('\n').trim();
        if (extractedText) return { extractedText, extractionMethod: 'pdf_text' };
      } catch {
        // Valid PDFs that local extraction cannot parse are delegated to Gemini document vision.
      }
    }
    return { file: { mimeType, base64: buffer.toString('base64') }, extractionMethod: 'gemini_vision' };
    },
    async readMany({ submission, files = [], assignment }) {
      const ordered = files.length
        ? [...files].sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
        : [{
            object_key: submission.object_key,
            file_name: submission.file_name,
            mime_type: submission.mime_type,
            file_size: submission.file_size,
            sort_order: 0,
          }];
      const results = [];
      for (const file of ordered) {
        try {
          const content = await reader.read({ submission: { ...submission, ...file, delivery_id: submission.delivery_id, user_id: submission.user_id }, assignment });
          results.push({ fileName: file.file_name, sortOrder: file.sort_order, warnings: [], ...content });
        } catch (error) {
          if (!SKIPPABLE_BUNDLE_FILE_ERRORS.has(error?.code)) throw error;
          results.push({ fileName: file.file_name, sortOrder: file.sort_order, extractedText: '', extractionMethod: 'unreadable', warnings: [error.message] });
        }
      }
      return results;
    },
  };
  return reader;
};
