import React, { useRef, useState } from 'react';
import { UploadCloud, CheckCircle2, AlertCircle, ArrowUp, ArrowDown, X } from 'lucide-react';
import {
  addSelectedFiles,
  formatFileSize,
  moveSelectedFile,
  removeSelectedFile,
  validateSelectedFile,
} from '../utils/fileSubmission';

export default function FileDropzone({
  settings = {},
  disabled = false,
  onSelectFile,
  selectedFile = null,
  selectedFiles,
  onChangeFiles,
  uploadProgress = 0,
  progressById = {},
  isUploading = false,
  multiple = false,
  maxFiles = 5,
}) {
  const fileInputRef = useRef(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState('');

  const files = Array.isArray(selectedFiles)
    ? selectedFiles
    : selectedFile
      ? [selectedFile]
      : [];

  const notifyFiles = (nextFiles) => {
    onChangeFiles?.(nextFiles);
    if (!onChangeFiles) onSelectFile?.(nextFiles[0] || null);
  };

  const handleFilesChange = (incomingFiles) => {
    const additions = Array.from(incomingFiles || []);
    if (additions.length === 0) return;

    if (!multiple) {
      const file = additions[0];
      const nextError = validateSelectedFile(file, settings);
      setError(nextError || '');
      notifyFiles(nextError ? [] : [file]);
      return;
    }

    const result = addSelectedFiles(files, additions, settings, maxFiles);
    setError(result.error || '');
    if (!result.error) notifyFiles(result.files);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled || isUploading) return;
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFilesChange(files);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    if (!disabled && !isUploading) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  return (
    <div className="space-y-3">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => {
          if (!disabled && !isUploading) fileInputRef.current?.click();
        }}
        className={`relative flex flex-col items-center justify-center p-8 rounded-xl border-2 border-dashed transition-all cursor-pointer ${
          isDragOver
            ? 'border-blue-500 bg-blue-500/10'
            : files.length > 0
            ? 'border-emerald-500/50 bg-emerald-500/5'
            : disabled
            ? 'border-slate-700 bg-slate-900/30 opacity-60 cursor-not-allowed'
            : 'border-slate-700 bg-slate-900/50 hover:border-slate-500 hover:bg-slate-800/50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple={multiple}
          className="hidden"
          disabled={disabled || isUploading}
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleFilesChange(e.target.files);
              e.target.value = '';
            }
          }}
        />

        {!multiple && files[0] ? (
          <div className="flex items-center space-x-3 text-emerald-400">
            <CheckCircle2 className="w-8 h-8 flex-shrink-0" />
            <div className="text-left">
              <p className="font-semibold text-slate-200 text-sm truncate max-w-xs md:max-w-md">
                {files[0].name}
              </p>
              <p className="text-xs text-slate-400">{formatFileSize(files[0].size)}</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center">
            <UploadCloud className="w-10 h-10 text-slate-400 mb-2" />
            <p className="text-sm font-medium text-slate-300">
              Kéo thả file vào đây hoặc <span className="text-blue-400 underline">bấm chọn file</span>
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {multiple ? `${files.length}/${maxFiles} file · ` : ''}Mỗi file tối đa {settings.max_file_size_mb || 25} MB
            </p>
          </div>
        )}
      </div>

      {multiple && files.length > 0 && (
        <div className="space-y-2" aria-label="Danh sách file đã chọn">
          {files.map((file, index) => {
            const progress = Number(progressById[index] ?? progressById[file.name] ?? 0);
            return (
              <div key={`${file.name}-${file.size}-${index}`} className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-200">{index + 1}. {file.name}</p>
                    <p className="text-xs text-slate-500">{file.type || 'Không rõ định dạng'} · {formatFileSize(file.size)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" aria-label={`Đưa ${file.name} lên`} disabled={disabled || isUploading || index === 0} onClick={(event) => { event.stopPropagation(); notifyFiles(moveSelectedFile(files, index, -1)); }} className="rounded p-1 text-slate-400 hover:bg-slate-800 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                    <button type="button" aria-label={`Đưa ${file.name} xuống`} disabled={disabled || isUploading || index === files.length - 1} onClick={(event) => { event.stopPropagation(); notifyFiles(moveSelectedFile(files, index, 1)); }} className="rounded p-1 text-slate-400 hover:bg-slate-800 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                    <button type="button" aria-label={`Xóa ${file.name}`} disabled={disabled || isUploading} onClick={(event) => { event.stopPropagation(); notifyFiles(removeSelectedFile(files, index)); }} className="rounded p-1 text-rose-400 hover:bg-rose-500/10 disabled:opacity-30"><X className="h-4 w-4" /></button>
                  </div>
                </div>
                {isUploading && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isUploading && (
        <div className="space-y-1.5 bg-slate-900/70 p-3 rounded-lg border border-slate-800">
          <div className="flex justify-between text-xs font-medium text-slate-300">
            <span>{multiple ? 'Tổng tiến độ tải lên...' : 'Đang tải file lên R2...'}</span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center space-x-2 text-rose-400 text-xs bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/20">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
