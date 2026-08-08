import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import api from '../services/api';

const STORAGE_KEY = (id) => `sql_draft_${id}`;

const runSQLTests = (db, studentQuery, testCases) => {
  return testCases.map((tc) => {
    try {
      const result = db.exec(studentQuery);
      const rows = result[0]?.values || [];
      const actualStr = JSON.stringify(rows.map((r) => r.map(String)));

      const expectedRows = JSON.parse(tc.expected_output);
      const expectedStr = JSON.stringify(expectedRows);

      return {
        test_case_id: tc.id,
        passed: actualStr === expectedStr,
        actual_output: actualStr.substring(0, 200),
        expected_output: expectedStr.substring(0, 200),
        error_message:
          actualStr !== expectedStr
            ? `Kết quả của bạn: ${actualStr.substring(0, 100)} — Kỳ vọng: ${expectedStr.substring(0, 100)}`
            : null,
      };
    } catch (e) {
      return {
        test_case_id: tc.id,
        passed: false,
        actual_output: '',
        expected_output: tc.expected_output?.substring(0, 200),
        error_message: e.message,
      };
    }
  });
};

const SQLPractice = () => {
  const { id: assignmentId, deliveryId } = useParams();
  const storageId = deliveryId || assignmentId;
  const navigate = useNavigate();
  const dbRef = useRef(null);
  const sqlReadyRef = useRef(false);
  const debounceRef = useRef(null);
  const [assignment, setAssignment] = useState(null);
  const [code, setCode] = useState('');
  const [results, setResults] = useState([]);
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [queryOutput, setQueryOutput] = useState([]);
  const [queryColumns, setQueryColumns] = useState([]);
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);
  const [draftCode, setDraftCode] = useState('');
  const [submissionInfo, setSubmissionInfo] = useState(null);
  const [readOnly, setReadOnly] = useState(false);
  const [sqlReady, setSqlReady] = useState(false);
  const [pendingRegrade, setPendingRegrade] = useState(null);
  const [regradeMessage, setRegradeMessage] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const [assignRes, subRes] = deliveryId
          ? [await api.get(`/api/assignment-deliveries/${deliveryId}`), { data: null }]
          : await Promise.all([
            api.get(`/api/assignments/${assignmentId}`),
            api.get(`/api/submissions/my/${assignmentId}`),
          ]);
        let assignData = deliveryId ? assignRes.data.assignments : assignRes.data;
        let regradeCode = null;
        if (deliveryId) {
          const pending = assignRes.data.submissions?.find((item) => ['required', 'failed'].includes(item.regrade_status));
          if (pending) {
            const { data: regrade } = await api.get(`/api/submissions/${pending.id}/regrade`);
            assignData = regrade.assignment;
            regradeCode = regrade.code;
            setCode(regrade.code);
            setPendingRegrade(pending);
          }
        }
        setAssignment(assignData);
        if (regradeCode !== null) return;
        if (subRes.data) {
          setSubmissionInfo(subRes.data);
          if (subRes.data.remaining_attempts === 0 && subRes.data.data) {
            setReadOnly(true);
            setCode(subRes.data.data.code || '');
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

        const saved = localStorage.getItem(STORAGE_KEY(storageId));
        const starter = assignData.starter_code || '-- Viết câu lệnh SQL của bạn tại đây';

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
  }, [assignmentId, deliveryId, storageId]);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        const initSqlJs = (await import('sql.js')).default;
        const SQL = await initSqlJs({ locateFile: () => '/sql-wasm.wasm' });
        if (mounted) {
          const db = new SQL.Database();
          dbRef.current = db;
          sqlReadyRef.current = true;
          setSqlReady(true);
        }
      } catch {
        if (mounted) setError('Không thể tải sql.js');
      }
    };
    init();
    return () => {
      mounted = false;
      if (dbRef.current) dbRef.current.close();
    };
  }, []);

  useEffect(() => {
    if (!sqlReady || !pendingRegrade || !assignment || !dbRef.current) return;
    const execute = async () => {
      setRegradeMessage('Đang tự động chấm lại...');
      try {
        if (assignment.setup_sql) dbRef.current.run(assignment.setup_sql);
        const regradeResults = runSQLTests(dbRef.current, pendingRegrade.code, assignment.test_cases ?? []);
        await api.post(`/api/submissions/${pendingRegrade.id}/regrade`, { results: regradeResults });
        setRegradeMessage('Đã chấm lại theo phiên bản mới.');
        setPendingRegrade(null);
      } catch (requestError) {
        setRegradeMessage(requestError.response?.data?.message || 'Chấm lại chưa thành công, điểm cũ vẫn được giữ.');
      }
    };
    execute();
  }, [sqlReady, pendingRegrade, assignment]);

  const handleCodeChange = useCallback(
    (value) => {
      const v = value || '';
      setCode(v);
      localStorage.setItem(STORAGE_KEY(storageId), v);
    },
    [storageId]
  );

  const continueDraft = () => {
    setCode(draftCode);
    setShowDraftPrompt(false);
  };

  const discardDraft = () => {
    localStorage.removeItem(STORAGE_KEY(storageId));
    setShowDraftPrompt(false);
  };

  const translateSQLError = (msg) => {
    if (!msg) return 'Lỗi SQL không xác định';
    if (msg.includes('syntax error')) return 'Lỗi cú pháp SQL. Vui lòng kiểm tra lại câu lệnh.';
    if (msg.includes('no such table')) return `Không tìm thấy bảng: ${msg.match(/no such table: (\S+)/)?.[1] || ''}`;
    if (msg.includes('no such column')) return `Không tìm thấy cột: ${msg.match(/no such column: (\S+)/)?.[1] || ''}`;
    if (msg.includes('UNIQUE constraint')) return 'Dữ liệu bị trùng lặp, vi phạm ràng buộc UNIQUE.';
    if (msg.includes('NOT NULL')) return 'Giá trị không được để trống (NOT NULL).';
    if (msg.includes('FOREIGN KEY')) return 'Vi phạm khóa ngoại (FOREIGN KEY).';
    return `Lỗi SQL: ${msg}`;
  };

  const rebuildDb = async () => {
    if (dbRef.current) dbRef.current.close();
    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs({ locateFile: () => '/sql-wasm.wasm' });
    const newDb = new SQL.Database();
    if (assignment?.setup_sql) {
      try {
        newDb.run(assignment.setup_sql);
      } catch (e) {
        throw new Error(`Lỗi Setup SQL: ${e.message}`);
      }
    }
    dbRef.current = newDb;
    return newDb;
  };

  const runQuery = async () => {
    if (!sqlReadyRef.current) {
      setError('sql.js chưa sẵn sàng');
      return;
    }
    setError('');
    try {
      const db = await rebuildDb();
      const result = db.exec(code);
      if (result.length > 0) {
        setQueryColumns(result[0].columns);
        setQueryOutput(result[0].values);
      } else {
        setQueryColumns([]);
        setQueryOutput([]);
      }
    } catch (err) {
      setError(translateSQLError(err.message));
    }
  };

  const handleCheck = async () => {
    if (!sqlReadyRef.current) {
      setError('sql.js chưa sẵn sàng');
      return;
    }

    const testCases = assignment?.test_cases || [];
    if (testCases.length === 0) {
      setError('Bài tập này không có test cases');
      return;
    }

    setError('');

    try {
      const db = await rebuildDb();
      const res = runSQLTests(db, code, testCases);
      setResults(res);
      setChecked(true);
    } catch (err) {
      setError(translateSQLError(err.message));
    }
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
      if (deliveryId) {
        await api.post(`/api/assignment-deliveries/${deliveryId}/submit`, { code, results });
      } else {
        await api.post('/api/submit', { assignment_id: assignmentId, code, results });
      }
      localStorage.removeItem(STORAGE_KEY(storageId));
      navigate(deliveryId ? '/assignments' : `/classes/${assignment.class_id}`);
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

  if (loading) return <div className="text-center py-10 text-brand-muted">Đang tải...</div>;

  return (
    <div className="flex flex-col pb-6">
      {regradeMessage && <div className="mb-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-700">{regradeMessage}</div>}
      {showDraftPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-card-hover animate-fade-in">
            <h3 className="text-lg font-bold text-brand-heading mb-2">Bản nháp chưa lưu</h3>
            <p className="text-sm text-brand-body mb-4">Bạn có bản nháp chưa lưu, tiếp tục không?</p>
            <div className="flex gap-3">
              <button onClick={discardDraft} className="flex-1 py-2 border border-brand-border rounded-lg text-brand-body hover:bg-gray-50 text-sm font-medium">Bỏ qua</button>
              <button onClick={continueDraft} className="flex-1 py-2 bg-brand text-white rounded-lg hover:bg-red-700 text-sm font-medium">Tiếp tục</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-brand-heading">{assignment?.title}</h2>
          <div className="flex items-center gap-2 mt-0.5">
            {assignment?.description && <p className="text-sm text-brand-muted">{assignment.description}</p>}
            {submissionInfo?.max_submissions && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${submissionInfo.remaining_attempts > 0 ? 'bg-badge-blue-bg text-badge-blue-text' : (readOnly ? 'bg-gray-100 text-gray-600' : 'bg-badge-red-bg text-badge-red-text')}`}>
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

      {error && <div className="mb-3 flex-shrink-0 rounded-xl bg-badge-red-bg p-3 text-sm text-badge-red-text">{error}</div>}

      {readOnly && (
        <div className="mb-3 p-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-sm flex-shrink-0">
          Bạn đã nộp đủ số lần cho bài tập này. Đây là bài làm gần nhất của bạn.
        </div>
      )}

      {/* Editor */}
      <div className="flex flex-col flex-shrink-0 overflow-hidden rounded-2xl border border-brand-border bg-card shadow-card" style={{ height: '280px' }}>
        <div className="flex items-center justify-between border-b border-brand-border bg-page px-4 py-1.5 text-sm font-medium text-brand-muted">
          <span>{readOnly ? 'Bài làm đã nộp (chỉ đọc)' : 'SQL Editor'}</span>
          {!readOnly && <button onClick={runQuery} className="px-3 py-1 bg-brand text-white rounded-lg hover:bg-red-600 text-xs font-medium">
            Chạy thử
          </button>}
        </div>
        <div className="flex-1">
          <Editor
            language="sql"
            value={code}
            onChange={handleCodeChange}
            theme="vs-dark"
            options={{ minimap: { enabled: false }, fontSize: 14, scrollBeyondLastLine: false, readOnly }}
          />
        </div>
        {assignment?.setup_sql && (
          <details className="border-t text-xs">
            <summary className="px-4 py-1.5 bg-page cursor-pointer text-brand-muted hover:text-brand-heading font-medium">
              Dữ liệu mẫu
            </summary>
            <pre className="px-4 py-2 text-brand-muted overflow-auto max-h-24 whitespace-pre-wrap">{assignment.setup_sql}</pre>
          </details>
        )}
      </div>

      {/* Kết quả query */}
      <div className="mt-3 flex flex-col flex-shrink-0 overflow-hidden rounded-2xl border border-brand-border bg-card shadow-card" style={{ maxHeight: '240px' }}>
        <div className="border-b border-brand-border bg-page px-4 py-1.5 text-sm font-medium text-brand-muted">Kết quả</div>
        <div className="overflow-auto p-2 flex-1">
          {queryOutput.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    {queryColumns.map((col, i) => (
                      <th key={i} className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {queryOutput.map((row, i) => (
                    <tr key={i} className="border-b hover:bg-gray-50">
                      {row.map((cell, j) => (
                        <td key={j} className="px-3 py-1.5 text-gray-700 whitespace-nowrap">{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm py-8">
              Chạy truy vấn để xem kết quả
            </div>
          )}
        </div>
      </div>

      {/* Test cases + buttons */}
      <div className="mt-3 flex-shrink-0 rounded-2xl border border-brand-border bg-card p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-brand-heading">{readOnly ? 'Kết quả chấm điểm' : 'Test cases'}</h3>
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
              <button onClick={handleCheck} className="px-4 py-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 text-sm font-medium">
                Kiểm tra
              </button>
              <button
                onClick={handleSubmit}
                disabled={!checked || submitting || submissionInfo?.remaining_attempts <= 0}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium ${
                  checked && submissionInfo?.remaining_attempts !== 0 ? 'bg-brand text-white hover:bg-red-600' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                {submitting ? 'Đang nộp...' : submissionInfo?.remaining_attempts <= 0 ? 'Hết lượt nộp' : 'Nộp bài'}
              </button>
              </>
            )}
          </div>
        </div>

        {results.length > 0 ? (
          <div>
            {/* Biểu điểm tổng */}
            <div className="mb-3 p-3 bg-page rounded-xl border border-brand-border">
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
            <div className="flex flex-wrap gap-2 max-h-32 overflow-auto">
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
                      <span title={`Kết quả: ${r.actual_output || ''}\nKỳ vọng: ${r.expected_output || ''}`}
                        className="text-xs opacity-75 ml-1">({r.error_message})</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4">Nhấn "Kiểm tra" để chạy autograding</p>
        )}
      </div>
    </div>
  );
};

export default SQLPractice;
