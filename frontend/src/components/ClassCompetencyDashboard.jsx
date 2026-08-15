import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import Button from './Button';
import Badge from './Badge';
import Modal from './Modal';
import { buildCompetencySummary, displayMastery } from '../utils/competency';

const toneColor = { neutral: 'gray', danger: 'red', warning: 'orange', info: 'blue', success: 'green' };
const trendText = { improving: 'Đang tiến bộ', stable: 'Ổn định', declining: 'Có xu hướng giảm', insufficient: 'Chưa đủ dữ liệu' };

const ClassCompetencyDashboard = ({ classId }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState(null);
  const [submission, setSubmission] = useState(null);

  const load = useCallback(async () => {
    try {
      const response = await api.get(`/api/classes/${classId}/competencies`);
      setData(response.data); setError('');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Không thể tải phân tích năng lực');
    } finally { setLoading(false); }
  }, [classId]);
  useEffect(() => { load(); }, [load]);

  const calculate = async () => {
    setCalculating(true); setError('');
    try {
      await api.post(`/api/classes/${classId}/competencies/calculate`);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Không thể cập nhật chỉ số');
    } finally { setCalculating(false); }
  };

  const openStudent = async (studentId) => {
    try {
      const response = await api.get(`/api/classes/${classId}/students/${studentId}/competencies`);
      setProfile(response.data);
    } catch (requestError) { setError(requestError.response?.data?.message || 'Không thể tải hồ sơ học sinh'); }
  };
  const openSubmission = async (submissionId) => {
    try {
      const response = await api.get(`/api/classes/${classId}/submissions/${submissionId}`);
      setSubmission(response.data);
    } catch (requestError) { setError(requestError.response?.data?.message || 'Không thể tải bài nộp'); }
  };

  const summaries = useMemo(() => buildCompetencySummary(data?.snapshots ?? []), [data]);
  const skills = useMemo(() => {
    const map = new Map();
    for (const item of data?.snapshots ?? []) if (item.competency) map.set(item.competency_id, item.competency);
    return [...map.values()].sort((a, b) => a.code.localeCompare(b.code, 'en'));
  }, [data]);

  if (loading) return <div className="rounded-2xl bg-card p-6 text-sm text-brand-muted">Đang tải phân tích năng lực...</div>;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-card p-5 shadow-card ring-1 ring-brand-border">
        <div>
          <h2 className="text-lg font-semibold text-brand-heading">Phân tích năng lực</h2>
          <p className="mt-1 text-sm text-brand-muted">{data?.calculated_at ? `Cập nhật ${new Date(data.calculated_at).toLocaleString('vi-VN')}` : 'Chưa tính chỉ số cho lớp này'}</p>
        </div>
        <Button onClick={calculate} disabled={calculating}>{calculating ? 'Đang tính...' : 'Cập nhật chỉ số'}</Button>
      </div>
      {error && <div className="rounded-xl bg-badge-red-bg p-3 text-sm text-badge-red-text">{error}</div>}
      {!skills.length ? (
        <div className="rounded-2xl bg-card p-8 text-center text-sm text-brand-muted shadow-card ring-1 ring-brand-border">
          Chưa có mapping đã duyệt hoặc chưa có bài nộp để tạo bằng chứng.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {skills.map((skill) => {
            const count = summaries[skill.id];
            return <div key={skill.id} className="rounded-2xl bg-card p-5 shadow-card ring-1 ring-brand-border">
              <div className="text-xs font-medium text-brand">{skill.code}</div>
              <h3 className="mt-1 font-semibold text-brand-heading">{skill.name}</h3>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-brand-muted">
                <span>Chưa đủ: {count?.insufficient ?? 0}</span><span>Đang hình thành: {count?.emerging ?? 0}</span>
                <span>Đạt: {count?.achieved ?? 0}</span><span>Thành thạo: {count?.mastered ?? 0}</span>
              </div>
            </div>;
          })}
        </div>
      )}
      <div className="overflow-x-auto rounded-2xl bg-card shadow-card ring-1 ring-brand-border">
        <table className="min-w-full divide-y divide-brand-border text-sm">
          <thead><tr><th className="px-4 py-3 text-left">Học sinh</th><th className="px-4 py-3 text-left">Kỹ năng có dữ liệu</th><th className="px-4 py-3 text-left">Chi tiết</th></tr></thead>
          <tbody className="divide-y divide-brand-border">
            {(data?.students ?? []).map((student) => <tr key={student.id}>
              <td className="px-4 py-3 font-medium text-brand-heading">{student.full_name}</td>
              <td className="px-4 py-3 text-brand-muted">{student.skills.length}</td>
              <td className="px-4 py-3"><Button size="sm" variant="outline" onClick={() => openStudent(student.id)}>Xem hồ sơ</Button></td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <Modal open={Boolean(profile)} onClose={() => { setProfile(null); setSubmission(null); }} title={profile?.student?.full_name} subtitle="Hồ sơ năng lực có dẫn chứng" maxWidth="max-w-4xl">
        <div className="space-y-4">
          {(profile?.skills ?? []).map((skill) => {
            const display = displayMastery(skill);
            return <div key={skill.id} className="rounded-xl border border-brand-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><strong>{skill.competency?.name}</strong><Badge color={toneColor[display.tone]}>{display.label}{display.value !== null ? ` · ${display.value}` : ''}</Badge></div>
              <div className="mt-2 text-xs text-brand-muted">Độ tin cậy: {skill.confidence}% · {trendText[skill.trend]}</div>
            </div>;
          })}
          <h3 className="font-semibold text-brand-heading">Bằng chứng</h3>
          {(profile?.evidence ?? []).map((item) => <button key={item.id} type="button" onClick={() => openSubmission(item.submission_id)} className="block w-full rounded-xl border border-brand-border p-3 text-left text-sm hover:bg-gray-50">
            <span className="font-medium">{item.assignment?.title}</span> · {item.result?.test_name || 'Test trình duyệt'} · {item.passed ? 'Đạt' : 'Chưa đạt'}
          </button>)}
          {submission && <div className="rounded-xl bg-neutral-900 p-4 text-sm text-gray-100"><div className="mb-2 font-semibold">{submission.assignment?.title}</div><pre className="whitespace-pre-wrap">{submission.code || '(Không có nội dung)'}</pre></div>}
        </div>
      </Modal>
    </div>
  );
};

export default ClassCompetencyDashboard;
