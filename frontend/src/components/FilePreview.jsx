import React, { useState, useEffect } from 'react';
import { getDownloadUrl } from '../services/edgeFunctions';
import { previewKind } from '../utils/fileSubmission';
import { Download, ExternalLink, RefreshCw, FileText, Image as ImageIcon } from 'lucide-react';

export default function FilePreview({ submissionId, fileName, mimeType }) {
  const [downloadUrl, setDownloadUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchUrl = async () => {
    if (!submissionId) return;
    try {
      setLoading(true);
      setError('');
      const res = await getDownloadUrl(submissionId);
      if (res?.downloadUrl) {
        setDownloadUrl(res.downloadUrl);
      } else {
        setError('Không thể lấy liên kết tải file.');
      }
    } catch (err) {
      setError(err.message || 'Lỗi lấy liên kết xem file.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUrl();
  }, [submissionId]);

  const kind = previewKind(mimeType);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-slate-900/50 rounded-xl border border-slate-800 text-slate-400 space-y-3">
        <RefreshCw className="w-6 h-6 animate-spin text-blue-400" />
        <p className="text-xs">Đang tải bản xem trước an toàn từ Cloudflare R2...</p>
      </div>
    );
  }

  if (error || !downloadUrl) {
    return (
      <div className="p-6 bg-slate-900/60 rounded-xl border border-slate-800 text-center space-y-3">
        <p className="text-sm text-rose-400">{error || 'Không xem được file trực tiếp.'}</p>
        <button
          onClick={fetchUrl}
          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200"
        >
          Thử tải lại
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
      {/* Action Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-800/80 border-b border-slate-700/60 text-xs">
        <span className="font-medium text-slate-200 truncate max-w-xs">{fileName}</span>
        <div className="flex items-center space-x-2">
          <a
            href={downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            download={fileName}
            className="flex items-center space-x-1 px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Tải xuống</span>
          </a>
        </div>
      </div>

      {/* Preview Content Area */}
      <div className="flex-1 min-h-[450px] relative bg-slate-950 flex items-center justify-center overflow-auto p-2">
        {kind === 'image' && (
          <img
            src={downloadUrl}
            alt={fileName}
            className="max-h-[550px] w-auto object-contain rounded shadow-lg"
          />
        )}

        {kind === 'pdf' && (
          <iframe
            src={downloadUrl}
            title={fileName}
            className="w-full h-[550px] border-0 rounded bg-white"
          />
        )}

        {kind === 'office' && (
          <div className="w-full h-full flex flex-col space-y-2">
            <p className="text-xs text-amber-300/80 bg-amber-500/10 p-2 rounded border border-amber-500/20 text-center">
              Nhúng Office Viewer (Docx/Pptx). Bạn cũng có thể bấm nút Tải xuống ở góc trên để mở trực tiếp.
            </p>
            <iframe
              src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(downloadUrl)}`}
              title={fileName}
              className="w-full h-[500px] border-0 rounded bg-white"
            />
          </div>
        )}

        {kind === 'unknown' && (
          <div className="text-center p-8 space-y-3">
            <FileText className="w-12 h-12 text-slate-500 mx-auto" />
            <p className="text-sm text-slate-300">File này không hỗ trợ xem trước trực tiếp.</p>
            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              download={fileName}
              className="inline-flex items-center space-x-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              <span>Tải file về máy</span>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
