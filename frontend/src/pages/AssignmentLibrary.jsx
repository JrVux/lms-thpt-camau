import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import AssignmentDeliveryModal from '../components/AssignmentDeliveryModal';
import AssignmentDeliveryList from '../components/AssignmentDeliveryList';
import Badge from '../components/Badge';
import ConfirmDialog from '../components/ConfirmDialog';
import { Plus, Pencil, Send, Layers, Folder, Trash2 } from 'lucide-react';

const CATEGORIES = [
  { key: 'grade_10', label: 'Khối 10', color: 'green' },
  { key: 'grade_11', label: 'Khối 11', color: 'purple' },
  { key: 'grade_12', label: 'Khối 12', color: 'orange' },
  { key: 'advanced', label: 'Nâng cao', color: 'red' },
];

const subjectColor = (type) => ({ python: 'green', sql: 'purple', html: 'orange' }[type] || 'blue');

const AssignmentLibrary = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialClassId = searchParams.get('classId');
  const typeFilter = searchParams.get('type') || 'all';

  const [activeCategory, setActiveCategory] = useState('grade_10');
  const [topics, setTopics] = useState([]);
  const [activeTopic, setActiveTopic] = useState('all');
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [classes, setClasses] = useState([]);
  const [deliveryAssignment, setDeliveryAssignment] = useState(null);
  const [listAssignment, setListAssignment] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const loadTopics = useCallback(async () => {
    try {
      const { data } = await api.get(`/api/assignment-library/topics?category=${activeCategory}`);
      setTopics(data);
    } catch {
      setTopics([]);
    }
  }, [activeCategory]);

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ category: activeCategory });
      if (activeTopic !== 'all') params.set('topicId', activeTopic);
      const { data } = await api.get(`/api/assignment-library?${params.toString()}`);
      setAssignments(data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Không thể tải kho bài tập.');
    } finally {
      setLoading(false);
    }
  }, [activeCategory, activeTopic]);

  useEffect(() => {
    loadTopics();
  }, [loadTopics]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  useEffect(() => {
    setActiveTopic('all');
  }, [activeCategory]);

  useEffect(() => {
    api.get('/api/classes').then(({ data }) => setClasses(data)).catch(() => {});
  }, []);

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await api.delete(`/api/assignment-library/${deleteTarget.id}`);
      setDeleteTarget(null);
      await Promise.all([loadAssignments(), loadTopics()]);
    } catch (err) {
      setDeleteError(err.response?.data?.message || 'Xóa bài tập thất bại');
    } finally {
      setDeleting(false);
    }
  };

  const visibleAssignments = assignments.filter((a) => {
    if (typeFilter === 'practice_file') return a.submission_type === 'practice_file';
    if (typeFilter === 'essay') return a.submission_type === 'essay';
    return !a.submission_type || a.submission_type === 'autograde';
  });

  const getPageHeader = () => {
    if (typeFilter === 'practice_file') {
      return {
        title: 'Bài tập Thực hành',
        subtitle: 'Các bài tập nộp file sản phẩm thực hành được giao và quản lý cho từng lớp.',
        btnLabel: 'Tạo bài thực hành',
      };
    }
    if (typeFilter === 'essay') {
      return {
        title: 'Bài tập Tự luận',
        subtitle: 'Các bài tập tự luận nộp file làm bài được giao và quản lý cho từng lớp.',
        btnLabel: 'Tạo bài tự luận',
      };
    }
    return {
      title: 'Kho bài tập (Tự động chấm)',
      subtitle: 'Tạo một lần, sau đó giao và tùy chỉnh độc lập cho từng lớp.',
      btnLabel: 'Tạo bài tập',
    };
  };

  const headerInfo = getPageHeader();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-brand-heading">{headerInfo.title}</h1>
          <p className="mt-1 text-sm text-brand-muted">{headerInfo.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/assignments/new?submission_type=${typeFilter === 'all' ? 'autograde' : typeFilter}&category=${activeCategory}${activeTopic !== 'all' ? `&topicId=${activeTopic}` : ''}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
          >
            <Plus className="h-4 w-4" />
            {headerInfo.btnLabel}
          </Link>
        </div>
      </div>

      <div className="inline-flex gap-1 rounded-xl bg-card p-1 shadow-card ring-1 ring-brand-border">
        {CATEGORIES.map((category) => (
          <button
            key={category.key}
            type="button"
            onClick={() => setActiveCategory(category.key)}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeCategory === category.key
                ? 'bg-brand-light text-brand'
                : 'text-brand-muted hover:bg-gray-50 hover:text-brand-heading'
            }`}
          >
            {category.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 inline-flex items-center gap-1.5 text-sm font-medium text-brand-muted">
          <Folder className="h-4 w-4" /> Chủ đề:
        </span>
        <button
          type="button"
          onClick={() => setActiveTopic('all')}
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
            activeTopic === 'all'
              ? 'bg-brand text-white'
              : 'bg-card text-brand-muted ring-1 ring-brand-border hover:text-brand-heading'
          }`}
        >
          Tất cả
        </button>
        {topics.map((topic) => (
          <button
            key={topic.id}
            type="button"
            onClick={() => setActiveTopic(topic.id)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTopic === topic.id
                ? 'bg-brand text-white'
                : 'bg-card text-brand-muted ring-1 ring-brand-border hover:text-brand-heading'
            }`}
          >
            {topic.name}
            <span className={`rounded-full px-1.5 text-xs ${activeTopic === topic.id ? 'bg-white/20' : 'bg-page text-brand-muted'}`}>
              {topic.assignment_count ?? 0}
            </span>
          </button>
        ))}
        {topics.length === 0 && (
          <span className="text-sm text-brand-muted">
            Chưa có chủ đề — chọn "Thêm chủ đề mới" khi soạn bài để sắp xếp gọn gàng.
          </span>
        )}
      </div>

      {error && <div className="rounded-xl bg-badge-red-bg p-3 text-sm text-badge-red-text">{error}</div>}
      {loading && <div className="rounded-2xl bg-card p-10 text-center text-brand-muted shadow-card ring-1 ring-brand-border">Đang tải kho bài tập...</div>}
      {!loading && !error && visibleAssignments.length === 0 && (
        <div className="rounded-2xl border border-dashed border-brand-border bg-card p-12 text-center text-brand-muted">
          {activeTopic === 'all' ? 'Chưa có bài tập trong nhóm này.' : 'Chưa có bài tập thuộc chủ đề này.'}
        </div>
      )}

      {!loading && visibleAssignments.length > 0 && (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {visibleAssignments.map((assignment) => (
            <article key={assignment.id} className="group flex flex-col rounded-2xl bg-card p-5 shadow-card ring-1 ring-brand-border transition-all hover:-translate-y-0.5 hover:shadow-card-hover">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-semibold tracking-tight text-brand-heading">{assignment.title}</h2>
                <div className="flex items-center gap-1">
                  {['practice_file', 'essay'].includes(assignment.submission_type) ? (
                    <Badge color={assignment.submission_type === 'essay' ? 'purple' : 'blue'}>
                      {assignment.submission_type === 'essay' ? 'Tự luận' : 'Thực hành'}
                    </Badge>
                  ) : (
                    <Badge color={subjectColor(assignment.type)} className="uppercase">{assignment.type}</Badge>
                  )}
                </div>
              </div>
              <p className="mt-2 line-clamp-2 min-h-10 text-sm text-brand-muted">{assignment.description || 'Không có mô tả'}</p>
              {assignment.topic && (
                <span className="mt-2 inline-flex items-center gap-1 self-start rounded-full bg-page px-2.5 py-1 text-xs font-medium text-brand-muted ring-1 ring-brand-border">
                  <Folder className="h-3 w-3 text-brand" /> {assignment.topic}
                </span>
              )}
              <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-xl bg-page p-2.5">
                  <dt className="text-brand-muted">Điểm</dt>
                  <dd className="mt-0.5 font-semibold text-brand-heading">{assignment.max_score ?? 0}</dd>
                </div>
                <div className="rounded-xl bg-page p-2.5">
                  <dt className="text-brand-muted">Phiên bản</dt>
                  <dd className="mt-0.5 font-semibold text-brand-heading">{assignment.content_version}</dd>
                </div>
                <div className="rounded-xl bg-page p-2.5">
                  <dt className="text-brand-muted">Đã giao</dt>
                  <dd className="mt-0.5 font-semibold text-brand-heading">{assignment.delivery_count ?? 0}</dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-2 text-sm pt-1">
                <Link className="inline-flex items-center gap-1.5 font-medium text-brand hover:underline" to={`/assignments/${assignment.id}/edit`}>
                  <Pencil className="h-3.5 w-3.5" />Chỉnh sửa
                </Link>
                <button className="inline-flex items-center gap-1.5 font-medium text-blue-600 hover:underline" type="button" onClick={() => setDeliveryAssignment(assignment)}>
                  <Send className="h-3.5 w-3.5" />Giao bài
                </button>
                <button className="inline-flex items-center gap-1.5 font-medium text-brand-muted hover:underline" type="button" onClick={() => setListAssignment(assignment)}>
                  <Layers className="h-3.5 w-3.5" />Các lớp đã giao
                </button>
                <button
                  className="inline-flex items-center gap-1.5 font-medium text-badge-red-text hover:underline"
                  type="button"
                  onClick={() => { setDeleteError(''); setDeleteTarget(assignment); }}
                >
                  <Trash2 className="h-3.5 w-3.5" />Xóa
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {deliveryAssignment && (
        <AssignmentDeliveryModal
          assignment={deliveryAssignment}
          classes={classes}
          open
          onClose={() => setDeliveryAssignment(null)}
          onDelivered={loadAssignments}
          initialClassId={initialClassId}
        />
      )}
      {listAssignment && (
        <AssignmentDeliveryList
          assignment={listAssignment}
          open
          onClose={() => setListAssignment(null)}
        />
      )}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Xóa bài tập?"
        message={
          deleteTarget
            ? deleteTarget.delivery_count > 0
              ? `"${deleteTarget.title}" đã giao cho ${deleteTarget.delivery_count} lớp. Xóa sẽ gỡ bài khỏi các lớp đó và xóa toàn bộ bài nộp, điểm của học sinh. Hành động này không thể hoàn tác.`
              : `Xóa "${deleteTarget.title}" khỏi Kho bài tập? Hành động này không thể hoàn tác.`
            : ''
        }
        confirmLabel={deleting ? 'Đang xóa...' : 'Xóa vĩnh viễn'}
        onConfirm={confirmDelete}
        onCancel={() => { if (!deleting) setDeleteTarget(null); }}
      />
      {deleteError && (
        <div className="rounded-xl bg-badge-red-bg p-3 text-sm text-badge-red-text">{deleteError}</div>
      )}
    </div>
  );
};

export default AssignmentLibrary;