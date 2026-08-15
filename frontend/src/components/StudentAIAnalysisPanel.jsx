import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { buildScopePayload, shouldPollAnalysis, analysisStatusLabel, effectiveTeacherReport, effectiveStudentReport } from '../utils/studentAnalysis';
import { api } from '../services/api';

const LIMIT_OPTIONS = [3, 5, 10];

export function StudentAIAnalysisPanel({ classId, studentId, onOpenSubmission }) {
  const [mode, setMode] = useState('latest');
  const [limit, setLimit] = useState(5);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [confirmSparse, setConfirmSparse] = useState(false);
  const [creating, setCreating] = useState(false);
  const [job, setJob] = useState(null);
  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [error, setError] = useState(null);

  const fetchPreview = useCallback(async () => {
    setLoadingPreview(true);
    setError(null);
    try {
      const payload = { scope: mode === 'dates' ? { mode: 'dates', from, to } : { mode: 'latest', limit } };
      const res = await api.post(`/classes/${classId}/students/${studentId}/ai-analysis/preview`, payload);
      setPreview(res.data);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Không thể xem trước dữ liệu');
    } finally {
      setLoadingPreview(false);
    }
  }, [classId, studentId, mode, limit, from, to]);

  useEffect(() => {
    fetchPreview();
  }, [fetchPreview]);

  const fetchReports = useCallback(async () => {
    setLoadingReports(true);
    try {
      const res = await api.get(`/classes/${classId}/students/${studentId}/ai-analysis/reports`);
      setReports(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingReports(false);
    }
  }, [classId, studentId]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const pollJob = useCallback(async (jobId) => {
    try {
      const res = await api.get(`/classes/${classId}/students/${studentId}/ai-analysis/jobs/${jobId}`);
      setJob(res.data);
      return res.data.status;
    } catch (err) {
      return null;
    }
  }, [classId, studentId]);

  const handleCreateJob = async () => {
    setCreating(true);
    setError(null);
    try {
      const payload = {
        scope: mode === 'dates' ? { mode: 'dates', from, to } : { mode: 'latest', limit },
        confirm_sparse_data: confirmSparse,
      };
      const res = await api.post(`/classes/${classId}/students/${studentId}/ai-analysis/jobs`, payload);
      setJob(res.data);
      setCreating(false);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Không thể tạo tác vụ phân tích');
      setCreating(false);
    }
  };

  useEffect(() => {
    if (!job || !shouldPollAnalysis(job.status)) return;
    const interval = setInterval(async () => {
      const status = await pollJob(job.id);
      if (status && !shouldPollAnalysis(status)) {
        setJob({ ...job, status });
        // refresh reports
        const res = await api.get(`/classes/${classId}/students/${studentId}/ai-analysis/reports`);
        setReports(res.data);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [job, shouldPollAnalysis, pollJob]);

  const handleSelectReport = (report) => {
    setSelectedReport(report);
  };

  const handleCloseReport = () => {
    setSelectedReport(null);
  };

  const handleRetry = async (jobId) => {
    setError(null);
    try {
      await api.post(`/classes/${classId}/students/${studentId}/ai-analysis/jobs/${jobId}/retry`);
      const res = await api.get(`/classes/${classId}/students/${studentId}/ai-analysis/reports`);
      setReports(res.data);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Không thể thử lại');
    }
  };

  if (selectedReport) {
    return (
      <StudentAIReportReview
        report={selectedReport}
        onClose={handleCloseReport}
        onSaved={fetchReports}
        onOpenSubmission={onOpenSubmission}
      />
    );
  }

  return (
    <div className="student-ai-analysis-panel">
      <h3>Phân tích bằng AI</h3>

      <div className="scope-selector">
        <label>
          <input type="radio" name="mode" value="latest" checked={mode === 'latest'} onChange={() => setMode('latest')} />
          <span>Bài gần nhất</span>
        </label>
        <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} disabled={mode !== 'latest'}>
          {LIMIT_OPTIONS.map((l) => <option key={l} value={l}>{l} bài</option>)}
        </select>

        <label>
          <input type="radio" name="mode" value="dates" checked={mode === 'dates'} onChange={() => setMode('dates')} />
          <span>Khoảng ngày</span>
        </label>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} disabled={mode !== 'dates'} placeholder="Từ" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} disabled={mode !== 'dates'} placeholder="Đến" />
      </div>

      {preview && (
        <div className="preview-card">
          <h4>Xem trước bằng chứng</h4>
          <div>Số bài nộp: {preview.counts.submission_count}</div>
          <div>Số kết quả test: {preview.counts.test_result_count}</div>
          {preview.sparse && (
            <div className="sparse-warning">
              <label>
                <input type="checkbox" checked={confirmSparse} onChange={(e) => setConfirmSparse(e.target.checked)} />
                Dữ liệu thưa ({preview.counts.submission_count} bài, {preview.counts.test_result_count} test). Xác nhận để tiếp tục.
              </label>
            </div>
          )}
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <div className="actions">
        {!job ? (
          <button onClick={handleCreateJob} disabled={creating || loadingPreview || (preview?.sparse && !confirmSparse)}>
            {creating ? 'Đang tạo...' : 'Phân tích bằng AI'}
          </button>
        ) : (
          <div className="job-status">
            <span>Trạng thái: <strong>{analysisStatusLabel(job.status)}</strong></span>
            {shouldPollAnalysis(job.status) && <span className="polling">Đang chạy...</span>}
            {job.status === 'failed' && <button onClick={() => handleRetry(job.id)}>Thử lại</button>}
            {job.status === 'rejected' && <button onClick={() => handleRetry(job.id)}>Tạo lại theo chỉ dẫn</button>}
          </div>
        )}
      </div>

      <div className="reports-history">
        <h4>Lịch sử báo cáo</h4>
        {loadingReports ? <div>Đang tải...</div> : reports.length === 0 ? <div>Chưa có báo cáo</div> : (
          <ul>
            {reports.map((r) => (
              <li key={r.id}>
                <button onClick={() => handleSelectReport(r)}>
                  {r.id.slice(0,8)} - {analysisStatusLabel(r.status)} - {new Date(r.created_at).toLocaleString('vi-VN')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StudentAIReportReview({ report, onClose, onSaved, onOpenSubmission }) {
  const [teacherReport, setTeacherReport] = useState(effectiveTeacherReport(report));
  const [studentReport, setStudentReport] = useState(effectiveStudentReport(report));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSave = async (decision) => {
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/classes/${classId}/students/${studentId}/ai-analysis/reports/${report.id}/review`, {
        teacher_report: teacherReport,
        student_report: studentReport,
        decision,
        instruction: decision === 'rejected' ? prompt('Nhập chỉ dẫn cho AI phân tích lại:') : undefined,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message ?? 'Không thể lưu');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="report-review-modal">
      <div className="modal-header">
        <h3>Xem xét báo cáo</h3>
        <button onClick={onClose}>Đóng</button>
      </div>
      {error && <div className="error">{error}</div>}

      <div className="tabs">
        <button className="active">Dành cho giáo viên</button>
        <button>Dành cho học sinh</button>
      </div>

      <div className="report-editor">
        <div>
          <label>Tóm tắt</label>
          <textarea value={teacherReport?.summary || ''} onChange={(e) => setTeacherReport({ ...teacherReport, summary: e.target.value })} />
        </div>
        {/* ... other fields ... */}
      </div>

      <div className="actions">
        <button onClick={() => handleSave('approved_internal')} disabled={saving}>Lưu nội bộ</button>
        <button onClick={() => handleSave('published')} disabled={saving}>Duyệt và công bố</button>
        <button onClick={() => handleSave('rejected')} disabled={saving}>Từ chối và phân tích lại</button>
        <button onClick={onClose} disabled={saving}>Hủy</button>
      </div>
    </div>
  );
}

export default StudentAIAnalysisPanel;
