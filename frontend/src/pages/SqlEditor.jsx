import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import api from '../services/api';

const SqlEditor = () => {
  const { id: assignmentId } = useParams();
  const navigate = useNavigate();
  const dbRef = useRef(null);
  const [assignment, setAssignment] = useState(null);
  const [code, setCode] = useState('');
  const [output, setOutput] = useState([]);
  const [columns, setColumns] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sqlReady, setSqlReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const { data: assignData } = await api.get(`/api/assignments/${assignmentId}`);
        setAssignment(assignData);
        setCode(assignData.starter_code || '-- Viết câu lệnh SQL của bạn tại đây\nSELECT * FROM ...;');
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
        const SQL = await initSqlJs({ locateFile: (file) => `https://sql.js.org/dist/${file}` });
        if (mounted) {
          const db = new SQL.Database();
          dbRef.current = { SQL, db };
          setSqlReady(true);
        }
      } catch {
        if (mounted) setError('Không thể tải sql.js');
      }
    };
    init();
    return () => { mounted = false; };
  }, []);

  const runQuery = () => {
    if (!sqlReady || !dbRef.current) return;
    setRunning(true);
    setOutput([]);
    setColumns([]);
    setResults([]);
    setError('');

    try {
      const { db } = dbRef.current;
      db.run('DROP TABLE IF EXISTS __result; CREATE TABLE __result AS ');
      // Run student's SQL
      const statement = db.exec(code);
      if (statement.length > 0) {
        setColumns(statement[0].columns);
        setOutput(statement[0].values);
      } else {
        setOutput([]);
        setColumns([]);
      }

      // Run test cases
      if (assignment?.test_cases) {
        const testResults = [];
        for (const tc of assignment.test_cases) {
          try {
            const stmt = db.exec(tc.input_data || code);
            const actual = stmt.length > 0
              ? JSON.stringify(stmt[0].values)
              : '';
            const passed = actual === tc.expected_output.trim();
            testResults.push({
              test_case_id: tc.id,
              passed,
              actual_output: actual,
              error_message: '',
            });
          } catch (e) {
            testResults.push({
              test_case_id: tc.id,
              passed: false,
              actual_output: '',
              error_message: e.message,
            });
          }
        }
        setResults(testResults);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  const submitCode = async () => {
    if (!results.length) {
      setError('Vui lòng chạy code trước khi nộp');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/api/submit', { assignment_id: assignmentId, code, results });
      navigate(`/classes/${assignment.class_id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Nộp bài thất bại');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="text-center py-10 text-gray-500">Đang tải bài tập...</div>;

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col lg:flex-row gap-4">
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-gray-800 truncate">{assignment?.title}</h2>
          <div className="flex gap-2">
            <button onClick={runQuery} disabled={!sqlReady || running}
              className="px-4 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-green-300 text-sm font-medium">
              {running ? 'Đang chạy...' : sqlReady ? '▶ Chạy' : 'Đang tải...'}
            </button>
            <button onClick={submitCode} disabled={submitting}
              className="px-4 py-1.5 bg-[#2563EB] text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 text-sm font-medium">
              {submitting ? 'Đang nộp...' : 'Nộp bài'}
            </button>
          </div>
        </div>

        <div className="flex-1 rounded-lg overflow-hidden border">
          <Editor
            language="sql"
            value={code}
            onChange={(val) => setCode(val || '')}
            theme="vs-dark"
            options={{ minimap: { enabled: false }, fontSize: 14, scrollBeyondLastLine: false }}
          />
        </div>

        {error && <div className="mt-2 p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>}

        {output.length > 0 && (
          <div className="mt-2 bg-white border rounded-lg overflow-auto max-h-48">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  {columns.map((col, i) => (
                    <th key={i} className="px-3 py-2 text-left font-medium text-gray-600">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {output.map((row, i) => (
                  <tr key={i} className="border-b hover:bg-gray-50">
                    {row.map((cell, j) => (
                      <td key={j} className="px-3 py-1.5 text-gray-700">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="w-full lg:w-80 bg-white rounded-lg border p-4 overflow-auto max-h-[50vh] lg:max-h-none">
        <h3 className="font-semibold text-gray-800 mb-3">Kết quả test cases</h3>
        {!results.length && <p className="text-sm text-gray-400">Chạy code để kiểm tra</p>}
        <div className="space-y-2">
          {results.map((r, i) => (
            <div key={i} className={`p-3 rounded-lg text-sm ${r.passed ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full ${r.passed ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="font-medium">{assignment?.test_cases?.[i]?.test_name || `Test ${i + 1}`}</span>
              </div>
              {!r.passed && (
                <div className="text-xs mt-1 space-y-1">
                  <p><span className="text-gray-500">Kết quả:</span> {r.actual_output || '(trống)'}</p>
                  <p><span className="text-gray-500">Mong đợi:</span> {assignment?.test_cases?.[i]?.expected_output}</p>
                  {r.error_message && <p className="text-red-500">Lỗi: {r.error_message}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SqlEditor;
