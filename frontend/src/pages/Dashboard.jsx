import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import Badge from '../components/Badge';
import Button from '../components/Button';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner';
import { Users, GraduationCap, UserPlus, Plus, ArrowRight } from 'lucide-react';

const TeacherDashboard = () => {
  const navigate = useNavigate();
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', grade: '10' });
  const [error, setError] = useState('');

  const fetchClasses = useCallback(async () => {
    try {
      const { data } = await api.get('/api/classes');
      setClasses(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Lấy danh sách lớp thất bại');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchClasses(); }, [fetchClasses]);

  const createClass = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Vui lòng nhập tên lớp'); return; }
    try {
      const { data } = await api.post('/api/classes', form);
      setClasses((prev) => [data, ...prev]);
      setShowModal(false);
      setForm({ name: '', grade: '10' });
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Tạo lớp thất bại');
    }
  };

  if (loading) return <LoadingSpinner text="Đang tải danh sách lớp..." />;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-brand-heading">Lớp của tôi</h1>
          <p className="mt-1 text-sm text-brand-muted">Quản lý học sinh và bài tập cho từng lớp</p>
        </div>
        <Button onClick={() => setShowModal(true)} icon={Plus}>Tạo lớp mới</Button>
      </div>

      {error && <div className="mb-4 rounded-lg bg-badge-red-bg p-3 text-sm text-badge-red-text">{error}</div>}

      {classes.length === 0 ? (
        <EmptyState
          icon={Users}
          color="blue"
          title="Bạn chưa có lớp học nào"
          description="Hãy tạo lớp mới để bắt đầu"
          action={<Button onClick={() => setShowModal(true)} icon={Plus}>Tạo lớp mới</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {classes.map((c) => (
            <div
              key={c.id}
              onClick={() => navigate(`/classes/${c.id}`)}
              className="group cursor-pointer rounded-2xl bg-card p-6 shadow-card ring-1 ring-brand-border transition-all hover:-translate-y-0.5 hover:shadow-card-hover"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-light text-brand">
                    <GraduationCap className="h-5 w-5" />
                  </span>
                  <h3 className="font-semibold tracking-tight text-brand-heading">{c.name}</h3>
                </div>
                <ArrowRight className="h-4 w-4 text-brand-muted opacity-0 transition-opacity group-hover:opacity-100" />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Badge color="blue">Khối {c.grade}</Badge>
                <Badge color={(c.subject === 'python' ? 'green' : c.subject === 'sql' ? 'purple' : 'orange')}>
                  {c.subject}
                </Badge>
              </div>

              <div className="mt-5 rounded-xl bg-page p-3 text-center">
                <p className="text-xs text-brand-muted mb-1">Mã lớp</p>
                <p className="text-2xl font-bold tracking-widest text-brand">{c.class_code}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Tạo lớp mới"
        subtitle="Lớp sẽ gắn với khối và chủ đề tương ứng">
        <form onSubmit={createClass} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-brand-heading">Tên lớp</label>
            <input
              type="text" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-brand-border px-4 py-2.5 outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
              placeholder="Ví dụ: 10A1"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-brand-heading">Khối lớp</label>
            <select
              value={form.grade}
              onChange={(e) => setForm({ ...form, grade: e.target.value })}
              className="w-full rounded-lg border border-brand-border px-4 py-2.5 outline-none focus:border-brand"
            >
              <option value="10">Khối 10 (Python)</option>
              <option value="11">Khối 11 (SQL)</option>
              <option value="12">Khối 12 (HTML)</option>
            </select>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setShowModal(false)}>Hủy</Button>
            <Button type="submit" className="flex-1">Tạo lớp</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

const StudentDashboard = () => {
  const navigate = useNavigate();
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [classCode, setClassCode] = useState('');
  const [error, setError] = useState('');

  const fetchClasses = useCallback(async () => {
    try {
      const [{ data }, { data: deliveries }] = await Promise.all([
        api.get('/api/classes'),
        api.get('/api/my-assignments'),
      ]);
      const enriched = data.map((classItem) => {
        const classDeliveries = deliveries.filter((delivery) => delivery.class_id === classItem.id);
        return {
          ...classItem,
          total: classDeliveries.length,
          done: classDeliveries.filter((delivery) => (delivery.submissions ?? []).length > 0).length,
        };
      });
      setClasses(enriched);
    } catch (err) {
      setError(err.response?.data?.message || 'Lấy danh sách lớp thất bại');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchClasses(); }, [fetchClasses]);

  const joinClass = async (e) => {
    e.preventDefault();
    if (!classCode.trim()) { setError('Vui lòng nhập mã lớp'); return; }
    try {
      await api.post('/api/classes/join', { class_code: classCode });
      await fetchClasses();
      setShowModal(false);
      setClassCode('');
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Tham gia lớp thất bại');
    }
  };

  if (loading) return <LoadingSpinner text="Đang tải danh sách lớp..." />;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-brand-heading">Lớp học của tôi</h1>
          <p className="mt-1 text-sm text-brand-muted">Các lớp bạn đang theo học và tiến độ bài tập</p>
        </div>
        <Button onClick={() => setShowModal(true)} icon={UserPlus}>Tham gia lớp</Button>
      </div>

      {error && <div className="mb-4 rounded-lg bg-badge-red-bg p-3 text-sm text-badge-red-text">{error}</div>}

      {classes.length === 0 ? (
        <EmptyState
          icon={Users}
          color="blue"
          title="Bạn chưa tham gia lớp học nào"
          description="Nhập mã lớp từ giáo viên để tham gia"
          action={<Button onClick={() => setShowModal(true)} icon={UserPlus}>Tham gia lớp</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {classes.map((c) => (
            <div
              key={c.id}
              onClick={() => navigate(`/classes/${c.id}`)}
              className="group cursor-pointer rounded-2xl bg-card p-6 shadow-card ring-1 ring-brand-border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-badge-green-bg text-badge-green-text">
                    <GraduationCap className="h-5 w-5" />
                  </span>
                  <h3 className="font-semibold tracking-tight text-brand-heading">{c.name}</h3>
                </div>
                <ArrowRight className="h-4 w-4 text-brand-muted opacity-0 transition-opacity group-hover:opacity-100" />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Badge color="blue">Khối {c.grade}</Badge>
                <Badge color={(c.grade === '10' ? 'green' : c.grade === '11' ? 'purple' : 'orange')}>
                  {c.subject}
                </Badge>
              </div>

              {c.total > 0 && (
                <div className="mt-5">
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span className="text-brand-muted">Bài tập</span>
                    <span className="font-medium text-brand-heading">{c.done}/{c.total} đã làm</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-100">
                    <div
                      className="h-2 rounded-full bg-green-500 transition-all"
                      style={{ width: `${Math.round((c.done / c.total) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
              {c.total === 0 && <p className="mt-5 text-sm text-brand-muted">Chưa có bài tập nào</p>}
            </div>
          ))}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Tham gia lớp học"
        subtitle="Nhập mã lớp 6 ký tự do giáo viên cung cấp">
        <form onSubmit={joinClass} className="space-y-6">
          <div>
            <label className="mb-1 block text-sm font-medium text-brand-heading">Mã lớp</label>
            <input
              type="text" value={classCode}
              onChange={(e) => setClassCode(e.target.value.toUpperCase())}
              className="w-full rounded-xl border border-brand-border px-4 py-3 text-center text-xl font-bold tracking-widest uppercase outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              placeholder="AB3X9K"
              maxLength={6}
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setShowModal(false)}>Hủy</Button>
            <Button type="submit" className="flex-1">Tham gia</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

const Dashboard = () => {
  const { user } = useAuth();
  return user?.role === 'teacher' ? <TeacherDashboard /> : <StudentDashboard />;
};

export default Dashboard;