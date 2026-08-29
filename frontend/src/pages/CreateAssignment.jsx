import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import api from '../services/api';
import Button from '../components/Button';
import CompetencyMappingPanel from '../components/CompetencyMappingPanel';
import AIAssignmentComposer from '../components/AIAssignmentComposer';
import { applyAIDraft, subjectToCategory } from '../utils/aiAssignmentDraft';
import FileAssignmentFields from '../components/FileAssignmentFields';
import { buildFileAssignmentPayload } from '../utils/fileSubmission';
import { Plus, Trash2, Code, Sparkles } from 'lucide-react';

const LANG_MAP = { python: 'python', sql: 'sql', html: 'html' };
const CLASS_SUBJECT_MAP = { 10: 'python', 11: 'sql', 12: 'html' };

const input =
  'w-full rounded-lg border border-brand-border px-4 py-2.5 outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20';

const CreateAssignment = () => {
  const params = useParams();
  const classId = params.id || params.classId;
  const assignmentId = params.assignmentId;
  const isLibraryMode = !classId;
  const isEdit = !!assignmentId;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialCategory = searchParams.get('category') || 'grade_10';
  const initialTopicId = searchParams.get('topicId') || '';

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
  const querySubmissionType = searchParams.get('submission_type') || (['practice_file', 'essay'].includes(searchParams.get('type')) ? searchParams.get('type') : 'autograde');
  const [fileSettings, setFileSettings] = useState({
    submission_type: querySubmissionType,
    essay_content: '',
    allowed_mime_types: [
      'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'image/jpeg', 'image/png', 'image/webp'
    ],
    max_file_size_mb: 25,
    allow_late_submission: false,
  });
  const [testCases, setTestCases] = useState([
    { input_data: '', expected_output: '', test_name: 'Test 1', points: 1 },
  ]);
  const [type, setType] = useState(
    initialCategory === 'advanced' ? 'python' : CLASS_SUBJECT_MAP[initialCategory.replace('grade_', '')]
  );
  const [category, setCategory] = useState(initialCategory);
  const [topics, setTopics] = useState([]);
  const [topicId, setTopicId] = useState(initialTopicId);
  const [newTopicName, setNewTopicName] = useState('');
  const [showNewTopic, setShowNewTopic] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(isEdit);
  const [showAI, setShowAI] = useState(false);
  const [aiSuggestions, setAISuggestions] = useState([]);

  const applyGeneratedDraft = (draft) => {
    const next = applyAIDraft({ form, draft });
    setForm(next.form);
    setTestCases(next.testCases);
    setAISuggestions(next.suggestions);
    setType(draft.type);
    if (category !== 'advanced') {
      setCategory(subjectToCategory(draft.type));
    }
    setShowAI(false);
  };

  useEffect(() => {
    if (!isEdit) return;
    const load = async () => {
      try {
        const endpoint = isLibraryMode
          ? `/api/assignment-library/${assignmentId}`
          : `/api/assignments/${assignmentId}`;
        const { data } = await api.get(endpoint);
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
        setFileSettings({
          submission_type: data.submission_type || 'autograde',
          essay_content: data.essay_content || '',
          allowed_mime_types: data.allowed_mime_types || [
            'application/pdf', 'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'image/jpeg', 'image/png', 'image/webp'
          ],
          max_file_size_mb: data.max_file_size_mb || 25,
          allow_late_submission: Boolean(data.allow_late_submission),
        });
        setType(data.type);
        if (data.category) setCategory(data.category);
        setTopicId(data.topic_id || '');
        if (data.test_cases && data.test_cases.length > 0) {
          setTestCases(data.test_cases.map((tc) => ({
            id: tc.id,
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
  }, [assignmentId, isEdit, isLibraryMode]);

  useEffect(() => {
    if (!isLibraryMode) return;
    setNewTopicName('');
    setShowNewTopic(false);
    api.get(`/api/assignment-library/topics?category=${category}`)
      .then(({ data }) => {
        setTopics(data);
        setTopicId((current) => (current && !data.some((topic) => topic.id === current) ? '' : current));
      })
      .catch(() => setTopics([]));
  }, [category, isLibraryMode]);

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
    if (isLibraryMode && showNewTopic && !newTopicName.trim()) {
      setError('Vui lòng nhập tên chủ đề mới');
      return;
    }
    if (fileSettings.submission_type === 'essay' && !String(fileSettings.essay_content || '').trim()) {
      setError('Vui lòng nhập đề bài tự luận');
      return;
    }

    setSaving(true);
    setError('');

    try {
      let resolvedTopicId = topicId;
      if (isLibraryMode && showNewTopic && newTopicName.trim()) {
        const { data: createdTopic } = await api.post('/api/assignment-library/topics', {
          category,
          name: newTopicName.trim(),
        });
        resolvedTopicId = createdTopic.id;
      }

      const filePayload = buildFileAssignmentPayload(fileSettings);

      if (isEdit) {
        const endpoint = isLibraryMode
          ? `/api/assignment-library/${assignmentId}`
          : `/api/assignments/${assignmentId}`;
        await api.patch(endpoint, {
          title: form.title,
          description: form.description,
          category,
          type,
          ...(isLibraryMode ? { topic_id: resolvedTopicId || null } : {}),
          ...filePayload,
          starter_code: fileSettings.submission_type === 'autograde' ? form.starter_code : null,
          solution_code: fileSettings.submission_type === 'autograde' ? form.solution_code : null,
          setup_sql: fileSettings.submission_type === 'autograde' ? form.setup_sql : null,
          test_code: fileSettings.submission_type === 'autograde' ? form.test_code : null,
          due_date: form.due_date || null,
          max_submissions: form.max_submissions ? parseInt(form.max_submissions) : null,
          max_score: form.max_score ? parseInt(form.max_score) : 0,
        });
        if (fileSettings.submission_type === 'autograde') {
          const tcEndpoint = isLibraryMode
            ? `/api/assignment-library/${assignmentId}/test-cases`
            : `/api/assignments/${assignmentId}/test-cases`;
          await api.post(tcEndpoint, {
            test_cases: testCases.filter((testCase) => testCase.expected_output.trim()),
          });
        }
      } else {
        const endpoint = isLibraryMode ? '/api/assignment-library' : '/api/assignments';
        const { data: assignment } = await api.post(endpoint, {
          ...(isLibraryMode ? { category, topic_id: resolvedTopicId || null } : { class_id: classId }),
          title: form.title,
          description: form.description,
          type,
          ...filePayload,
          starter_code: fileSettings.submission_type === 'autograde' ? form.starter_code : null,
          solution_code: fileSettings.submission_type === 'autograde' ? form.solution_code : null,
          setup_sql: fileSettings.submission_type === 'autograde' ? form.setup_sql : null,
          test_code: fileSettings.submission_type === 'autograde' ? form.test_code : null,
          ...(!isLibraryMode && {
            due_date: form.due_date || null,
            max_submissions: form.max_submissions ? parseInt(form.max_submissions) : null,
          }),
          max_score: form.max_score ? parseInt(form.max_score) : 0,
        });

        if (fileSettings.submission_type === 'autograde') {
          const tcEndpoint = isLibraryMode
            ? `/api/assignment-library/${assignment.id}/test-cases`
            : `/api/assignments/${assignment.id}/test-cases`;
          await api.post(tcEndpoint, {
            test_cases: testCases.filter((testCase) => testCase.expected_output.trim()),
          });
        }
        if (aiSuggestions.length) {
          await api.post(`/api/assignments/${assignment.id}/ai-competencies`, { suggestions: aiSuggestions });
        }
      }

      navigate(isLibraryMode ? '/assignments' : `/classes/${classId}`);
    } catch (err) {
      setError(err.response?.data?.message || (isEdit ? 'Cập nhật thất bại' : 'Tạo bài tập thất bại'));
    } finally {
      setSaving(false);
    }
  };

  const gradeOptions = ['10', '11', '12'];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
        <h1 className="text-2xl font-bold tracking-tight text-brand-heading">{isEdit ? 'Chỉnh sửa bài tập' : 'Tạo bài tập mới'}</h1>
        <p className="mt-1 text-sm text-brand-muted">
          {isLibraryMode ? 'Lưu vào kho bài tập để tái sử dụng' : 'Tạo bài tập gắn với lớp hiện tại'}
        </p>
        </div>
        {!isEdit && <Button type="button" variant="outline" icon={Sparkles} onClick={() => setShowAI(true)}>Soạn bằng AI</Button>}
      </div>

      {showAI && <AIAssignmentComposer initialSubject={type} onApply={applyGeneratedDraft} onClose={() => setShowAI(false)} />}

      {loadingData && <div className="mb-4 rounded-xl bg-badge-blue-bg p-3 text-sm text-badge-blue-text">Đang tải dữ liệu bài tập...</div>}
      {error && <div className="mb-4 rounded-xl bg-badge-red-bg p-3 text-sm text-badge-red-text">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className={`space-y-4 rounded-2xl bg-card p-6 shadow-card ring-1 ring-brand-border ${loadingData ? 'pointer-events-none opacity-50' : ''}`}>
          <div>
            <label className="mb-1 block text-sm font-medium text-brand-heading">Tiêu đề</label>
            <input
              type="text" value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className={input}
              placeholder="Ví dụ: Bài 1 - Biến và kiểu dữ liệu"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-brand-heading">Mô tả</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className={`${input} resize-none`}
              placeholder="Mô tả yêu cầu bài tập..."
            />
          </div>

          {isLibraryMode && (
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-heading">Nhóm bài tập</label>
              <select
                value={category}
                onChange={(event) => {
                  const nextCategory = event.target.value;
                  setCategory(nextCategory);
                  if (nextCategory !== 'advanced') {
                    setType(CLASS_SUBJECT_MAP[nextCategory.replace('grade_', '')]);
                  }
                }}
                className={`${input} bg-white`}
              >
                <option value="grade_10">Khối 10</option>
                <option value="grade_11">Khối 11</option>
                <option value="grade_12">Khối 12</option>
                <option value="advanced">Nâng cao</option>
              </select>
            </div>
          )}

          {isLibraryMode && (
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-heading">Chủ đề</label>
              <select
                value={showNewTopic ? '__new__' : topicId || ''}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === '__new__') {
                    setShowNewTopic(true);
                    setTopicId('');
                  } else {
                    setShowNewTopic(false);
                    setTopicId(value);
                  }
                }}
                className={`${input} bg-white`}
              >
                <option value="">Chưa có chủ đề</option>
                {topics.map((topic) => (
                  <option key={topic.id} value={topic.id}>{topic.name}</option>
                ))}
                <option value="__new__">＋ Thêm chủ đề mới...</option>
              </select>
              {showNewTopic && (
                <input
                  type="text"
                  value={newTopicName}
                  onChange={(e) => setNewTopicName(e.target.value)}
                  className={`${input} mt-2`}
                  placeholder="Nhập tên chủ đề, ví dụ: Vòng lặp"
                  maxLength={100}
                />
              )}
            </div>
          )}

          <div className={`grid gap-4 ${isLibraryMode ? 'grid-cols-2' : 'grid-cols-4'}`}>
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-heading">Loại bài tập</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                disabled={isEdit || (isLibraryMode && category !== 'advanced')}
                className={`${input} bg-white`}
              >
                {(isLibraryMode && category === 'advanced'
                  ? ['python', 'sql', 'html'].map((subject) => (
                    <option key={subject} value={subject}>{subject.toUpperCase()}</option>
                  ))
                  : gradeOptions.map((g) => (
                    <option key={g} value={CLASS_SUBJECT_MAP[g]}>
                      Khối {g} - {CLASS_SUBJECT_MAP[g].toUpperCase()}
                    </option>
                  )))}
              </select>
            </div>
            {!isLibraryMode && (
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-heading">Hạn nộp</label>
                <input
                  type="date" value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                  className={input}
                />
              </div>
            )}
            {!isLibraryMode && (
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-heading">Số lần nộp tối đa</label>
                <input
                  type="number" min={1} value={form.max_submissions}
                  onChange={(e) => setForm({ ...form, max_submissions: e.target.value })}
                  placeholder="Không giới hạn"
                  className={input}
                />
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-heading">Tổng điểm</label>
              <input
                type="number" min={1} value={form.max_score}
                onChange={(e) => setForm({ ...form, max_score: e.target.value })}
                placeholder="Tự động theo test"
                className={input}
              />
            </div>
          </div>
        </div>

        <FileAssignmentFields value={fileSettings} onChange={setFileSettings} />

        {fileSettings.submission_type === 'autograde' && (
          <>
            <SectionCard title="Starter Code" description="Mã khởi tạo học sinh sẽ thấy">
              <Editor
                height="250px"
                language={LANG_MAP[type] || 'python'}
                value={form.starter_code}
                onChange={(val) => setForm({ ...form, starter_code: val || '' })}
                theme="vs-dark"
                options={{ minimap: { enabled: false }, fontSize: 14 }}
              />
            </SectionCard>

            <SectionCard title="Solution Code" description="Ẩn với học sinh">
              <Editor
                height="250px"
                language={LANG_MAP[type] || 'python'}
                value={form.solution_code}
                onChange={(val) => setForm({ ...form, solution_code: val || '' })}
                theme="vs-dark"
                options={{ minimap: { enabled: false }, fontSize: 14 }}
              />
            </SectionCard>

            {type === 'sql' && (
              <SectionCard title="Setup SQL" description="Câu lệnh CREATE TABLE và INSERT dữ liệu mẫu cho bài SQL">
                <Editor
                  height="200px"
                  language="sql"
                  value={form.setup_sql}
                  onChange={(val) => setForm({ ...form, setup_sql: val || '' })}
                  theme="vs-dark"
                  options={{ minimap: { enabled: false }, fontSize: 14 }}
                />
              </SectionCard>
            )}

            {type === 'python' && (
              <SectionCard title="Test Suites (Python)" description="Viết test cases theo định dạng PythonTestSuite với inputs và expect().with_options(points=X) để đặt điểm từng test" trailing={form.max_score ? `Tổng: ${form.max_score}đ` : 'Nhập "Tổng điểm" bên trên'}>
                <Editor
                  height="350px"
                  language="python"
                  value={form.test_code}
                  onChange={(val) => setForm({ ...form, test_code: val || '' })}
                  theme="vs-dark"
                  options={{ minimap: { enabled: false }, fontSize: 13 }}
                />
              </SectionCard>
            )}
          </>
        )}

        {fileSettings.submission_type === 'autograde' && type !== 'python' && (
          <div className="rounded-2xl bg-card p-6 shadow-card ring-1 ring-brand-border">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-brand-heading">Test Cases</h2>
                <p className="mt-0.5 text-xs text-brand-muted">
                  Tổng điểm các test: {testCases.reduce((s, t) => s + (parseInt(t.points) || 0), 0)}đ
                  {form.max_score ? ` / Tổng bài: ${form.max_score}đ` : ''}
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addTestCase} icon={Plus}>
                Thêm test case
              </Button>
            </div>

            <div className="space-y-4">
              {testCases.map((tc, i) => (
                <div key={i} className="rounded-xl border border-brand-border bg-page p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-sm font-medium text-brand-heading">
                      <Code className="h-4 w-4 text-brand" /> {tc.test_name}
                    </h3>
                    {testCases.length > 1 && (
                      <button type="button" onClick={() => removeTestCase(i)}
                        className="inline-flex items-center gap-1 text-sm text-brand hover:underline">
                        <Trash2 className="h-3.5 w-3.5" /> Xóa
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs text-brand-muted">Input</label>
                      <input
                        type="text" value={tc.input_data}
                        onChange={(e) => updateTestCase(i, 'input_data', e.target.value)}
                        className={`${input} text-sm`}
                        placeholder="Dữ liệu đầu vào"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-brand-muted">Expected Output</label>
                      <input
                        type="text" value={tc.expected_output}
                        onChange={(e) => updateTestCase(i, 'expected_output', e.target.value)}
                        className={`${input} text-sm`}
                        placeholder="Kết quả mong đợi"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-brand-muted">Điểm</label>
                      <input
                        type="number" min={1} value={tc.points}
                        onChange={(e) => updateTestCase(i, 'points', parseInt(e.target.value) || 1)}
                        className={`${input} text-sm`}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {isEdit && assignmentId && (
          <CompetencyMappingPanel
            assignmentId={assignmentId}
            assignmentType={type}
            category={category}
            testCases={testCases}
          />
        )}

        <div className="flex gap-3 pb-8">
          <Button type="button" variant="outline" onClick={() => navigate(isLibraryMode ? '/assignments' : `/classes/${classId}`)}>
            Hủy
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? (isEdit ? 'Đang lưu...' : 'Đang tạo...') : (isEdit ? 'Lưu thay đổi' : 'Tạo bài tập')}
          </Button>
        </div>
      </form>
    </div>
  );
};

const SectionCard = ({ title, description, trailing, children }) => (
  <div className="rounded-2xl bg-card p-6 shadow-card ring-1 ring-brand-border">
    <div className="mb-4 flex items-center justify-between">
      <div>
        <h2 className="text-lg font-semibold text-brand-heading">{title}</h2>
        {description && <p className="mt-1 text-sm text-brand-muted">{description}</p>}
      </div>
      {trailing && <span className="text-sm text-brand-muted">{trailing}</span>}
    </div>
    {children}
  </div>
);

export default CreateAssignment;
