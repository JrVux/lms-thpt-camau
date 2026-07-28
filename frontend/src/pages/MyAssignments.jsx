import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

const TABS = [
  { key: 'pending', label: 'Cần làm' },
  { key: 'submitted', label: 'Đã nộp' },
  { key: 'overdue', label: 'Quá hạn' },
  { key: 'regrade', label: 'Cần chấm lại' },
];

const editorPath = (delivery) => {
  const type = delivery.assignments?.type;
  if (type === 'sql') return `/deliveries/${delivery.id}/sql-practice`;
  if (type === 'html') return `/deliveries/${delivery.id}/html-practice`;
  return `/deliveries/${delivery.id}/python-practice`;
};

const MyAssignments = () => {
  const [deliveries, setDeliveries] = useState([]);
  const [activeTab, setActiveTab] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/my-assignments')
      .then(({ data }) => setDeliveries(data))
      .catch((requestError) => setError(requestError.response?.data?.message || 'Không thể tải bài tập.'))
      .finally(() => setLoading(false));
  }, []);

  const counts = useMemo(() => Object.fromEntries(TABS.map((tab) => [
    tab.key,
    deliveries.filter((delivery) => delivery.assignment_status === tab.key).length,
  ])), [deliveries]);
  const visible = deliveries.filter((delivery) => delivery.assignment_status === activeTab);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div><h1 className="text-2xl font-bold">Bài tập của tôi</h1><p className="mt-1 text-sm text-gray-500">Các bài được giao cho toàn lớp hoặc riêng cho bạn.</p></div>
      <div className="flex gap-2 overflow-x-auto border-b">
        {TABS.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`border-b-2 px-4 py-3 text-sm font-medium ${activeTab === tab.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}>
            {tab.label} ({counts[tab.key]})
          </button>
        ))}
      </div>
      {loading && <div className="rounded-xl border bg-white p-8 text-center text-gray-500">Đang tải bài tập...</div>}
      {error && <div className="rounded-lg bg-red-50 p-3 text-red-700">{error}</div>}
      {!loading && !error && visible.length === 0 && <div className="rounded-xl border border-dashed bg-white p-8 text-center text-gray-500">Không có bài tập trong mục này.</div>}
      <div className="grid gap-4 md:grid-cols-2">
        {visible.map((delivery) => {
          const assignment = delivery.assignments;
          const latest = [...(delivery.submissions ?? [])].sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at))[0];
          return (
            <article key={delivery.id} className="rounded-xl border bg-white p-5 shadow-sm">
              <div className="flex justify-between gap-3"><h2 className="font-semibold">{assignment.title}</h2><span className="text-xs font-semibold uppercase text-blue-600">{assignment.type}</span></div>
              <p className="mt-2 text-sm text-gray-500">{delivery.classes?.name} · {delivery.due_date ? `Hạn ${new Date(delivery.due_date).toLocaleString('vi-VN')}` : 'Không hạn nộp'}</p>
              {latest && <p className="mt-2 text-sm font-medium">Điểm gần nhất: {latest.score}/{latest.max_score}</p>}
              <Link to={editorPath(delivery)} className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">
                {activeTab === 'regrade' ? 'Mở và chấm lại' : activeTab === 'submitted' ? 'Xem / làm lại' : 'Làm bài'}
              </Link>
            </article>
          );
        })}
      </div>
    </div>
  );
};

export default MyAssignments;
