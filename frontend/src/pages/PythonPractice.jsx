import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import api from '../services/api';

const STORAGE_KEY = (id) => `python_draft_${id}`;

const PythonPractice = () => {
  const { id: assignmentId } = useParams();
  const navigate = useNavigate();
  const workerRef = useRef(null);
  const [assignment, setAssignment] = useState(null);
  const [code, setCode] = useState('');
  const [customInput, setCustomInput] = useState('');
  const [runOutput, setRunOutput] = useState('');
  const [results, setResults] = useState([]);
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [testing, setTesting] = useState(false);
  const [workerReady, setWorkerReady] = useState(false);
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
          // Nếu đã nộp đủ lượt → chế độ xem lại
          if (subRes.data.remaining_attempts === 0 && subRes.data.data) {
            setReadOnly(true);
            setCode(subRes.data.data.code || '');
            setResults((subRes.data.data.submission_results || []).map((sr) => ({
              test_name: sr.test_name || '',
              passed: sr.passed,
              actual: sr.actual_output,
              expected: sr.test_case?.expected_output || '',
              error: sr.error_message,
              points: sr.points || 1,
            })));
            setChecked(true);
            return;
          }
        }
        const saved = localStorage.getItem(STORAGE_KEY(assignmentId));
        const starter = assignData.starter_code || '# Viết code Python của bạn tại đây';
        if (saved && saved !== starter) {
          setDraftCode(saved);
          setShowDraftPrompt(true);
          setCode(starter);
        } else {
          setCode(starter);
        }
      } catch {
        setError('Không thể tải bài tập');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [assignmentId]);

  useEffect(() => {
    const worker = new Worker(new URL('../workers/pythonWorker.js', import.meta.url), { type: 'classic' });
    workerRef.current = worker;
    const readyTimer = setTimeout(() => setWorkerReady(true), 1500);
    worker.addEventListener('message', (e) => {
      if (e.data.type === 'suite_result' || e.data.type === 'manual_result') {
        setWorkerReady(true);
        clearTimeout(readyTimer);
      }
    });
    return () => { clearTimeout(readyTimer); worker.terminate(); };
  }, []);

  const handleCodeChange = useCallback((value) => {
    const v = value || '';
    setCode(v);
    localStorage.setItem(STORAGE_KEY(assignmentId), v);
  }, [assignmentId]);

  const continueDraft = () => { setCode(draftCode); setShowDraftPrompt(false); };
  const discardDraft = () => { localStorage.removeItem(STORAGE_KEY(assignmentId)); setShowDraftPrompt(false); };

  const runCode = () => {
    if (!workerRef.current) { setError('Worker chưa sẵn sàng'); return; }
    setRunning(true); setRunOutput(''); setError('');
    const handler = (e) => {
      if (e.data.type === 'manual_result') {
        workerRef.current.removeEventListener('message', handler);
        if (e.data.error) setError(`Lỗi: ${e.data.error}`);
        else setRunOutput(e.data.output || '(không có output)');
        setRunning(false);
      }
    };
    workerRef.current.addEventListener('message', handler);
    workerRef.current.postMessage({ type: 'run_manual', code, inputs: customInput || '' });
  };

  const handleCheck = async () => {
    const testCode = assignment?.test_code;
    if (!testCode) { setError('Bài tập này chưa có test code'); return; }
    if (!workerRef.current) { setError('Worker chưa sẵn sàng'); return; }
    setTesting(true); setError(''); setResults([]); setChecked(false);

    const handler = (e) => {
      if (e.data.type === 'suite_result') {
        workerRef.current.removeEventListener('message', handler);
        const res = e.data.results || [];
        setResults(res);
        setChecked(true);
        setTesting(false);
        if (e.data.error) setError(e.data.error);
      }
    };
    workerRef.current.addEventListener('message', handler);
    workerRef.current.postMessage({ type: 'run_suite', code, testCode });
  };

  const handleSubmit = async () => {
    if (!checked) { setError('Vui lòng kiểm tra bài trước khi nộp'); return; }
    if (submissionInfo?.remaining_attempts !== null && submissionInfo?.remaining_attempts <= 0) {
      setError(`Bạn đã nộp đủ ${submissionInfo.max_submissions} lần, không thể nộp thêm`);
      return;
    }
    // Map suite results to submission format (không có test_case_id vì Python dùng test_code)
    const submitResults = results.map((r) => ({
      test_case_id: null,
      test_name: r.test_name,
      points: r.points || 1,
      passed: r.passed,
      actual_output: r.actual,
      error_message: r.error || (r.passed ? null : `Kết quả: "${r.actual}" — Kỳ vọng: "${r.expected}"`),
    }));
    setSubmitting(true);
    try {
      await api.post('/api/submit', { assignment_id: assignmentId, code, results: submitResults });
      localStorage.removeItem(STORAGE_KEY(assignmentId));
      if (!assignment?.class_id) throw new Error('Không tìm thấy class_id');
      navigate(`/classes/${assignment.class_id}`);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Nộp bài thất bại');
    } finally { setSubmitting(false); }
  };

  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;
  const earnedPoints = results.reduce((sum, r) => sum + (r.passed ? (r.points || 1) : 0), 0);
  const maxPoints = results.reduce((sum, r) => sum + (r.points || 1), 0);

  if (loading) return <div className="text-center py-10 text-gray-500">Đang tải bài tập...</div>;

  return (
    <div className="flex flex-col pb-6">
      {showDraftPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-lg font-bold text-gray-800 mb-2">Bản nháp chưa lưu</h3>
            <p className="text-sm text-gray-600 mb-4">Bạn có bản nháp chưa lưu, tiếp tục không?</p>
            <div className="flex gap-3">
              <button onClick={discardDraft} className="flex-1 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm font-medium">Bỏ qua</button>
              <button onClick={continueDraft} className="flex-1 py-2 bg-[#2563EB] text-white rounded-lg hover:bg-blue-700 text-sm font-medium">Tiếp tục</button>
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
            {readOnly && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                Xem lại — chỉ đọc
              </span>
            )}
          </div>
        </div>
      </div>

      {error && <div className="mb-3 p-3 bg-red-50 text-red-600 rounded-lg text-sm flex-shrink-0">{error}</div>}

      {readOnly && (
        <div className="mb-3 p-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-sm flex-shrink-0">
          Bạn đã nộp đủ số lần cho bài tập này. Đây là bài làm gần nhất của bạn.
        </div>
      )}

      {/* Editor */}
      <div className="rounded-lg overflow-hidden border flex flex-col flex-shrink-0" style={{ height: '300px' }}>
        <div className="bg-gray-100 px-4 py-1.5 text-sm font-medium text-gray-600 border-b flex items-center justify-between">
          <span>{readOnly ? 'Bài làm đã nộp (chỉ đọc)' : 'Python Editor'}</span>
          {!readOnly && <button onClick={runCode} disabled={running || !workerReady}
            className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-green-300 text-xs font-medium">
            {running ? 'Đang chạy...' : workerReady ? 'Chạy thử' : 'Đang tải Pyodide...'}
          </button>}
        </div>
        <div className="flex-1">
          <Editor language="python" value={code} onChange={readOnly ? undefined : handleCodeChange}
            theme="vs-dark" options={{ minimap: { enabled: false }, fontSize: 14, scrollBeyondLastLine: false, readOnly }} />
        </div>
      </div>

      {!readOnly && (
      <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3 flex-shrink-0">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Input thủ công</label>
          <textarea value={customInput} onChange={(e) => setCustomInput(e.target.value)} rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] resize-none"
            placeholder="Nhập dữ liệu input (mỗi dòng là một lần gọi input())" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Kết quả</label>
          <pre className="w-full h-[84px] px-3 py-2 bg-gray-900 text-green-400 rounded-lg text-sm font-mono overflow-auto whitespace-pre-wrap">
            {runOutput || 'Chạy code để xem kết quả...'}
          </pre>
        </div>
      </div>
      )}

      {/* Kiểm tra + Nộp bài / Kết quả */}
      <div className="mt-3 rounded-lg border bg-white p-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-gray-800">{readOnly ? 'Kết quả chấm điểm' : 'Test Suites'}</h3>
            {checked && (
              <span className="text-sm font-medium">
                <span className={earnedPoints === maxPoints ? 'text-green-600' : 'text-orange-500'}>
                  {earnedPoints}/{maxPoints} điểm
                </span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {readOnly ? (
              <span className="text-sm text-gray-400 italic">Kết quả bài làm gần nhất</span>
            ) : (
              <>
              {testing && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>Đang kiểm tra...</span>
                </div>
              )}
              {!workerReady && !testing && (
                <div className="flex items-center gap-2 text-sm text-amber-600">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Đang tải Pyodide (~5MB)...
                </div>
              )}
              <button onClick={handleCheck} disabled={testing || !workerReady || submissionInfo?.remaining_attempts <= 0}
                className="px-4 py-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:bg-amber-300 text-sm font-medium">
                Kiểm tra
              </button>
              <button onClick={handleSubmit}
                disabled={!checked || submitting || submissionInfo?.remaining_attempts <= 0}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium ${checked && submissionInfo?.remaining_attempts !== 0 ? 'bg-[#2563EB] text-white hover:bg-blue-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>
                {submitting ? 'Đang nộp...' : submissionInfo?.remaining_attempts <= 0 ? 'Hết lượt nộp' : 'Nộp bài'}
              </button>
              </>
            )}
          </div>
        </div>

        {results.length > 0 ? (
          <div>
            {/* Biểu điểm tổng */}
            <div className="mb-3 p-3 bg-gray-50 rounded-lg border">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-gray-700">Tổng điểm</span>
                <span className="text-lg font-bold">{earnedPoints}/{maxPoints}</span>
              </div>
              <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                <div className={`h-2 rounded-full transition-all ${earnedPoints === maxPoints ? 'bg-green-500' : 'bg-amber-500'}`}
                  style={{ width: `${maxPoints > 0 ? Math.round((earnedPoints / maxPoints) * 100) : 0}%` }} />
              </div>
            </div>

            {/* Chi tiết từng test */}
            <div className="space-y-2 max-h-48 overflow-auto">
              {results.map((r, i) => (
                <div key={i} className={`p-3 rounded-lg text-sm ${r.passed ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{r.test_name || `Test ${i + 1}`}</span>
                    <span className="text-xs text-gray-400 ml-1">({r.points || 1}đ)</span>
                    <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded ${r.passed ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
                      {r.passed ? `✓ +${r.points || 1}đ` : '✗ 0đ'}
                    </span>
                  </div>
                  {!r.passed && (
                    <div className="mt-1 text-xs space-y-0.5 text-gray-600">
                      {r.actual && <p>Kết quả: <span className="font-mono">{r.actual}</span></p>}
                      {r.expected && <p>Kỳ vọng: <span className="font-mono">{r.expected}</span></p>}
                      {r.error && <p className="text-red-500">{r.error}</p>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4">Nhấn "Kiểm tra" để chạy autograding</p>
        )}
      </div>
    </div>
  );
};

export default PythonPractice;
