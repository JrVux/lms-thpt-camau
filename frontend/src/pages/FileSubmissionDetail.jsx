import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import api from '../services/api';
import {
  requestUploadUrl,
  uploadFileToR2,
  confirmSubmission,
  getDownloadUrl,
} from '../services/edgeFunctions';
import FileDropzone from '../components/FileDropzone';
import { formatFileSize } from '../utils/fileSubmission';
import { ArrowLeft, Clock, FileText, Download, CheckCircle, AlertTriangle } from 'lucide-react';

export default function FileSubmissionDetail() {
  const { deliveryId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null); // { delivery, assignment, history }
  
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const loadDetail = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/api/file-submissions/deliveries/${deliveryId}`);
      setData(res.data);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải chi tiết bài tập.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
  }, [deliveryId]);

  const handleSubmitFile = async () => {
    if (!selectedFile) return;
    setSubmitting(true);
    setSubmitError('');
    setUploadProgress(0);

    try {
      // 1. Request presigned PUT URL and upload token from Edge Function
      const { uploadUrl, uploadToken } = await requestUploadUrl({
        deliveryId,
        fileName: selectedFile.name,
        mimeType: selectedFile.type,
        fileSize: selectedFile.size,
      });

      // 2. Upload binary file directly to Cloudflare R2
      await uploadFileToR2(uploadUrl, selectedFile, (pct) => setUploadProgress(pct));

      // 3. Confirm submission and get updated history
      const confirmed = await confirmSubmission({ uploadToken });
      
      setSelectedFile(null);
      setUploadProgress(0);
      setData((prev) => ({
        ...prev,
        history: confirmed.history || prev.history,
      }));
    } catch (err) {
      setSubmitError(err.message || 'Nộp bài thất bại. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadFile = async (submissionId) => {
    try {
      const res = await getDownloadUrl(submissionId);
      if (res?.downloadUrl) {
        window.open(res.downloadUrl, '_blank');
      }
    } catch (err) {
      alert(err.message || 'Không thể tải xuống file.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-slate-400">Đang tải thông tin bài tập...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <button
          onClick={() => navigate('/my-assignments')}
          className="flex items-center space-x-2 text-slate-400 hover:text-slate-200 mb-4 text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Quay lại bài tập của tôi</span>
        </button>
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl">
          {error || 'Không tìm thấy bài tập.'}
        </div>
      </div>
    );
  }

  const { delivery, assignment, history = [] } = data;
  const isEssay = assignment.submission_type === 'essay';
  const isOverdue = delivery.due_date && new Date() > new Date(delivery.due_date);
  const allowLate = assignment.allow_late_submission;
  const isFormLocked = isOverdue && !allowLate;

  const sanitizedEssayHtml = isEssay && assignment.essay_content
    ? DOMPurify.sanitize(marked.parse(assignment.essay_content))
    : '';

  const latestSubmission = history.find((h) => h.is_latest) || history[0];

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <button
        onClick={() => navigate('/my-assignments')}
        className="flex items-center space-x-2 text-slate-400 hover:text-slate-200 text-sm transition"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Quay lại danh sách bài tập</span>
      </button>

      {/* Header Info */}
      <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center space-x-2 mb-2">
              <span className={`px-2.5 py-0.5 rounded text-xs font-semibold uppercase ${
                isEssay ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
              }`}>
                {isEssay ? 'Tự luận (Nộp file)' : 'Thực hành (Nộp file)'}
              </span>
              <span className="text-xs text-slate-400">{delivery.classes?.name}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-100">{assignment.title}</h1>
          </div>

          <div className="text-right">
            <p className="text-xs text-slate-400">Điểm tối đa</p>
            <p className="text-xl font-bold text-emerald-400">{assignment.max_score || 10} điểm</p>
          </div>
        </div>

        {assignment.description && (
          <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
            {assignment.description}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 pt-2 border-t border-slate-700/50">
          <div className="flex items-center space-x-1.5">
            <Clock className="w-4 h-4 text-slate-400" />
            <span>Hạn nộp: {delivery.due_date ? new Date(delivery.due_date).toLocaleString('vi-VN') : 'Không hạn nộp'}</span>
          </div>

          {isOverdue && (
            <div className={`flex items-center space-x-1.5 px-2 py-0.5 rounded font-medium ${
              allowLate ? 'bg-amber-500/10 text-amber-400' : 'bg-rose-500/10 text-rose-400'
            }`}>
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{allowLate ? 'Đã quá hạn (Cho phép nộp trễ)' : 'Đã hết hạn nộp'}</span>
            </div>
          )}
        </div>
      </div>

      {/* Essay Content Section */}
      {isEssay && sanitizedEssayHtml && (
        <div className="bg-slate-800/40 border border-purple-500/30 rounded-2xl p-6 space-y-3">
          <h2 className="text-sm font-semibold text-purple-300 uppercase tracking-wider flex items-center space-x-2">
            <FileText className="w-4 h-4" />
            <span>Đề bài tự luận</span>
          </h2>
          <div
            className="prose prose-invert max-w-none text-slate-200 text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: sanitizedEssayHtml }}
          />
        </div>
      )}

      {/* Submission Area */}
      <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-6 space-y-4">
        <h2 className="text-base font-semibold text-slate-100">Nộp bài làm của bạn</h2>

        {isFormLocked ? (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm p-4 rounded-xl">
            Bài tập đã quá hạn nộp và giáo viên không bật tùy chọn nộp trễ. Bạn không thể nộp file thêm.
          </div>
        ) : (
          <div className="space-y-4">
            <FileDropzone
              settings={assignment}
              disabled={submitting}
              onSelectFile={setSelectedFile}
              selectedFile={selectedFile}
              uploadProgress={uploadProgress}
              isUploading={submitting}
            />

            {submitError && (
              <div className="text-xs text-rose-400 bg-rose-500/10 p-3 rounded-lg border border-rose-500/20">
                {submitError}
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSubmitFile}
                disabled={!selectedFile || submitting}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-600/20"
              >
                {submitting ? 'Đang gửi bài...' : history.length > 0 ? 'Nộp lại bài làm mới' : 'Nộp bài ngay'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Submission History & Feedback */}
      {history.length > 0 && (
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-6 space-y-4">
          <h2 className="text-base font-semibold text-slate-100">Lịch sử nộp bài ({history.length} lần)</h2>

          {latestSubmission?.score !== null && latestSubmission?.score !== undefined && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-emerald-400">Kết quả đánh giá từ giáo viên</span>
                <span className="text-lg font-bold text-emerald-400">{latestSubmission.score} / {assignment.max_score || 10} điểm</span>
              </div>
              {latestSubmission.feedback && (
                <p className="text-sm text-slate-300 italic">"{latestSubmission.feedback}"</p>
              )}
            </div>
          )}

          <div className="divide-y divide-slate-700/50">
            {history.map((item, idx) => (
              <div key={item.id} className="py-3 flex items-center justify-between text-sm">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-slate-200">{item.file_name}</span>
                    {item.is_latest && (
                      <span className="bg-blue-500/20 text-blue-300 text-xs px-2 py-0.5 rounded font-medium">
                        Bản chính thức
                      </span>
                    )}
                    {item.is_late && (
                      <span className="bg-amber-500/20 text-amber-300 text-xs px-2 py-0.5 rounded font-medium">
                        Nộp trễ
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    Nộp lúc {new Date(item.submitted_at).toLocaleString('vi-VN')} · {formatFileSize(item.file_size)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleDownloadFile(item.id)}
                  className="flex items-center space-x-1 text-slate-400 hover:text-blue-400 transition p-2 rounded-lg hover:bg-slate-700/50"
                  title="Tải xuống bài làm này"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
