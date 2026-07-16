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
  const { id: assignmentId } = useParams();
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
  }, [assignmentId]);

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

  const handleCodeChange = useCallback(
    (value) => {
      const v = value || '';
      setCode(v);
      localStorage.setItem(STORAGE_KEY(assignmentId), v);
    },
    [assignmentId]
  );

  const continueDraft = () => {
    setCode(draftCode);
    setShowDraftPrompt(false);
  };

  const discardDraft = () => {
    localStorage.removeItem(STORAGE_KEY(assignmentId));
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

  if (loading) return <div className="text-center py-10 text-gray-500">Đang tải...</div>;

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
      <div className="rounded-lg overflow-hidden border flex flex-col flex-shrink-0" style={{ height: '280px' }}>
        <div className="bg-gray-100 px-4 py-1.5 text-sm font-medium text-gray-600 border-b flex items-center justify-between">
          <span>{readOnly ? 'Bài làm đã nộp (chỉ đọc)' : 'SQL Editor'}</span>
          {!readOnly && <button onClick={runQuery} className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-xs font-medium">
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
            <summary className="px-4 py-1.5 bg-gray-50 cursor-pointer text-gray-500 hover:text-gray-700 font-medium">
              Dữ liệu mẫu
            </summary>
            <pre className="px-4 py-2 text-gray-600 overflow-auto max-h-24 whitespace-pre-wrap">{assignment.setup_sql}</pre>
          </details>
        )}
      </div>

      {/* Kết quả query */}
      <div className="mt-3 rounded-lg overflow-hidden border bg-white flex flex-col flex-shrink-0" style={{ maxHeight: '240px' }}>
        <div className="bg-gray-100 px-4 py-1.5 text-sm font-medium text-gray-600 border-b">Kết quả</div>
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
      <div className="mt-3 rounded-lg border bg-white p-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-gray-800">{readOnly ? 'Kết quả chấm điểm' : 'Test cases'}</h3>
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
                  checked && submissionInfo?.remaining_attempts !== 0 ? 'bg-[#2563EB] text-white hover:bg-blue-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
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
