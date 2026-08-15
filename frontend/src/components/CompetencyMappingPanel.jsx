import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import Button from './Button';
import Badge from './Badge';
import { buildMappingPayload, sortCompetencies } from '../utils/competency';

const emptyRow = { competency_id: '', test_case_id: '', difficulty: 2, weight: 1, approved: false };
const input = 'w-full rounded-lg border border-brand-border px-3 py-2 text-sm outline-none focus:border-brand';

const CompetencyMappingPanel = ({ assignmentId, assignmentType, category, testCases = [] }) => {
  const [competencies, setCompetencies] = useState([]);
  const [rows, setRows] = useState([emptyRow]);
  const [custom, setCustom] = useState({ name: '', description: '' });
  const [showCustom, setShowCustom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const grade = category === 'grade_10' || category === 'advanced' ? '10' : category?.replace('grade_', '');

  const load = async () => {
    const [{ data: framework }, { data: mappings }] = await Promise.all([
      api.get(`/api/competencies?grade=${grade}&subject=${assignmentType}`),
      api.get(`/api/assignments/${assignmentId}/competencies`),
    ]);
    setCompetencies(sortCompetencies(framework));
    setRows(mappings.length ? mappings.map((item) => ({
      competency_id: item.competency_id,
      test_case_id: item.test_case_id || '',
      difficulty: item.difficulty,
      weight: item.weight,
      approved: item.status === 'approved',
      status: item.status,
    })) : [emptyRow]);
  };

  useEffect(() => {
    load().catch((error) => setMessage(error.response?.data?.message || 'Không thể tải khung năng lực'));
  }, [assignmentId, assignmentType, grade]);

  const availableTests = useMemo(() => testCases.filter((item) => item.id), [testCases]);
  const updateRow = (index, key, value) => setRows((current) => current.map(
    (row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row
  ));

  const save = async () => {
    setBusy(true); setMessage('');
    try {
      const normalized = rows.map((row) => assignmentType === 'python' ? { ...row, test_case_id: '' } : row);
      await api.put(`/api/assignments/${assignmentId}/competencies`, {
        mappings: buildMappingPayload(assignmentId, normalized),
      });
      setMessage('Đã lưu kỹ năng của bài tập.');
      await load();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Không thể lưu kỹ năng');
    } finally { setBusy(false); }
  };

  const createCustom = async () => {
    setBusy(true); setMessage('');
    try {
      const { data } = await api.post('/api/competencies', {
        ...custom, subject: 'python', grade: '10', prerequisite_ids: [],
      });
      setCompetencies((current) => sortCompetencies([...current, data]));
      setCustom({ name: '', description: '' }); setShowCustom(false);
      setMessage('Đã tạo kỹ năng riêng.');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Không thể tạo kỹ năng riêng');
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-2xl bg-card p-6 shadow-card ring-1 ring-brand-border">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-brand-heading">Kỹ năng được đánh giá</h2>
          <p className="mt-1 text-sm text-brand-muted">Chỉ mapping đã duyệt mới được dùng để tính năng lực.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setShowCustom((value) => !value)}>
          Thêm kỹ năng riêng
        </Button>
      </div>
      {message && <div className="mb-3 rounded-lg bg-gray-50 p-3 text-sm text-brand-body">{message}</div>}
      {showCustom && (
        <div className="mb-4 grid gap-3 rounded-xl border border-brand-border p-4 md:grid-cols-2">
          <input className={input} placeholder="Tên kỹ năng" value={custom.name} onChange={(event) => setCustom({ ...custom, name: event.target.value })} />
          <input className={input} placeholder="Mô tả ít nhất 10 ký tự" value={custom.description} onChange={(event) => setCustom({ ...custom, description: event.target.value })} />
          <Button type="button" size="sm" disabled={busy} onClick={createCustom}>Tạo kỹ năng</Button>
        </div>
      )}
      <div className="space-y-3">
        {rows.map((row, index) => (
          <div key={index} className="grid gap-3 rounded-xl border border-brand-border p-4 md:grid-cols-6">
            <select className={`${input} md:col-span-2`} value={row.competency_id} onChange={(event) => updateRow(index, 'competency_id', event.target.value)}>
              <option value="">Chọn kỹ năng</option>
              {competencies.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}
            </select>
            {assignmentType !== 'python' ? (
              <select className={input} value={row.test_case_id} onChange={(event) => updateRow(index, 'test_case_id', event.target.value)}>
                <option value="">Toàn bài</option>
                {availableTests.map((item) => <option key={item.id} value={item.id}>{item.test_name}</option>)}
              </select>
            ) : <div className="flex items-center text-xs text-brand-muted">Toàn bộ test Python</div>}
            <input className={input} type="number" min="1" max="5" value={row.difficulty} onChange={(event) => updateRow(index, 'difficulty', event.target.value)} aria-label="Độ khó" />
            <input className={input} type="number" min="0.1" max="10" step="0.1" value={row.weight} onChange={(event) => updateRow(index, 'weight', event.target.value)} aria-label="Trọng số" />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={row.approved} onChange={(event) => updateRow(index, 'approved', event.target.checked)} />
              <Badge color={row.approved ? 'green' : 'orange'}>{row.approved ? 'Đã duyệt' : 'Đề xuất'}</Badge>
            </label>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setRows((current) => [...current, { ...emptyRow }])}>Thêm mapping</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setRows((current) => current.map((row) => ({ ...row, approved: true })))}>Duyệt tất cả</Button>
        <Button type="button" size="sm" disabled={busy} onClick={save}>{busy ? 'Đang lưu...' : 'Lưu kỹ năng'}</Button>
      </div>
    </div>
  );
};

export default CompetencyMappingPanel;
