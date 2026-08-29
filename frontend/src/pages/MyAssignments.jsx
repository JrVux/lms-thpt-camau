import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import api from '../services/api';
import Badge from '../components/Badge';
import EmptyState from '../components/EmptyState';
import {
  CalendarClock,
  CheckCircle2,
  AlertTriangle,
  RefreshCcw,
  FileCode2,
  ArrowRight,
  Award,
  Download,
  BookOpen,
  FileCheck2,
  PenTool,
} from 'lucide-react';

const subjectColor = (type) => ({ python: 'green', sql: 'purple', html: 'orange' }[type] || 'blue');

const TABS = [
  { key: 'pending', label: 'Cần làm', icon: CalendarClock, color: 'purple' },
  { key: 'submitted', label: 'Đã nộp', icon: CheckCircle2, color: 'green' },
  { key: 'graded', label: 'Đã chấm', icon: CheckCircle2, color: 'blue' },
  { key: 'overdue', label: 'Quá hạn', icon: AlertTriangle, color: 'orange' },
  { key: 'regrade', label: 'Cần chấm lại', icon: RefreshCcw, color: 'red' },
  { key: 'gradebook', label: 'Bảng điểm tổng hợp', icon: Award, color: 'emerald' },
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

const StudentGradebookSummary = ({ deliveries }) => {
  const summary = useMemo(() => {
    let totalScore = 0;
    let totalMaxScore = 0;
    let gradedCount = 0;
    let submittedCount = 0;

    const items = deliveries.map((d) => {
      const assignment = d.assignments || {};
      const latestSub = [...(d.submissions || [])].sort(
        (a, b) => new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0)
      )[0];

      const score = latestSub?.score != null ? Number(latestSub.score) : null;
      const maxScore = Number(latestSub?.max_score || assignment.max_score || 10);
      const isGraded = score != null;
      const isSubmitted = Boolean(latestSub?.submitted_at || latestSub?.object_key);
      const isOverdue = d.due_date && new Date(d.due_date) < new Date() && !isSubmitted;

      if (isGraded) {
        totalScore += score;
        totalMaxScore += maxScore;
        gradedCount += 1;
      }
      if (isSubmitted) {
        submittedCount += 1;
      }

      let subTypeLabel = 'Lập trình';
      if (assignment.submission_type === 'practice_file') subTypeLabel = 'Thực hành (File)';
      if (assignment.submission_type === 'essay') subTypeLabel = 'Tự luận (File)';

      return {
        id: d.id,
        title: assignment.title || 'Bài tập',
        type: assignment.type,
        submissionType: assignment.submission_type || 'autograde',
        subTypeLabel,
        className: d.classes?.name || '',
        dueDate: d.due_date,
        submittedAt: latestSub?.submitted_at,
        score,
        maxScore,
        feedback: latestSub?.feedback || '',
        isGraded,
        isSubmitted,
        isOverdue,
        editorPath: editorPath(d),
      };
    });

    const averagePercent = totalMaxScore > 0 ? (totalScore / totalMaxScore) * 100 : 0;
    const gpa10 = (averagePercent / 10).toFixed(1);

    let rankText = 'Chưa xếp loại';
    if (gradedCount > 0) {
      if (gpa10 >= 9.0) rankText = 'Xuất sắc 🌟';
      else if (gpa10 >= 8.0) rankText = 'Giỏi 🎯';
      else if (gpa10 >= 6.5) rankText = 'Khá 👍';
      else if (gpa10 >= 5.0) rankText = 'Trung bình ⚖️';
      else rankText = 'Cần cố gắng 💡';
    }

    const autogradeItems = items.filter((i) => i.submissionType === 'autograde');
    const practiceItems = items.filter((i) => i.submissionType === 'practice_file');
    const essayItems = items.filter((i) => i.submissionType === 'essay');

    const getCatAverage = (catItems) => {
      const graded = catItems.filter((i) => i.isGraded);
      if (graded.length === 0) return 'Chưa chấm';
      const earned = graded.reduce((sum, i) => sum + i.score, 0);
      const max = graded.reduce((sum, i) => sum + i.maxScore, 0);
      return max > 0 ? `${((earned / max) * 10).toFixed(1)} / 10` : '0 / 10';
    };

    return {
      total: deliveries.length,
      submittedCount,
      gradedCount,
      totalScore,
      totalMaxScore,
      gpa10,
      rankText,
      items,
      breakdown: {
        autograde: { count: autogradeItems.length, avg: getCatAverage(autogradeItems) },
        practice: { count: practiceItems.length, avg: getCatAverage(practiceItems) },
        essay: { count: essayItems.length, avg: getCatAverage(essayItems) },
      },
    };
  }, [deliveries]);

  const handleExportExcel = () => {
    const rows = summary.items.map((item, idx) => ({
      STT: idx + 1,
      'Tên bài tập': item.title,
      'Lớp học': item.className,
      'Dạng bài tập': item.subTypeLabel,
      'Trạng thái': item.isGraded ? 'Đã chấm' : item.isSubmitted ? 'Đã nộp' : item.isOverdue ? 'Quá hạn' : 'Chưa nộp',
      'Điểm đạt': item.score != null ? item.score : '-',
      'Điểm tối đa': item.maxScore,
      'Nhận xét GV': item.feedback || '-',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bảng điểm cá nhân');
    XLSX.writeFile(wb, 'bang_diem_ca_nhan.xlsx');
  };

  return (
    <div className="space-y-6">
      {/* Metrics Summary Header */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-brand-border bg-card p-5 shadow-card">
          <p className="text-xs font-semibold uppercase text-brand-muted">Đánh giá chung</p>
          <p className="mt-2 text-2xl font-extrabold text-emerald-600">{summary.rankText}</p>
          <p className="mt-1 text-xs text-brand-muted">Dựa trên các bài đã được chấm</p>
        </div>

        <div className="rounded-2xl border border-brand-border bg-card p-5 shadow-card">
          <p className="text-xs font-semibold uppercase text-brand-muted">Điểm trung bình (Hệ 10)</p>
          <p className="mt-2 text-3xl font-black text-brand-heading">
            {summary.gradedCount > 0 ? summary.gpa10 : '--'}
            <span className="text-sm font-normal text-brand-muted"> / 10</span>
          </p>
          <p className="mt-1 text-xs text-brand-muted">Tổng tích lũy: {summary.totalScore}/{summary.totalMaxScore}đ</p>
        </div>

        <div className="rounded-2xl border border-brand-border bg-card p-5 shadow-card">
          <p className="text-xs font-semibold uppercase text-brand-muted">Số bài đã nộp</p>
          <p className="mt-2 text-3xl font-black text-blue-600">
            {summary.submittedCount}
            <span className="text-sm font-normal text-brand-muted"> / {summary.total} bài</span>
          </p>
          <p className="mt-1 text-xs text-brand-muted">Tỷ lệ hoàn thành: {summary.total > 0 ? Math.round((summary.submittedCount / summary.total) * 100) : 0}%</p>
        </div>

        <div className="rounded-2xl border border-brand-border bg-card p-5 shadow-card">
          <p className="text-xs font-semibold uppercase text-brand-muted">Số bài đã chấm</p>
          <p className="mt-2 text-3xl font-black text-purple-600">
            {summary.gradedCount}
            <span className="text-sm font-normal text-brand-muted"> / {summary.total} bài</span>
          </p>
          <p className="mt-1 text-xs text-brand-muted">Đang chờ chấm: {summary.submittedCount - summary.gradedCount} bài</p>
        </div>
      </div>

      {/* Category Breakdown */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-brand-border bg-card p-4 shadow-card flex items-center space-x-3">
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-brand-muted font-medium">Lập trình (Autograde)</p>
            <p className="text-sm font-bold text-brand-heading">{summary.breakdown.autograde.count} bài tập</p>
            <p className="text-xs text-emerald-600 font-semibold">ĐTB: {summary.breakdown.autograde.avg}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-brand-border bg-card p-4 shadow-card flex items-center space-x-3">
          <div className="p-3 rounded-xl bg-blue-500/10 text-blue-600">
            <FileCheck2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-brand-muted font-medium">Thực hành (File)</p>
            <p className="text-sm font-bold text-brand-heading">{summary.breakdown.practice.count} bài tập</p>
            <p className="text-xs text-blue-600 font-semibold">ĐTB: {summary.breakdown.practice.avg}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-brand-border bg-card p-4 shadow-card flex items-center space-x-3">
          <div className="p-3 rounded-xl bg-purple-500/10 text-purple-600">
            <PenTool className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-brand-muted font-medium">Tự luận (File)</p>
            <p className="text-sm font-bold text-brand-heading">{summary.breakdown.essay.count} bài tập</p>
            <p className="text-xs text-purple-600 font-semibold">ĐTB: {summary.breakdown.essay.avg}</p>
          </div>
        </div>
      </div>

      {/* Roster Table Section */}
      <div className="rounded-2xl border border-brand-border bg-card shadow-card overflow-hidden">
        <div className="p-4 border-b border-brand-border flex items-center justify-between">
          <div>
            <h2 className="font-bold text-brand-heading">Bảng chi tiết kết quả học tập</h2>
            <p className="text-xs text-brand-muted mt-0.5">Tổng hợp từ bài tập Lập trình, Thực hành và Tự luận</p>
          </div>
          <button
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 text-xs font-semibold transition shadow-sm"
          >
            <Download className="w-4 h-4" />
            <span>Tải Bảng Điểm Excel</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-page text-xs font-semibold text-brand-muted uppercase border-b border-brand-border">
              <tr>
                <th className="p-3.5">Bài tập</th>
                <th className="p-3.5">Dạng bài</th>
                <th className="p-3.5">Lớp</th>
                <th className="p-3.5">Trạng thái</th>
                <th className="p-3.5">Điểm số</th>
                <th className="p-3.5">Nhận xét của Giáo viên</th>
                <th className="p-3.5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {summary.items.map((item) => (
                <tr key={item.id} className="hover:bg-page/40 transition">
                  <td className="p-3.5 font-medium text-brand-heading">
                    <div>{item.title}</div>
                    {item.dueDate && (
                      <div className="text-xs text-brand-muted">
                        Hạn: {new Date(item.dueDate).toLocaleString('vi-VN')}
                      </div>
                    )}
                  </td>
                  <td className="p-3.5">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                      item.submissionType === 'essay' ? 'bg-purple-500/10 text-purple-600' : item.submissionType === 'practice_file' ? 'bg-blue-500/10 text-blue-600' : 'bg-emerald-500/10 text-emerald-600'
                    }`}>
                      {item.subTypeLabel}
                    </span>
                  </td>
                  <td className="p-3.5 text-brand-muted">{item.className}</td>
                  <td className="p-3.5">
                    {item.isGraded ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Đã chấm
                      </span>
                    ) : item.isSubmitted ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Đã nộp
                      </span>
                    ) : item.isOverdue ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
                        <AlertTriangle className="w-3.5 h-3.5" /> Quá hạn
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                        <CalendarClock className="w-3.5 h-3.5" /> Chưa nộp
                      </span>
                    )}
                  </td>
                  <td className="p-3.5 font-bold">
                    {item.isGraded ? (
                      <span className="text-emerald-600 text-base">{item.score} / {item.maxScore}</span>
                    ) : (
                      <span className="text-brand-muted text-xs">--</span>
                    )}
                  </td>
                  <td className="p-3.5 text-xs text-brand-muted max-w-xs truncate">
                    {item.feedback || 'Chưa có nhận xét'}
                  </td>
                  <td className="p-3.5 text-right">
                    <Link
                      to={item.editorPath}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-brand text-white hover:bg-red-600 transition"
                    >
                      <span>{item.isGraded || item.isSubmitted ? 'Xem lại' : 'Làm bài'}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
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
    tab.key === 'gradebook'
      ? filteredDeliveries.length
      : filteredDeliveries.filter((delivery) => delivery.assignment_status === tab.key).length,
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

      <div className="inline-flex gap-1 rounded-xl bg-card p-1 shadow-card ring-1 ring-brand-border overflow-x-auto max-w-full">
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

      {!loading && !error && activeTab === 'gradebook' && (
        <StudentGradebookSummary deliveries={filteredDeliveries} />
      )}

      {!loading && !error && activeTab !== 'gradebook' && visible.length === 0 && (
        <div className="rounded-2xl bg-card shadow-card ring-1 ring-brand-border">
          <EmptyState
            icon={FileCode2}
            color={TABS.find((t) => t.key === activeTab)?.color || 'blue'}
            title="Không có bài tập trong mục này"
            description="Các bài tập mới sẽ xuất hiện tại đây"
          />
        </div>
      )}

      {!loading && !error && activeTab !== 'gradebook' && visible.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {visible.map((delivery) => {
            const assignment = delivery.assignments || {};
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
      )}
    </div>
  );
};

export default MyAssignments;