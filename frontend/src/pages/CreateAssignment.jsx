import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import api from '../services/api';

const LANG_MAP = { python: 'python', sql: 'sql', html: 'html' };
const CLASS_SUBJECT_MAP = { 10: 'python', 11: 'sql', 12: 'html' };

const CreateAssignment = () => {
  const params = useParams();
  const classId = params.id || params.classId;
  const assignmentId = params.assignmentId;
  const isEdit = !!assignmentId;
  const navigate = useNavigate();

  const [form, setForm] = useState({
    title: '',
    description: '',
    due_date: '',
    starter_code: '',
    solution_code: '',
    setup_sql: '',
    test_code: '',
    max_submissions: '',
    max_score: '',
  });
  const [testCases, setTestCases] = useState([
    { input_data: '', expected_output: '', test_name: 'Test 1', points: 1 },
  ]);
  const [type, setType] = useState('python');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(isEdit);

  useEffect(() => {
    if (!isEdit) return;
    const load = async () => {
      try {
        const { data } = await api.get(`/api/assignments/${assignmentId}`);
        setForm({
          title: data.title || '',
          description: data.description || '',
          due_date: data.due_date ? data.due_date.split('T')[0] : '',
          starter_code: data.starter_code || '',
          solution_code: data.solution_code || '',
          setup_sql: data.setup_sql || '',
          test_code: data.test_code || '',
          max_submissions: data.max_submissions ?? '',
          max_score: data.max_score ?? '',
        });
        setType(data.type);
        if (data.test_cases && data.test_cases.length > 0) {
          setTestCases(data.test_cases.map((tc) => ({
            input_data: tc.input_data || '',
            expected_output: tc.expected_output || '',
            test_name: tc.test_name || '',
            points: tc.points || 1,
          })));
        }
      } catch {
        setError('Không thể tải bài tập');
      } finally {
        setLoadingData(false);
      }
    };
    load();
  }, [assignmentId, isEdit]);

  const addTestCase = () => {
    setTestCases([...testCases, { input_data: '', expected_output: '', test_name: `Test ${testCases.length + 1}`, points: 1 }]);
  };

  const removeTestCase = (index) => {
    if (testCases.length <= 1) return;
    setTestCases(testCases.filter((_, i) => i !== index));
  };

  const updateTestCase = (index, field, value) => {
    const updated = [...testCases];
    updated[index][field] = value;
    setTestCases(updated);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setError('Vui lòng nhập tiêu đề bài tập'); return; }

    setSaving(true);
    setError('');

    try {
      if (isEdit) {
        await api.patch(`/api/assignments/${assignmentId}`, {
          title: form.title,
          description: form.description,
          starter_code: form.starter_code,
          solution_code: form.solution_code,
          setup_sql: form.setup_sql,
          test_code: form.test_code,
          due_date: form.due_date || null,
          max_submissions: form.max_submissions ? parseInt(form.max_submissions) : null,
          max_score: form.max_score ? parseInt(form.max_score) : 0,
        });
      } else {
        const { data: assignment } = await api.post('/api/assignments', {
          class_id: classId,
          title: form.title,
          description: form.description,
          type,
          starter_code: form.starter_code,
          solution_code: form.solution_code,
          setup_sql: form.setup_sql,
          test_code: form.test_code,
          due_date: form.due_date || null,
          max_submissions: form.max_submissions ? parseInt(form.max_submissions) : null,
          max_score: form.max_score ? parseInt(form.max_score) : 0,
        });

        if (testCases.some((tc) => tc.expected_output.trim())) {
          await api.post(`/api/assignments/${assignment.id}/test-cases`, {
            test_cases: testCases.filter((tc) => tc.expected_output.trim()),
          });
        }
      }

      navigate(`/classes/${classId}`);
    } catch (err) {
      setError(err.response?.data?.message || (isEdit ? 'Cập nhật thất bại' : 'Tạo bài tập thất bại'));
    } finally {
      setSaving(false);
    }
  };

  const gradeOptions = ['10', '11', '12'];

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">{isEdit ? 'Chỉnh sửa bài tập' : 'Tạo bài tập mới'}</h1>

      {loadingData && <div className="mb-4 p-3 rounded-lg bg-blue-50 text-blue-600 text-sm">Đang tải dữ liệu bài tập...</div>}
      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-6">
        <div className={`bg-white rounded-xl shadow-sm border p-6 space-y-4 ${loadingData ? 'opacity-50 pointer-events-none' : ''}`}>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tiêu đề</label>
            <input
              type="text" value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
              placeholder="Ví dụ: Bài 1 - Biến và kiểu dữ liệu"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] resize-none"
              placeholder="Mô tả yêu cầu bài tập..."
            />
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Loại bài tập</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                disabled={isEdit}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
              >
                {gradeOptions.map((g) => (
                  <option key={g} value={CLASS_SUBJECT_MAP[g]}>
                    Khối {g} - {CLASS_SUBJECT_MAP[g].toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hạn nộp</label>
              <input
                type="date" value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Số lần nộp tối đa</label>
              <input
                type="number" min={1} value={form.max_submissions}
                onChange={(e) => setForm({ ...form, max_submissions: e.target.value })}
                placeholder="Không giới hạn"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tổng điểm</label>
              <input
                type="number" min={1} value={form.max_score}
                onChange={(e) => setForm({ ...form, max_score: e.target.value })}
                placeholder="Tự động theo test"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Starter Code</h2>
          <Editor
            height="250px"
            language={LANG_MAP[type] || 'python'}
            value={form.starter_code}
            onChange={(val) => setForm({ ...form, starter_code: val || '' })}
            theme="vs-dark"
            options={{ minimap: { enabled: false }, fontSize: 14 }}
          />
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Solution Code (ẩn với học sinh)</h2>
          <Editor
            height="250px"
            language={LANG_MAP[type] || 'python'}
            value={form.solution_code}
            onChange={(val) => setForm({ ...form, solution_code: val || '' })}
            theme="vs-dark"
            options={{ minimap: { enabled: false }, fontSize: 14 }}
          />
        </div>

        {type === 'sql' && (
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Setup SQL (dữ liệu mẫu)</h2>
            <p className="text-sm text-gray-500 mb-3">Câu lệnh CREATE TABLE và INSERT dữ liệu mẫu cho bài SQL</p>
            <Editor
              height="200px"
              language="sql"
              value={form.setup_sql}
              onChange={(val) => setForm({ ...form, setup_sql: val || '' })}
              theme="vs-dark"
              options={{ minimap: { enabled: false }, fontSize: 14 }}
            />
          </div>
        )}

        {type === 'python' && (
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-gray-800">Test Suites (Python)</h2>
              <span className="text-sm text-gray-500">
                {form.max_score ? `Tổng: ${form.max_score}đ` : 'Nhập "Tổng điểm" bên trên'}
              </span>
            </div>
            <p className="text-sm text-gray-500 mb-3">
              Viết test cases theo định dạng PythonTestSuite với <code>inputs</code> và <code>expect().with_options(points=X)</code> để đặt điểm từng test
            </p>
            <Editor
              height="350px"
              language="python"
              value={form.test_code}
              onChange={(val) => setForm({ ...form, test_code: val || '' })}
              theme="vs-dark"
              options={{ minimap: { enabled: false }, fontSize: 13 }}
            />
          </div>
        )}

        {type !== 'python' && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Test Cases</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Tổng điểm các test: {testCases.reduce((s, t) => s + (parseInt(t.points) || 0), 0)}đ
                {form.max_score ? ` / Tổng bài: ${form.max_score}đ` : ''}
              </p>
            </div>
            <button type="button" onClick={addTestCase}
              className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium">
              + Thêm test case
            </button>
          </div>

          <div className="space-y-4">
            {testCases.map((tc, i) => (
              <div key={i} className="border rounded-lg p-4 bg-gray-50">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-gray-700">{tc.test_name}</h3>
                  {testCases.length > 1 && (
                    <button type="button" onClick={() => removeTestCase(i)}
                      className="text-red-500 hover:text-red-700 text-sm">
                      Xóa
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Input</label>
                    <input
                      type="text" value={tc.input_data}
                      onChange={(e) => updateTestCase(i, 'input_data', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                      placeholder="Dữ liệu đầu vào"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Expected Output</label>
                    <input
                      type="text" value={tc.expected_output}
                      onChange={(e) => updateTestCase(i, 'expected_output', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                      placeholder="Kết quả mong đợi"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Điểm</label>
                    <input
                      type="number" min={1} value={tc.points}
                      onChange={(e) => updateTestCase(i, 'points', parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        )}

        <div className="flex gap-3">
          <button type="button" onClick={() => navigate(`/classes/${classId}`)}
            className="px-6 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium">
            Hủy
          </button>
          <button type="submit" disabled={saving}
            className="px-6 py-2.5 bg-[#2563EB] text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 font-medium">
            {saving ? (isEdit ? 'Đang lưu...' : 'Đang tạo...') : (isEdit ? 'Lưu thay đổi' : 'Tạo bài tập')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateAssignment;
