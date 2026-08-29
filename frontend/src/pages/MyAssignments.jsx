import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import Badge from '../components/Badge';
import EmptyState from '../components/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner';
import { CalendarClock, CheckCircle2, AlertTriangle, RefreshCcw, FileCode2, ArrowRight } from 'lucide-react';

const subjectColor = (type) => ({ python: 'green', sql: 'purple', html: 'orange' }[type] || 'blue');

const TABS = [
  { key: 'pending', label: 'Cần làm', icon: CalendarClock, color: 'purple' },
  { key: 'submitted', label: 'Đã nộp', icon: CheckCircle2, color: 'green' },
  { key: 'graded', label: 'Đã chấm', icon: CheckCircle2, color: 'blue' },
  { key: 'overdue', label: 'Quá hạn', icon: AlertTriangle, color: 'orange' },
  { key: 'regrade', label: 'Cần chấm lại', icon: RefreshCcw, color: 'red' },
];

const editorPath = (delivery) => {
  const submissionType = delivery.assignments?.submission_type;
  if (['practice_file', 'essay'].includes(submissionType)) {
    return `/deliveries/${delivery.id}/file-submission`;
  }
  const type = delivery.assignments?.type;
  if (type === 'sql') return `/deliveries/${delivery.id}/sql-practice`;
  if (type === 'html') return `/deliveries/${delivery.id}/html-practice`;
  return `/deliveries/${delivery.id}/python-practice`;
};

const MyAssignments = () => {
  const [searchParams] = useSearchParams();
  const typeFilter = searchParams.get('type') || 'all';

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

  const filteredDeliveries = useMemo(() => {
    return deliveries.filter((d) => {
      const st = d.assignments?.submission_type;
      if (typeFilter === 'practice_file') return st === 'practice_file';
      if (typeFilter === 'essay') return st === 'essay';
      return !st || st === 'autograde';
    });
  }, [deliveries, typeFilter]);

  const counts = useMemo(() => Object.fromEntries(TABS.map((tab) => [
    tab.key,
    filteredDeliveries.filter((delivery) => delivery.assignment_status === tab.key).length,
  ])), [filteredDeliveries]);

  const visible = filteredDeliveries.filter((delivery) => delivery.assignment_status === activeTab);

  const headerTitle = typeFilter === 'practice_file'
    ? 'Bài tập Thực hành'
    : typeFilter === 'essay'
    ? 'Bài tập Tự luận'
    : 'Bài tập của tôi';

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-brand-heading">{headerTitle}</h1>
        <p className="mt-1 text-sm text-brand-muted">Các bài được giao cho toàn lớp hoặc riêng cho bạn.</p>
      </div>

      <div className="inline-flex gap-1 rounded-xl bg-card p-1 shadow-card ring-1 ring-brand-border">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key ? 'bg-brand-light text-brand' : 'text-brand-muted hover:bg-gray-50 hover:text-brand-heading'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label} ({counts[tab.key]})
          </button>
        ))}
      </div>

      {loading && <div className="rounded-2xl bg-card p-10 text-center text-brand-muted shadow-card ring-1 ring-brand-border">Đang tải bài tập...</div>}
      {error && <div className="rounded-xl bg-badge-red-bg p-3 text-sm text-badge-red-text">{error}</div>}
      {!loading && !error && visible.length === 0 && (
        <div className="rounded-2xl bg-card shadow-card ring-1 ring-brand-border">
          <EmptyState
            icon={FileCode2}
            color={TABS.find((t) => t.key === activeTab).color}
            title="Không có bài tập trong mục này"
            description="Các bài tập mới sẽ xuất hiện tại đây"
          />
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {visible.map((delivery) => {
          const assignment = delivery.assignments;
          const latest = [...(delivery.submissions ?? [])].sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at))[0];
          return (
            <article key={delivery.id} className="group flex flex-col rounded-2xl bg-card p-5 shadow-card ring-1 ring-brand-border transition-all hover:-translate-y-0.5 hover:shadow-card-hover">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-semibold tracking-tight text-brand-heading">{assignment.title}</h2>
                <div className="flex items-center gap-1.5">
                  {['practice_file', 'essay'].includes(assignment.submission_type) ? (
                    <Badge color={assignment.submission_type === 'essay' ? 'purple' : 'blue'}>
                      {assignment.submission_type === 'essay' ? 'Tự luận' : 'Thực hành'}
                    </Badge>
                  ) : (
                    <Badge color={subjectColor(assignment.type)} className="uppercase">{assignment.type}</Badge>
                  )}
                </div>
              </div>
              <p className="mt-2 text-sm text-brand-muted">
                {delivery.classes?.name} · {delivery.due_date ? `Hạn ${new Date(delivery.due_date).toLocaleString('vi-VN')}` : 'Không hạn nộp'}
              </p>
              {latest && <p className="mt-2 text-sm font-medium text-brand-heading">Điểm gần nhất: {latest.score}/{latest.max_score}</p>}
              <div className="mt-4 pt-1">
                <Link to={editorPath(delivery)} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600">
                  {activeTab === 'regrade' ? 'Mở và chấm lại' : activeTab === 'submitted' ? 'Xem / làm lại' : 'Làm bài'}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
};

export default MyAssignments;