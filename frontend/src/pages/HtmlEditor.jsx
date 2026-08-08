import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import api from '../services/api';

const HtmlEditor = () => {
  const { id: assignmentId } = useParams();
  const navigate = useNavigate();
  const [assignment, setAssignment] = useState(null);
  const [code, setCode] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [previewKey, setPreviewKey] = useState(0);
  const [hasRun, setHasRun] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const { data: assignData } = await api.get(`/api/assignments/${assignmentId}`);
        setAssignment(assignData);
        setCode(assignData.starter_code || '<!DOCTYPE html>\n<html>\n<head><title>Trang của tôi</title></head>\n<body>\n  \n</body>\n</html>');
      } catch {
        setError('Không thể tải bài tập');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [assignmentId]);

  const runPreview = () => {
    setPreviewKey((k) => k + 1);
    setHasRun(true);

    if (assignment?.test_cases) {
      const testResults = assignment.test_cases.map((tc) => {
        const lowerCode = code.toLowerCase();
        const expected = tc.expected_output.trim().toLowerCase();
        const passed = lowerCode.includes(expected);
        return {
          test_case_id: tc.id,
          passed,
          actual_output: passed ? 'Tìm thấy' : 'Không tìm thấy',
          error_message: '',
        };
      });
      setResults(testResults);
    }
  };

  const submitCode = async () => {
    if (!hasRun) {
      setError('Vui lòng xem trước trang trước khi nộp');
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

  if (loading) return <div className="text-center py-10 text-brand-muted">Đang tải bài tập...</div>;

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col gap-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold text-brand-heading truncate">{assignment?.title}</h2>
        <div className="flex gap-2">
          <button onClick={runPreview}
            className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium">
            ▶ Xem trước
          </button>
          <button onClick={submitCode} disabled={submitting}
            className="px-4 py-1.5 bg-brand text-white rounded-lg hover:bg-red-600 disabled:bg-red-300 text-sm font-medium">
            {submitting ? 'Đang nộp...' : 'Nộp bài'}
          </button>
        </div>
      </div>

      {error && <div className="rounded-xl bg-badge-red-bg p-3 text-sm text-badge-red-text">{error}</div>}

      <div className="flex-1 flex flex-col lg:flex-row gap-4">
        <div className="flex-1 rounded-2xl overflow-hidden border border-brand-border bg-card shadow-card">
          <Editor
            language="html"
            value={code}
            onChange={(val) => setCode(val || '')}
            theme="vs-dark"
            options={{ minimap: { enabled: false }, fontSize: 14, scrollBeyondLastLine: false }}
          />
        </div>

        <div className="flex-1 flex flex-col gap-4">
          <div className="flex-1 bg-card rounded-2xl border border-brand-border shadow-card overflow-hidden">
            <div className="border-b border-brand-border bg-page px-4 py-1.5 text-sm font-medium text-brand-muted">Kết quả xem trước</div>
            <iframe
              key={previewKey}
              srcDoc={code}
              title="preview"
              className="w-full h-[calc(100%-36px)]"
              sandbox="allow-scripts"
            />
          </div>

          <div className="bg-card rounded-2xl border border-brand-border shadow-card p-4 max-h-48 overflow-auto">
            <h3 className="font-semibold text-brand-heading mb-3">Kết quả test cases</h3>
            {!hasRun && <p className="text-sm text-brand-muted">Xem trước để kiểm tra</p>}
            <div className="space-y-2">
              {results.map((r, i) => (
                <div key={i} className={`p-3 rounded-xl text-sm ${r.passed ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${r.passed ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="font-medium">{assignment?.test_cases?.[i]?.test_name || `Test ${i + 1}`}</span>
                  </div>
                  {!r.passed && r.error_message && (
                    <p className="text-xs text-red-500 mt-1">{r.error_message}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HtmlEditor;
