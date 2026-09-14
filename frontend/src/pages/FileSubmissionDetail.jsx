import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import api from '../services/api';
import { submitFileBundle } from '../services/fileSubmissionUploads';
import FileDropzone from '../components/FileDropzone';
import EssayPublishedResult from '../components/EssayPublishedResult';
import { formatFileSize } from '../utils/fileSubmission';
import { ArrowLeft, Clock, FileText, Download, AlertTriangle } from 'lucide-react';

export default function FileSubmissionDetail() {
  const { deliveryId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null); // { delivery, assignment, history }
  
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [progressById, setProgressById] = useState({});
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
    const isEssaySubmission = data?.assignment?.submission_type === 'essay';
    if (isEssaySubmission ? selectedFiles.length === 0 : !selectedFile) return;
    setSubmitting(true);
    setSubmitError('');
    setUploadProgress(0);
    setProgressById({});

    try {
      if (isEssaySubmission) {
        const result = await submitFileBundle({
          deliveryId,
          files: selectedFiles,
          onProgress: ({ fileIndex, filePercent, totalPercent }) => {
            setProgressById((current) => ({ ...current, [fileIndex]: filePercent }));
            setUploadProgress(totalPercent);
          },
        });
        setSelectedFiles([]);
        setUploadProgress(0);
        setProgressById({});
        setData((previous) => ({
          ...previous,
          history: result.history || previous.history,
        }));
        setSubmitting(false);
        return;
      }

      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const fileData = reader.result;
          const res = await api.post(
            `/api/file-submissions/deliveries/${deliveryId}/submit`,
            {
              fileName: selectedFile.name,
              mimeType: selectedFile.type,
              fileSize: selectedFile.size,
              fileData,
            },
            {
              onUploadProgress: (evt) => {
                if (evt.total) {
                  setUploadProgress(Math.round((evt.loaded * 100) / evt.total));
                }
              },
            }
          );
          setSelectedFile(null);
          setUploadProgress(0);
          setData((prev) => ({
            ...prev,
            history: res.data.history || prev.history,
          }));
        } catch (err) {
          setSubmitError(err.response?.data?.message || 'Nộp bài thất bại. Vui lòng thử lại.');
        } finally {
          setSubmitting(false);
        }
      };
      reader.onerror = () => {
        setSubmitError('Không thể đọc file trên thiết bị.');
        setSubmitting(false);
      };
      reader.readAsDataURL(selectedFile);
    } catch (err) {
      setSubmitError(
        err.response?.data?.message
          ? `${err.response.data.message} Bài nộp chưa được ghi nhận; bạn có thể nộp lại toàn bộ các file.`
          : 'Bài nộp chưa được ghi nhận. Bạn có thể nộp lại toàn bộ các file.',
      );
      setSubmitting(false);
    }
  };

  const handleDownloadFile = async (submissionId, file = null) => {
    try {
      const endpoint = file?.id
        ? `/api/file-submissions/${submissionId}/files/${file.id}/download`
        : `/api/file-submissions/${submissionId}/download`;
      const response = await api.get(endpoint, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', file?.file_name || `submission_${submissionId}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể tải xuống file.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-slate-400">Đang tải thông tin bài tập...</p>
      </div>
    );
  }

  if (error || !data || !data.assignment) {
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
          {error || 'Không tìm thấy thông tin chi tiết bài tập.'}
        </div>
      </div>
    );
  }

  const { delivery, assignment, history = [] } = data;
  const isEssay = assignment?.submission_type === 'essay';
  const isOverdue = delivery?.due_date && new Date() > new Date(delivery.due_date);
  const allowLate = assignment?.allow_late_submission;
  const isFormLocked = isOverdue && !allowLate;

  const sanitizedEssayHtml = isEssay && assignment.essay_content
    ? DOMPurify.sanitize(marked.parse(assignment.essay_content))
    : '';

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
              onSelectFile={isEssay ? undefined : setSelectedFile}
              selectedFile={isEssay ? null : selectedFile}
              selectedFiles={isEssay ? selectedFiles : undefined}
              onChangeFiles={isEssay ? setSelectedFiles : undefined}
              uploadProgress={uploadProgress}
              progressById={progressById}
              isUploading={submitting}
              multiple={isEssay}
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
                disabled={(isEssay ? selectedFiles.length === 0 : !selectedFile) || submitting}
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

          <div className="space-y-3">
            {history.map((item, idx) => (
              <div key={item.id} className="rounded-xl border border-slate-700/60 bg-slate-900/30 p-4 text-sm space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-slate-200">Lần nộp {history.length - idx}</span>
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
                      Nộp lúc {new Date(item.submitted_at).toLocaleString('vi-VN')}
                  </p>
                  </div>
                </div>

                <div className="space-y-2">
                  {(item.files?.length ? item.files : [item]).map((file, fileIndex) => (
                    <div key={file.id || `${item.id}-${fileIndex}`} className="flex items-center justify-between gap-3 rounded-lg bg-slate-800/70 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-200">{fileIndex + 1}. {file.file_name}</p>
                        <p className="text-xs text-slate-500">{file.mime_type || 'Không rõ định dạng'} · {formatFileSize(file.file_size)}</p>
                      </div>
                      <button type="button" onClick={() => handleDownloadFile(item.id, item.files?.length ? file : null)} className="flex-shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-slate-700/50 hover:text-blue-400" title={`Tải xuống ${file.file_name}`}>
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                {item.grading_status && !item.published_result && (
                  <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3 text-sm text-blue-200">Bài đã được ghi nhận và đang chấm. Kết quả chỉ hiển thị sau khi giáo viên phê duyệt và công bố.</div>
                )}

                <EssayPublishedResult result={item.published_result} maxScore={assignment.max_score || 10} />

                {!item.grading_status && item.score !== null && item.score !== undefined && (
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-emerald-400">Kết quả đánh giá từ giáo viên</span>
                      <span className="font-bold text-emerald-400">{item.score} / {assignment.max_score || 10} điểm</span>
                    </div>
                    {item.feedback && <p className="mt-2 text-slate-300 italic">"{item.feedback}"</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
