import React, { useRef, useState } from 'react';
import { UploadCloud, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { validateSelectedFile, formatFileSize } from '../utils/fileSubmission';

export default function FileDropzone({
  settings = {},
  disabled = false,
  onSelectFile,
  selectedFile = null,
  uploadProgress = 0,
  isUploading = false,
}) {
  const fileInputRef = useRef(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState('');

  const handleFileChange = (file) => {
    if (!file) return;
    const err = validateSelectedFile(file, settings);
    if (err) {
      setError(err);
      onSelectFile?.(null);
      return;
    }
    setError('');
    onSelectFile?.(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled || isUploading) return;
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileChange(files[0]);
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
            : selectedFile
            ? 'border-emerald-500/50 bg-emerald-500/5'
            : disabled
            ? 'border-slate-700 bg-slate-900/30 opacity-60 cursor-not-allowed'
            : 'border-slate-700 bg-slate-900/50 hover:border-slate-500 hover:bg-slate-800/50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          disabled={disabled || isUploading}
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleFileChange(e.target.files[0]);
            }
          }}
        />

        {selectedFile ? (
          <div className="flex items-center space-x-3 text-emerald-400">
            <CheckCircle2 className="w-8 h-8 flex-shrink-0" />
            <div className="text-left">
              <p className="font-semibold text-slate-200 text-sm truncate max-w-xs md:max-w-md">
                {selectedFile.name}
              </p>
              <p className="text-xs text-slate-400">{formatFileSize(selectedFile.size)}</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center">
            <UploadCloud className="w-10 h-10 text-slate-400 mb-2" />
            <p className="text-sm font-medium text-slate-300">
              Kéo thả file vào đây hoặc <span className="text-blue-400 underline">bấm chọn file</span>
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Cho phép file tối đa {settings.max_file_size_mb || 25} MB
            </p>
          </div>
        )}
      </div>

      {isUploading && (
        <div className="space-y-1.5 bg-slate-900/70 p-3 rounded-lg border border-slate-800">
          <div className="flex justify-between text-xs font-medium text-slate-300">
            <span>Đang tải file lên R2...</span>
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
