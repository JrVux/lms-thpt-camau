import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import api from '../services/api';
import { gradeSubmission } from '../services/edgeFunctions';
import FilePreview from '../components/FilePreview';
import EssayPercentageReview from '../components/EssayPercentageReview';
import { percentageFromScore, scoreFromPercentage } from '../utils/essayPercentageGrading';
import {
  filterRoster,
  nextRosterIndex,
  toReportRows,
  formatFileSize,
} from '../utils/fileSubmission';
import {
  ArrowLeft,
  Filter,
  Download,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
  ChevronRight,
  Save,
} from 'lucide-react';

export default function FileSubmissionManager() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [roster, setRoster] = useState([]);
  const [filterKey, setFilterKey] = useState('all');
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [selectedSubmissionIds, setSelectedSubmissionIds] = useState([]);

  // Grading form state
  const [score, setScore] = useState('');
  const [feedback, setFeedback] = useState('');
  const [savingGrade, setSavingGrade] = useState(false);
  const [gradeError, setGradeError] = useState('');
  const [criteriaResults, setCriteriaResults] = useState([]);
  const [correctnessPercentage, setCorrectnessPercentage] = useState('');
  const [showModelAnswer, setShowModelAnswer] = useState(false);

  const loadRoster = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/api/assignment-library/${assignmentId}/file-submissions`);
      setRoster(res.data || []);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải danh sách nộp bài.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoster();
  }, [assignmentId]);

  const filteredRoster = useMemo(
    () => filterRoster(roster, filterKey),
    [roster, filterKey]
  );

  const selectedItem = selectedIndex !== null ? filteredRoster[selectedIndex] : null;
  const isPercentageReview = selectedItem?.essay_grading?.job?.grading_method === 'percentage_v2';
  const selectedMaxScore = Number(selectedItem?.latest?.max_score || 10);

  useEffect(() => {
    if (selectedItem?.latest) {
      const report = selectedItem.essay_grading?.report;
      setScore(report?.reviewed_score ?? report?.ai_score ?? selectedItem.latest.score ?? '');
      setFeedback(report?.reviewed_feedback ?? report?.ai_overall_feedback ?? selectedItem.latest.feedback ?? '');
      setCriteriaResults(report?.reviewed_criteria_results ?? report?.ai_criteria_results ?? selectedItem.essay_grading?.job?.rubric_snapshot?.map((item) => ({ rubric_item_id: item.id, awarded_points: 0, status: 'uncertain', explanation: 'Giáo viên chấm thủ công', evidence_snippets: [], confidence: 1 })) ?? []);
      setCorrectnessPercentage(report?.reviewed_correctness_percentage ?? report?.ai_correctness_percentage ?? '');
      setShowModelAnswer(Boolean(report?.show_model_answer));
      setGradeError('');
    } else {
      setScore('');
      setFeedback('');
      setCriteriaResults([]);
      setCorrectnessPercentage('');
      setGradeError('');
    }
  }, [selectedIndex, selectedItem]);

  const submittedCount = roster.filter((r) => r.status !== 'missing').length;
  const totalCount = roster.length;

  const handleGrade = async (advanceNext = false) => {
    if (!selectedItem?.latest?.id) return;

    const numScore = Number(score);
    if (isNaN(numScore) || numScore < 0) {
      setGradeError('Điểm số phải là số lớn hơn hoặc bằng 0.');
      return;
    }

    try {
      setSavingGrade(true);
      setGradeError('');

      const response = await api.post(`/api/file-submissions/${selectedItem.latest.id}/grade`, {
        score: numScore,
        feedback,
      });

      if (response.data?.submission?.publication_required) {
        await loadRoster();
        return;
      }

      // Update in place
      setRoster((prev) =>
        prev.map((item) => {
          if (item.delivery_id === selectedItem.delivery_id && item.student_id === selectedItem.student_id) {
            return {
              ...item,
              status: 'graded',
              latest: {
                ...item.latest,
                score: numScore,
                feedback,
                graded_at: new Date().toISOString(),
              },
            };
          }
          return item;
        })
      );

      if (advanceNext && filteredRoster.length > 1) {
        const nextIdx = nextRosterIndex(filteredRoster, selectedIndex);
        setSelectedIndex(nextIdx);
      }
    } catch (err) {
      setGradeError(err.message || 'Lỗi lưu điểm.');
    } finally {
      setSavingGrade(false);
    }
  };

  const handleAiReview = async (approved, rejected = false) => {
    if (!selectedItem?.latest?.id) return;
    try {
      setSavingGrade(true);
      setGradeError('');
      await api.patch(`/api/file-submissions/${selectedItem.latest.id}/ai-grading`, {
        ...(isPercentageReview
          ? { correctness_percentage: Number(correctnessPercentage) }
          : { criteria_results: criteriaResults }),
        feedback,
        approved,
        rejected,
        show_model_answer: showModelAnswer,
      });
      await loadRoster();
    } catch (err) {
      setGradeError(err.response?.data?.message || 'Không thể lưu bản duyệt.');
    } finally { setSavingGrade(false); }
  };

  const handlePercentageChange = (value) => {
    setCorrectnessPercentage(value);
    const next = Number(value);
    if (Number.isFinite(next) && next >= 0 && next <= 100) setScore(scoreFromPercentage(selectedMaxScore, next));
  };

  const handleScoreChange = (value) => {
    setScore(value);
    const next = Number(value);
    if (Number.isFinite(next) && next >= 0 && next <= selectedMaxScore) setCorrectnessPercentage(percentageFromScore(selectedMaxScore, next));
  };

  const handleRetryAi = async () => {
    try {
      setSavingGrade(true);
      await api.post(`/api/file-submissions/${selectedItem.latest.id}/ai-grading/retry`);
      await loadRoster();
    } catch (err) { setGradeError(err.response?.data?.message || 'Không thể yêu cầu AI chấm lại.'); }
    finally { setSavingGrade(false); }
  };

  const handlePublish = async (mode, published = true, ids = selectedSubmissionIds) => {
    try {
      setSavingGrade(true);
      setGradeError('');
      await api.post(`/api/assignment-library/${assignmentId}/essay-results/publish`, { mode, submission_ids: ids, published });
      setSelectedSubmissionIds([]);
      await loadRoster();
    } catch (err) { setGradeError(err.response?.data?.message || 'Không thể cập nhật trạng thái công bố.'); }
    finally { setSavingGrade(false); }
  };

  const handleExportCsv = async () => {
    try {
      const response = await api.get(`/api/assignment-library/${assignmentId}/file-submissions/export?format=csv`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `file_submissions_${assignmentId}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      alert('Không thể xuất file CSV.');
    }
  };

  const handleExportXlsx = async () => {
    try {
      const res = await api.get(`/api/assignment-library/${assignmentId}/file-submissions/export?format=json`);
      const worksheet = XLSX.utils.json_to_sheet(res.data || []);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Báo cáo nộp bài');
      XLSX.writeFile(workbook, `file_submissions_${assignmentId}.xlsx`);
    } catch {
      alert('Không thể xuất file Excel.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-slate-400">Đang tải bảng quản lý bài nộp...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      <button
        onClick={() => navigate('/assignments')}
        className="flex items-center space-x-2 text-slate-400 hover:text-slate-200 text-sm transition"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Quay lại kho bài tập</span>
      </button>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-800/60 p-6 rounded-2xl border border-slate-700/60">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Quản lý & Chấm bài nộp</h1>
          <p className="text-sm text-slate-400 mt-1">
            Tổng cộng: <span className="font-semibold text-emerald-400">{submittedCount}/{totalCount}</span> học sinh đã nộp bài
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {roster.some((item) => item.essay_grading) && <>
            <button onClick={() => handlePublish('selected')} disabled={!selectedSubmissionIds.length || savingGrade} className="rounded-xl bg-violet-600 px-3.5 py-2 text-xs font-medium text-white disabled:opacity-40">Công bố đã chọn ({selectedSubmissionIds.length})</button>
            <button onClick={() => handlePublish('all')} disabled={savingGrade} className="rounded-xl border border-violet-500/50 px-3.5 py-2 text-xs font-medium text-violet-200">Công bố tất cả đã duyệt</button>
          </>}
          <button
            onClick={handleExportCsv}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-medium transition"
          >
            <Download className="w-4 h-4" />
            <span>Xuất CSV</span>
          </button>
          <button
            onClick={handleExportXlsx}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition"
          >
            <Download className="w-4 h-4" />
            <span>Xuất Excel (.xlsx)</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Filters Bar */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-2">
        {[
          { key: 'all', label: `Tất cả (${roster.length})` },
          ...(roster.some((item) => item.essay_grading) ? [
            { key: 'ai_processing', label: `AI đang xử lý (${filterRoster(roster, 'ai_processing').length})` },
            { key: 'ai_review', label: `Chờ duyệt (${filterRoster(roster, 'ai_review').length})` },
            { key: 'ai_approved', label: `Đã duyệt (${filterRoster(roster, 'ai_approved').length})` },
            { key: 'ai_published', label: `Đã công bố (${filterRoster(roster, 'ai_published').length})` },
            { key: 'ai_failed', label: `Cần xử lý (${filterRoster(roster, 'ai_failed').length})` },
          ] : []),
          { key: 'submitted', label: `Đã nộp đúng hạn (${roster.filter((r) => r.status === 'submitted').length})` },
          { key: 'late', label: `Nộp trễ (${roster.filter((r) => r.status === 'late').length})` },
          { key: 'graded', label: `Đã chấm (${roster.filter((r) => r.status === 'graded').length})` },
          { key: 'missing', label: `Chưa nộp (${roster.filter((r) => r.status === 'missing').length})` },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => {
              setFilterKey(key);
              setSelectedIndex(null);
            }}
            className={`px-4 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition ${
              filterKey === key
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                : 'bg-slate-800/80 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Main Table + Panel Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Roster Table */}
        <div className={`space-y-3 transition-all ${selectedItem ? 'lg:col-span-5' : 'lg:col-span-12'}`}>
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-900/60 text-xs uppercase text-slate-400 border-b border-slate-700/60">
                  <tr>
                    <th className="p-3.5">Chọn</th>
                    <th className="p-3.5">Học sinh</th>
                    <th className="p-3.5">Lớp</th>
                    <th className="p-3.5">Trạng thái</th>
                    <th className="p-3.5">Điểm</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/40">
                  {filteredRoster.map((item, idx) => {
                    const isSelected = selectedIndex === idx;
                    return (
                      <tr
                        key={`${item.delivery_id}_${item.student_id}`}
                        onClick={() => setSelectedIndex(idx)}
                        className={`cursor-pointer transition hover:bg-slate-700/40 ${
                          isSelected ? 'bg-blue-500/10 border-l-4 border-l-blue-500' : ''
                        }`}
                      >
                        <td className="p-3.5" onClick={(event) => event.stopPropagation()}>
                          {item.latest?.id && item.essay_grading && <input type="checkbox" checked={selectedSubmissionIds.includes(item.latest.id)} onChange={(event) => setSelectedSubmissionIds((current) => event.target.checked ? [...new Set([...current, item.latest.id])] : current.filter((id) => id !== item.latest.id))} />}
                        </td>
                        <td className="p-3.5 font-medium text-slate-100">
                          {item.student_name}
                        </td>
                        <td className="p-3.5 text-xs text-slate-400">
                          {item.class_name}
                        </td>
                        <td className="p-3.5">
                          {item.essay_grading?.job?.status === 'awaiting_review' && <span className="mr-1 rounded border border-violet-500/30 bg-violet-500/20 px-2 py-0.5 text-xs font-medium text-violet-300">AI chờ duyệt</span>}
                          {item.essay_grading?.job?.status === 'failed' && <span className="mr-1 rounded border border-rose-500/30 bg-rose-500/20 px-2 py-0.5 text-xs font-medium text-rose-300">AI lỗi</span>}
                          {item.essay_grading?.job?.status === 'not_queued' && <span className="mr-1 rounded border border-amber-500/30 bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-300">Chưa vào hàng chờ</span>}
                          {item.essay_grading?.report?.published_at && <span className="mr-1 rounded border border-emerald-500/30 bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-300">Đã công bố</span>}
                          {item.status === 'graded' && (
                            <span className="bg-blue-500/20 text-blue-300 border border-blue-500/30 text-xs px-2 py-0.5 rounded font-medium">
                              Đã chấm
                            </span>
                          )}
                          {item.status === 'late' && (
                            <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs px-2 py-0.5 rounded font-medium">
                              Nộp trễ
                            </span>
                          )}
                          {item.status === 'submitted' && (
                            <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs px-2 py-0.5 rounded font-medium">
                              Đã nộp
                            </span>
                          )}
                          {item.status === 'missing' && (
                            <span className="bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs px-2 py-0.5 rounded font-medium">
                              Chưa nộp
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 font-semibold text-slate-200">
                          {item.essay_grading?.report?.reviewed_score ?? item.essay_grading?.report?.ai_score ?? item.latest?.score ?? '-'}{(item.essay_grading?.report || item.latest?.score !== undefined) ? 'đ' : ''}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredRoster.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-500 text-sm">
                        Không tìm thấy học sinh phù hợp bộ lọc.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Side Grading Panel */}
        {selectedItem && (
          <div className="lg:col-span-7 bg-slate-800/80 border border-slate-700/80 rounded-2xl p-6 space-y-6 shadow-2xl sticky top-4">
            <div className="flex items-center justify-between border-b border-slate-700/60 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-100">{selectedItem.student_name}</h2>
                <p className="text-xs text-slate-400">{selectedItem.class_name}</p>
              </div>

              <button
                onClick={() => setSelectedIndex(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700/60"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {selectedItem.latest ? (
              <div className="space-y-6">
                {/* File Preview */}
                <FilePreview
                  submissionId={selectedItem.latest.id}
                  fileName={selectedItem.latest.file_name}
                  mimeType={selectedItem.latest.mime_type}
                />

                {/* Grading Form */}
                <div className="bg-slate-900/60 p-5 rounded-xl border border-slate-700/60 space-y-4">
                  <h3 className="text-sm font-semibold text-slate-200">{selectedItem.essay_grading ? 'Duyệt bản chấm AI' : 'Chấm điểm & Nhận xét'}</h3>

                  {selectedItem.essay_grading?.job?.status === 'failed' && <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-300">AI chưa chấm được bài này ({selectedItem.essay_grading.job.error_code || 'AI_ESSAY_FAILED'}). Bài không bị cho 0 điểm.<button type="button" onClick={handleRetryAi} className="ml-2 underline">Chấm lại</button></div>}
                  {selectedItem.essay_grading?.job?.status === 'not_queued' && <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">Bài đã nộp nhưng chưa vào hàng chờ AI. Bài không bị cho 0 điểm.<button type="button" onClick={handleRetryAi} className="ml-2 underline">Đưa vào hàng chờ</button></div>}
                  {selectedItem.essay_grading?.report?.extraction_warnings?.length > 0 && <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">Cần kiểm tra bản chụp: {selectedItem.essay_grading.report.extraction_warnings.join('; ')}</div>}
                  {selectedItem.essay_grading?.report?.extracted_text && <details className="rounded-lg border border-slate-700 bg-slate-950/50 p-3"><summary className="cursor-pointer text-xs font-semibold text-slate-300">Xem nội dung AI đã đọc từ bài làm</summary><div className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-400">{selectedItem.essay_grading.report.extracted_text}</div></details>}

                  {gradeError && (
                    <div className="text-xs text-rose-400 bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/20">
                      {gradeError}
                    </div>
                  )}

                  {isPercentageReview && selectedItem.essay_grading?.job?.status !== 'not_queued' && <EssayPercentageReview
                    report={selectedItem.essay_grading?.report}
                    maxScore={selectedMaxScore}
                    percentage={correctnessPercentage}
                    score={score}
                    feedback={feedback}
                    onPercentageChange={handlePercentageChange}
                    onScoreChange={handleScoreChange}
                    onFeedbackChange={setFeedback}
                  />}

                  {!isPercentageReview && selectedItem.essay_grading?.job?.status !== 'not_queued' && criteriaResults.length > 0 && <div className="space-y-2">
                    {criteriaResults.map((criterion, index) => {
                      const rule = selectedItem.essay_grading.job.rubric_snapshot?.find((item) => item.id === criterion.rubric_item_id);
                      return <div key={criterion.rubric_item_id} className="rounded-lg border border-slate-700 p-3">
                        <div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold text-slate-200">{rule?.title || criterion.rubric_item_id}</span><label className="text-xs text-slate-400"><input type="number" min="0" max={rule?.max_points} step="0.25" value={criterion.awarded_points} onChange={(event) => setCriteriaResults((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, awarded_points: Number(event.target.value) } : item))} className="mr-1 w-20 rounded border border-slate-700 bg-slate-950 p-1 text-right text-slate-100" />/{rule?.max_points}</label></div>
                        {(criterion.explanation || criterion.feedback) && <p className="mt-1 text-xs text-slate-400">{criterion.explanation || criterion.feedback}</p>}
                        {criterion.evidence_snippets?.length > 0 && <p className="mt-1 text-[11px] italic text-slate-500">Dẫn chứng: {criterion.evidence_snippets.join(' · ')}</p>}
                        {criterion.confidence !== undefined && <p className="mt-1 text-[11px] text-slate-500">Độ tin cậy AI: {Math.round(Number(criterion.confidence) * 100)}%</p>}
                      </div>;
                    })}
                  </div>}

                  {!isPercentageReview && <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        Điểm số <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="0.5"
                        value={selectedItem.essay_grading ? criteriaResults.reduce((sum, item) => sum + Number(item.awarded_points || 0), 0) : score}
                        onChange={(e) => setScore(e.target.value)}
                        readOnly={Boolean(selectedItem.essay_grading)}
                        placeholder="Nhập điểm"
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-100 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        Nhận xét của giáo viên
                      </label>
                      <input
                        type="text"
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        placeholder="Nhập nhận xét động viên hoặc góp ý..."
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-100 text-sm focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>}

                  {selectedItem.essay_grading?.job?.status !== 'not_queued' && <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={showModelAnswer} onChange={(event) => setShowModelAnswer(event.target.checked)} />Cho học sinh xem đáp án mẫu sau khi công bố</label>}

                  <div className="flex items-center justify-end space-x-3 pt-2">
                    {selectedItem.essay_grading?.job && selectedItem.essay_grading.job.status !== 'not_queued' ? <>
                      {selectedItem.essay_grading.report?.published_at && <button type="button" onClick={() => handlePublish('selected', false, [selectedItem.latest.id])} disabled={savingGrade} className="rounded-xl border border-amber-500/40 px-4 py-2 text-xs font-medium text-amber-200">Thu hồi kết quả</button>}
                      <button type="button" onClick={() => handleAiReview(false)} disabled={savingGrade} className="rounded-xl bg-slate-700 px-4 py-2 text-xs font-medium text-slate-200">Lưu bản duyệt</button>
                      <button type="button" onClick={() => handleAiReview(false, true)} disabled={savingGrade} className="rounded-xl border border-rose-500/40 px-4 py-2 text-xs font-medium text-rose-200">Từ chối bản chấm</button>
                      <button type="button" onClick={() => handleAiReview(true)} disabled={savingGrade} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-medium text-white">Phê duyệt</button>
                      <button type="button" onClick={() => handlePublish('selected', true, [selectedItem.latest.id])} disabled={savingGrade || selectedItem.essay_grading.report?.review_status !== 'approved'} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-medium text-white disabled:opacity-40">Công bố bài này</button>
                    </> : selectedItem.essay_grading ? null : <>
                    <button
                      type="button"
                      onClick={() => handleGrade(false)}
                      disabled={savingGrade}
                      className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-medium transition disabled:opacity-50"
                    >
                      Lưu điểm
                    </button>
                    <button
                      type="button"
                      onClick={() => handleGrade(true)}
                      disabled={savingGrade}
                      className="flex items-center space-x-1 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition disabled:opacity-50 shadow-lg shadow-blue-600/20"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Lưu & Bài tiếp theo</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    </>}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center bg-slate-900/40 rounded-xl border border-slate-800 text-slate-500 space-y-2">
                <AlertCircle className="w-8 h-8 mx-auto text-slate-600" />
                <p className="text-sm">Học sinh này chưa nộp bài làm.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
