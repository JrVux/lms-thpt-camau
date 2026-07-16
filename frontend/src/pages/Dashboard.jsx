import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

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

  if (loading) return <div className="text-center py-10 text-gray-500">Đang tải...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Lớp của tôi</h1>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-[#2563EB] text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
        >
          + Tạo lớp mới
        </button>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>}

      {classes.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">Bạn chưa có lớp học nào</p>
          <p className="text-sm mt-1">Hãy tạo lớp mới để bắt đầu</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {classes.map((c) => (
            <div
              key={c.id}
              onClick={() => navigate(`/classes/${c.id}`)}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow cursor-pointer"
            >
              <h3 className="text-lg font-semibold text-gray-800">{c.name}</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                  Khối {c.grade}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs font-medium uppercase">
                  {c.subject}
                </span>
              </div>
              <div className="mt-4 bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">Mã lớp</p>
                <p className="text-2xl font-bold tracking-widest text-[#2563EB]">{c.class_code}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-800 mb-4">Tạo lớp mới</h2>
            <form onSubmit={createClass} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tên lớp</label>
                <input
                  type="text" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                  placeholder="Ví dụ: 10A1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Khối lớp</label>
                <select
                  value={form.grade}
                  onChange={(e) => setForm({ ...form, grade: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                >
                  <option value="10">Khối 10 (Python)</option>
                  <option value="11">Khối 11 (SQL)</option>
                  <option value="12">Khối 12 (HTML)</option>
                </select>
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium text-sm">
                  Hủy
                </button>
                <button type="submit"
                  className="flex-1 py-2.5 bg-[#2563EB] text-white rounded-lg hover:bg-blue-700 font-medium text-sm">
                  Tạo lớp
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
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
      const { data } = await api.get('/api/classes');
      const enriched = await Promise.all(
        data.map(async (c) => {
          try {
            const { data: assignments } = await api.get(`/api/classes/${c.id}/assignments`);
            let done = 0;
            for (const a of assignments) {
              const { data: sub } = await api.get(`/api/submissions/my/${a.id}`);
              if (sub.data) done++;
            }
            return { ...c, total: assignments.length, done };
          } catch {
            return { ...c, total: 0, done: 0 };
          }
        })
      );
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

  if (loading) return <div className="text-center py-10 text-gray-500">Đang tải...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Lớp học của tôi</h1>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-[#2563EB] text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
        >
          + Tham gia lớp mới
        </button>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>}

      {classes.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">Bạn chưa tham gia lớp học nào</p>
          <p className="text-sm mt-1">Nhập mã lớp từ giáo viên để tham gia</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {classes.map((c) => (
            <div
              key={c.id}
              onClick={() => navigate(`/classes/${c.id}`)}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow cursor-pointer"
            >
              <h3 className="text-lg font-semibold text-gray-800">{c.name}</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                  Khối {c.grade}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs font-medium uppercase">
                  {c.subject}
                </span>
              </div>
              {c.total > 0 && (
                <div className="mt-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-500">Bài tập</span>
                    <span className="font-medium">{c.done}/{c.total} đã làm</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-green-500 h-2 rounded-full transition-all"
                      style={{ width: `${Math.round((c.done / c.total) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
              {c.total === 0 && <p className="mt-4 text-sm text-gray-400">Chưa có bài tập nào</p>}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-800 mb-4">Tham gia lớp học</h2>
            <form onSubmit={joinClass} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mã lớp</label>
                <input
                  type="text" value={classCode}
                  onChange={(e) => setClassCode(e.target.value.toUpperCase())}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] text-center text-xl font-bold tracking-widest uppercase"
                  placeholder="VD: AB3X9K"
                  maxLength={6}
                />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium text-sm">
                  Hủy
                </button>
                <button type="submit"
                  className="flex-1 py-2.5 bg-[#2563EB] text-white rounded-lg hover:bg-blue-700 font-medium text-sm">
                  Tham gia
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const Dashboard = () => {
  const { user } = useAuth();
  return user?.role === 'teacher' ? <TeacherDashboard /> : <StudentDashboard />;
};

export default Dashboard;
