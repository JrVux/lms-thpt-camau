import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import api from '../services/api';

const STORAGE_KEY = (id) => `html_draft_${id}`;

const runHTMLTests = (htmlCode, testCases) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlCode, 'text/html');
  return testCases.map((tc) => {
    try {
      const found = doc.querySelector(tc.expected_output);
      return {
        test_case_id: tc.id,
        passed: found !== null,
        actual_output: found ? found.outerHTML.substring(0, 100) : 'Không tìm thấy',
        error_message: found ? null : `Không có ${tc.expected_output} trong HTML`,
      };
    } catch (e) {
      return { test_case_id: tc.id, passed: false, actual_output: '', error_message: e.message };
    }
  });
};

const HTMLPractice = () => {
  const { id: assignmentId } = useParams();
  const navigate = useNavigate();
  const debounceRef = useRef(null);
  const [assignment, setAssignment] = useState(null);
  const [code, setCode] = useState('');
  const [results, setResults] = useState([]);
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);
  const [draftCode, setDraftCode] = useState('');
  const [submissionInfo, setSubmissionInfo] = useState(null);
  const [readOnly, setReadOnly] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [assignRes, subRes] = await Promise.all([
          api.get(`/api/assignments/${assignmentId}`),
          api.get(`/api/submissions/my/${assignmentId}`),
        ]);
        const assignData = assignRes.data;
        setAssignment(assignData);
        if (subRes.data) {
          setSubmissionInfo(subRes.data);
          if (subRes.data.remaining_attempts === 0 && subRes.data.data) {
            setReadOnly(true);
            setCode(subRes.data.data.code || '');
            setPreviewHtml(subRes.data.data.code || '');
            setResults((subRes.data.data.submission_results || []).map((sr) => ({
              test_case_id: sr.test_case_id,
              passed: sr.passed,
              actual_output: sr.actual_output,
              error_message: sr.error_message,
              points: sr.points || 1,
            })));
            setChecked(true);
            return;
          }
        }

        const saved = localStorage.getItem(STORAGE_KEY(assignmentId));
        const starter = assignData.starter_code || '<!DOCTYPE html>\n<html>\n<head><title>Trang của tôi</title></head>\n<body>\n  \n</body>\n</html>';

        if (saved && saved !== starter) {
          setDraftCode(saved);
          setShowDraftPrompt(true);
          setCode(starter);
        } else {
          setCode(starter);
        }
        setPreviewHtml(saved || starter);
      } catch {
        setError('Không thể tải bài tập');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [assignmentId]);

  const handleCodeChange = useCallback((value) => {
    const v = value || '';
    setCode(v);
    localStorage.setItem(STORAGE_KEY(assignmentId), v);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPreviewHtml(v);
    }, 500);
  }, [assignmentId]);

  const continueDraft = () => {
    setCode(draftCode);
    setPreviewHtml(draftCode);
    setShowDraftPrompt(false);
  };

  const discardDraft = () => {
    localStorage.removeItem(STORAGE_KEY(assignmentId));
    setShowDraftPrompt(false);
  };

  const handleCheck = () => {
    const testCases = assignment?.test_cases || [];
    if (testCases.length === 0) {
      setError('Bài tập này không có test cases');
      return;
    }
    const res = runHTMLTests(code, testCases);
    setResults(res);
    setChecked(true);
    setError('');
  };

  const handleSubmit = async () => {
    if (!checked) {
      setError('Vui lòng kiểm tra bài trước khi nộp');
      return;
    }
    if (submissionInfo?.remaining_attempts !== null && submissionInfo?.remaining_attempts <= 0) {
      setError(`Bạn đã nộp đủ ${submissionInfo.max_submissions} lần, không thể nộp thêm`);
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/api/submit', {
        assignment_id: assignmentId,
        code,
        results,
      });
      localStorage.removeItem(STORAGE_KEY(assignmentId));
      if (!assignment?.class_id) throw new Error('Không tìm thấy class_id');
      navigate(`/classes/${assignment.class_id}`);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Nộp bài thất bại');
    } finally {
      setSubmitting(false);
    }
  };

  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;
  const earnedPoints = results.reduce((sum, r) => sum + (r.passed ? (r.points || 1) : 0), 0);
  const maxPoints = results.reduce((sum, r) => sum + (r.points || 1), 0);

  if (loading) return <div className="text-center py-10 text-gray-500">Đang tải bài tập...</div>;

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col">
      {showDraftPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-lg font-bold text-gray-800 mb-2">Bản nháp chưa lưu</h3>
            <p className="text-sm text-gray-600 mb-4">Bạn có bản nháp chưa lưu, tiếp tục không?</p>
            <div className="flex gap-3">
              <button onClick={discardDraft}
                className="flex-1 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm font-medium">
                Bỏ qua
              </button>
              <button onClick={continueDraft}
                className="flex-1 py-2 bg-[#2563EB] text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
                Tiếp tục
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">{assignment?.title}</h2>
          <div className="flex items-center gap-2 mt-0.5">
            {assignment?.description && <p className="text-sm text-gray-500">{assignment.description}</p>}
            {submissionInfo?.max_submissions && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${submissionInfo.remaining_attempts > 0 ? 'bg-blue-100 text-blue-700' : (readOnly ? 'bg-gray-100 text-gray-600' : 'bg-red-100 text-red-700')}`}>
                {readOnly
                  ? `Đã nộp — hết lượt`
                  : submissionInfo.remaining_attempts > 0
                    ? `Còn ${submissionInfo.remaining_attempts}/${submissionInfo.max_submissions} lần nộp`
                    : `Đã nộp đủ ${submissionInfo.max_submissions} lần`}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {checked && (
            <span className="text-sm font-medium">
              <span className={earnedPoints === maxPoints ? 'text-green-600' : 'text-orange-500'}>
                {earnedPoints}/{maxPoints} điểm
              </span>
            </span>
          )}
          {readOnly ? (
            <span className="text-sm text-gray-400 italic">Kết quả bài làm gần nhất</span>
          ) : (
            <>
            <button
              onClick={handleCheck}
              disabled={submissionInfo?.remaining_attempts <= 0}
              className="px-4 py-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:bg-amber-300 text-sm font-medium"
            >
              Kiểm tra bài
            </button>
            <button
              onClick={handleSubmit}
              disabled={!checked || submitting || submissionInfo?.remaining_attempts <= 0}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium ${
                checked && submissionInfo?.remaining_attempts !== 0
                  ? 'bg-[#2563EB] text-white hover:bg-blue-700'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {submitting ? 'Đang nộp...' : submissionInfo?.remaining_attempts <= 0 ? 'Hết lượt nộp' : 'Nộp bài'}
            </button>
            </>
          )}
        </div>
      </div>

      {error && <div className="mb-3 p-3 bg-red-50 text-red-600 rounded-lg text-sm flex-shrink-0">{error}</div>}

      {readOnly && (
        <div className="mb-3 p-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-sm flex-shrink-0">
          Bạn đã nộp đủ số lần cho bài tập này. Đây là bài làm gần nhất của bạn.
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
        <div className="rounded-lg overflow-hidden border">
          <div className="bg-gray-100 px-4 py-1.5 text-sm font-medium text-gray-600 border-b">{readOnly ? 'Bài làm đã nộp (chỉ đọc)' : 'HTML'}</div>
          <Editor
            language="html"
            value={code}
            onChange={readOnly ? undefined : handleCodeChange}
            theme="light"
            options={{ minimap: { enabled: false }, fontSize: 14, scrollBeyondLastLine: false, readOnly }}
          />
        </div>

        <div className="rounded-lg overflow-hidden border bg-white flex flex-col">
          <div className="bg-gray-100 px-4 py-1.5 text-sm font-medium text-gray-600 border-b">Xem trước</div>
          <iframe
            srcDoc={previewHtml}
            title="preview"
            className="w-full flex-1"
            sandbox="allow-scripts"
          />
        </div>
      </div>

      {results.length > 0 && (
        <div className="mt-3 bg-white rounded-lg border p-4 flex-shrink-0 max-h-40 overflow-auto">
          {/* Biểu điểm tổng */}
          <div className="mb-3 p-2 bg-gray-50 rounded-lg border">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-gray-700">Tổng điểm</span>
              <span className="text-lg font-bold">{earnedPoints}/{maxPoints}</span>
            </div>
            <div className="mt-1 w-full bg-gray-200 rounded-full h-1.5">
              <div className={`h-1.5 rounded-full transition-all ${earnedPoints === maxPoints ? 'bg-green-500' : 'bg-amber-500'}`}
                style={{ width: `${maxPoints > 0 ? Math.round((earnedPoints / maxPoints) * 100) : 0}%` }} />
            </div>
          </div>

          <h3 className="text-sm font-semibold text-gray-800 mb-2">{readOnly ? 'Kết quả chấm điểm' : 'Chi tiết test cases'}</h3>
          <div className="flex flex-wrap gap-2">
            {results.map((r, i) => {
              const testInfo = assignment?.test_cases?.[i];
              const pts = r.points || testInfo?.points || 1;
              return (
                <div key={i}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm ${
                    r.passed ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'
                  }`}
                >
                  <span>{r.passed ? `✓ +${pts}đ` : '✗ 0đ'}</span>
                  <span className="font-medium">{testInfo?.test_name || `Test ${i + 1}`}</span>
                  {!r.passed && r.error_message && (
                    <span className="text-xs opacity-75 ml-1">({r.error_message})</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default HTMLPractice;
