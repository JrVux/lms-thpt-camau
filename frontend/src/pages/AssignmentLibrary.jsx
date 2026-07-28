import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import AssignmentDeliveryModal from '../components/AssignmentDeliveryModal';
import AssignmentDeliveryList from '../components/AssignmentDeliveryList';

const CATEGORIES = [
  { key: 'grade_10', label: 'Khối 10' },
  { key: 'grade_11', label: 'Khối 11' },
  { key: 'grade_12', label: 'Khối 12' },
  { key: 'advanced', label: 'Nâng cao' },
];

const AssignmentLibrary = () => {
  const [activeCategory, setActiveCategory] = useState('grade_10');
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [classes, setClasses] = useState([]);
  const [deliveryAssignment, setDeliveryAssignment] = useState(null);
  const [listAssignment, setListAssignment] = useState(null);

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/api/assignment-library?category=${activeCategory}`);
      setAssignments(data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Không thể tải kho bài tập.');
    } finally {
      setLoading(false);
    }
  }, [activeCategory]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  useEffect(() => {
    api.get('/api/classes').then(({ data }) => setClasses(data)).catch(() => {});
  }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bài tập</h1>
          <p className="text-sm text-gray-500 mt-1">Tạo một lần, sau đó giao và tùy chỉnh độc lập cho từng lớp.</p>
        </div>
        <Link to={`/assignments/new?category=${activeCategory}`} className="rounded-lg bg-[#2563EB] px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
          Tạo bài tập
        </Link>
      </div>

      <div className="flex gap-2 overflow-x-auto border-b">
        {CATEGORIES.map((category) => (
          <button
            key={category.key}
            type="button"
            onClick={() => setActiveCategory(category.key)}
            className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium ${
              activeCategory === category.key
                ? 'border-[#2563EB] text-[#2563EB]'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {category.label}
          </button>
        ))}
      </div>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {loading && <div className="rounded-xl border bg-white p-8 text-center text-gray-500">Đang tải kho bài tập...</div>}
      {!loading && !error && assignments.length === 0 && (
        <div className="rounded-xl border border-dashed bg-white p-10 text-center text-gray-500">Chưa có bài tập trong nhóm này.</div>
      )}

      {!loading && assignments.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {assignments.map((assignment) => (
            <article key={assignment.id} className="rounded-xl border bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-semibold text-gray-900">{assignment.title}</h2>
                <span className="rounded bg-blue-50 px-2 py-1 text-xs font-medium uppercase text-blue-700">{assignment.type}</span>
              </div>
              <p className="mt-2 line-clamp-2 min-h-10 text-sm text-gray-500">{assignment.description || 'Không có mô tả'}</p>
              <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded bg-gray-50 p-2"><dt className="text-gray-500">Điểm</dt><dd className="font-semibold">{assignment.max_score ?? 0}</dd></div>
                <div className="rounded bg-gray-50 p-2"><dt className="text-gray-500">Phiên bản</dt><dd className="font-semibold">{assignment.content_version}</dd></div>
                <div className="rounded bg-gray-50 p-2"><dt className="text-gray-500">Đã giao</dt><dd className="font-semibold">{assignment.delivery_count ?? 0}</dd></div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-3 text-sm">
                <Link className="font-medium text-[#2563EB] hover:underline" to={`/assignments/${assignment.id}/edit`}>Chỉnh sửa</Link>
                <button className="font-medium text-[#2563EB] hover:underline" type="button" onClick={() => setDeliveryAssignment(assignment)}>Giao bài</button>
                <button className="font-medium text-gray-600 hover:underline" type="button" onClick={() => setListAssignment(assignment)}>Các lớp đã giao</button>
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
        />
      )}
      {listAssignment && (
        <AssignmentDeliveryList
          assignment={listAssignment}
          open
          onClose={() => setListAssignment(null)}
        />
      )}
    </div>
  );
};

export default AssignmentLibrary;
