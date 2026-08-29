import React from 'react';
import { SUPPORTED_FILE_MIME_TYPES } from '../utils/fileSubmission';

const MIME_LABELS = [
  { mime: 'application/pdf', label: 'PDF (.pdf)' },
  { mime: 'application/msword', label: 'Word cũ (.doc)' },
  { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', label: 'Word (.docx)' },
  { mime: 'application/vnd.ms-powerpoint', label: 'PowerPoint cũ (.ppt)' },
  { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', label: 'PowerPoint (.pptx)' },
  { mime: 'image/jpeg', label: 'Ảnh JPEG (.jpg, .jpeg)' },
  { mime: 'image/png', label: 'Ảnh PNG (.png)' },
  { mime: 'image/webp', label: 'Ảnh WebP (.webp)' },
];

export default function FileAssignmentFields({ value = {}, onChange }) {
  const submissionType = value.submission_type || 'autograde';
  const essayContent = value.essay_content || '';
  const allowedMimeTypes = value.allowed_mime_types || SUPPORTED_FILE_MIME_TYPES;
  const maxFileSizeMb = value.max_file_size_mb || 25;
  const allowLateSubmission = Boolean(value.allow_late_submission);

  const handleTypeChange = (type) => {
    onChange({
      ...value,
      submission_type: type,
      allowed_mime_types: type !== 'autograde' && !value.allowed_mime_types ? SUPPORTED_FILE_MIME_TYPES : allowedMimeTypes,
    });
  };

  const handleMimeToggle = (mime) => {
    let next;
    if (allowedMimeTypes.includes(mime)) {
      next = allowedMimeTypes.filter((m) => m !== mime);
    } else {
      next = [...allowedMimeTypes, mime];
    }
    onChange({ ...value, allowed_mime_types: next });
  };

  return (
    <div className="space-y-6 bg-slate-800/40 p-6 rounded-xl border border-slate-700/60">
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-3">
          Hình thức làm bài & nộp bài
        </label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => handleTypeChange('autograde')}
            className={`p-3 rounded-lg border text-sm font-medium text-left transition ${
              submissionType === 'autograde'
                ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400'
                : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:border-slate-600'
            }`}
          >
            <div className="font-semibold mb-1">⚡ Tự động chấm</div>
            <div className="text-xs opacity-80">Học sinh viết code Python, SQL hoặc HTML, hệ thống chấm điểm tự động.</div>
          </button>

          <button
            type="button"
            onClick={() => handleTypeChange('practice_file')}
            className={`p-3 rounded-lg border text-sm font-medium text-left transition ${
              submissionType === 'practice_file'
                ? 'bg-blue-500/10 border-blue-500 text-blue-400'
                : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:border-slate-600'
            }`}
          >
            <div className="font-semibold mb-1">📁 Thực hành (Nộp File)</div>
            <div className="text-xs opacity-80">Học sinh nộp sản phẩm/kết quả thực hành dưới dạng file (PDF, Word, Ảnh).</div>
          </button>

          <button
            type="button"
            onClick={() => handleTypeChange('essay')}
            className={`p-3 rounded-lg border text-sm font-medium text-left transition ${
              submissionType === 'essay'
                ? 'bg-purple-500/10 border-purple-500 text-purple-400'
                : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:border-slate-600'
            }`}
          >
            <div className="font-semibold mb-1">📝 Tự luận (Nộp File)</div>
            <div className="text-xs opacity-80">Giáo viên soạn đề trên hệ thống, học sinh đọc đề và nộp bài làm bằng file.</div>
          </button>
        </div>
      </div>

      {submissionType === 'essay' && (
        <div>
          <label className="block text-sm font-medium text-purple-300 mb-2">
            Đề bài tự luận (hỗ trợ định dạng Markdown) <span className="text-rose-400">*</span>
          </label>
          <textarea
            rows={6}
            value={essayContent}
            onChange={(e) => onChange({ ...value, essay_content: e.target.value })}
            placeholder="Nhập nội dung đề bài tự luận tại đây (dùng định dạng Markdown để tạo tiêu đề, danh sách, công thức...)"
            className="w-full bg-slate-900 border border-purple-500/30 rounded-lg p-3 text-slate-200 text-sm focus:outline-none focus:border-purple-500"
          />
        </div>
      )}

      {submissionType !== 'autograde' && (
        <div className="space-y-4 pt-2 border-t border-slate-700/50">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Định dạng file học sinh được phép nộp
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {MIME_LABELS.map(({ mime, label }) => (
                <label key={mime} className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer bg-slate-900/40 p-2 rounded border border-slate-700/50 hover:bg-slate-800">
                  <input
                    type="checkbox"
                    checked={allowedMimeTypes.includes(mime)}
                    onChange={() => handleMimeToggle(mime)}
                    className="rounded text-blue-600 focus:ring-blue-500 bg-slate-800 border-slate-700"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Dung lượng tối đa (MB)
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={maxFileSizeMb}
                onChange={(e) => onChange({ ...value, max_file_size_mb: Number(e.target.value) })}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-slate-200 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex items-center pt-6">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowLateSubmission}
                  onChange={(e) => onChange({ ...value, allow_late_submission: e.target.checked })}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 bg-slate-900 border-slate-700"
                />
                <span className="text-sm font-medium text-slate-300">
                  Cho phép nộp muộn sau deadline (đánh dấu Nộp trễ)
                </span>
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
