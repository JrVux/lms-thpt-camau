import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import api from '../services/api';

const CodingEditor = () => {
  const { id: assignmentId } = useParams();
  const navigate = useNavigate();
  const pyodideRef = useRef(null);
  const [assignment, setAssignment] = useState(null);
  const [code, setCode] = useState('');
  const [output, setOutput] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pyodideReady, setPyodideReady] = useState(false);
  const [pyError, setPyError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const { data: assignData } = await api.get(`/api/assignments/${assignmentId}`);
        setAssignment(assignData);
        setCode(assignData.starter_code || '# Viết code Python của bạn tại đây');
      } catch (err) {
        setPyError('Không thể tải bài tập');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [assignmentId]);

  useEffect(() => {
    let mounted = true;
    const loadPyodide = async () => {
      try {
        const { loadPyodide: loadPy } = await import('pyodide');
        const py = await loadPy({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.3/full/' });
        if (mounted) {
          pyodideRef.current = py;
          setPyodideReady(true);
        }
      } catch (err) {
        if (mounted) setPyError('Không thể tải Pyodide. Vui lòng kiểm tra kết nối mạng.');
      }
    };
    loadPyodide();
    return () => { mounted = false; };
  }, []);

  const runCode = useCallback(async () => {
    if (!pyodideReady || !pyodideRef.current) return;
    setRunning(true);
    setOutput('');
    setResults([]);
    setPyError('');

    try {
      const py = pyodideRef.current;
      py.globals.set('__input_data', '');

      const capturedOutput = [];
      py.setStdout({
        batched: (text) => capturedOutput.push(text),
      });
      py.setStderr({
        batched: (text) => capturedOutput.push(text),
      });

      await py.runPythonAsync(code);
      const stdout = capturedOutput.join('\n');
      setOutput(stdout);

      // Run test cases
      if (assignment?.test_cases) {
        const testResults = [];
        for (const tc of assignment.test_cases) {
          try {
            py.globals.set('__input_data', tc.input_data || '');
            const captured = [];
            py.setStdout({ batched: (text) => captured.push(text) });
            py.setStderr({ batched: (text) => captured.push(text) });
            await py.runPythonAsync(code);
            const actual = captured.join('\n').trim();
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
      setOutput(err.message);
    } finally {
      setRunning(false);
    }
  }, [code, pyodideReady, assignment]);

  const submitCode = async () => {
    if (!results.length) {
      setPyError('Vui lòng chạy code trước khi nộp');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/api/submit', {
        assignment_id: assignmentId,
        code,
        results,
      });
      navigate(`/classes/${assignment.class_id}`);
    } catch (err) {
      setPyError(err.response?.data?.message || 'Nộp bài thất bại');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="text-center py-10 text-gray-500">Đang tải bài tập...</div>;
  if (pyError && !assignment) return <div className="text-center py-10 text-red-500">{pyError}</div>;

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col lg:flex-row gap-4">
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-gray-800 truncate">{assignment?.title}</h2>
          <div className="flex gap-2">
            <button
              onClick={runCode}
              disabled={!pyodideReady || running}
              className="px-4 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-green-300 text-sm font-medium"
            >
              {running ? 'Đang chạy...' : pyodideReady ? '▶ Chạy' : 'Đang tải Pyodide...'}
            </button>
            <button
              onClick={submitCode}
              disabled={submitting}
              className="px-4 py-1.5 bg-[#2563EB] text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 text-sm font-medium"
            >
              {submitting ? 'Đang nộp...' : 'Nộp bài'}
            </button>
          </div>
        </div>

        <div className="flex-1 rounded-lg overflow-hidden border">
          <Editor
            language="python"
            value={code}
            onChange={(val) => setCode(val || '')}
            theme="vs-dark"
            options={{ minimap: { enabled: false }, fontSize: 14, scrollBeyondLastLine: false }}
          />
        </div>

        <div className="mt-2 p-3 bg-gray-900 text-green-400 rounded-lg font-mono text-sm max-h-32 overflow-auto">
          <pre className="whitespace-pre-wrap">{output || 'Chạy code để xem kết quả...'}</pre>
        </div>
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

export default CodingEditor;
