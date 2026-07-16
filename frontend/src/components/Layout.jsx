import { useState, useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import api from '../services/api';

const teacherMenu = [
  { label: 'Lớp của tôi', path: '/classes' },
];

const studentMenu = [
  { label: 'Lớp học', path: '/classes' },
];

const StatCard = ({ label, value, sub }) => (
  <div className="bg-white/10 rounded-lg px-3 py-2 text-center">
    <p className="text-2xl font-bold">{value}</p>
    <p className="text-xs text-blue-200 mt-0.5">{label}</p>
    {sub && <p className="text-[10px] text-blue-300 mt-0.5">{sub}</p>}
  </div>
);

const TopRankCard = ({ rank, name, score }) => {
  const colors = ['text-yellow-300', 'text-gray-300', 'text-orange-300'];
  const medals = ['🥇', '🥈', '🥉'];
  return (
    <div className="flex items-center gap-2 bg-white/5 rounded px-2 py-1.5">
      <span className="text-sm">{medals[rank]}</span>
      <span className="text-xs text-white truncate flex-1">{name}</span>
      <span className="text-xs text-blue-200 font-medium">{score}đ</span>
    </div>
  );
};

const Layout = () => {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [stats, setStats] = useState(null);
  const [topRank, setTopRank] = useState(null);

  useEffect(() => {
    if (!user) return;
    api.get('/api/stats').then(({ data }) => setStats(data)).catch(() => {});
    if (user.role === 'teacher') {
      api.get('/api/stats/top-rank').then(({ data }) => setTopRank(data)).catch(() => {});
    }
  }, [user]);

  const menu = user?.role === 'teacher' ? teacherMenu : studentMenu;

  return (
    <div className="min-h-screen flex bg-gray-50">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-30 w-64 bg-[#2563EB] text-white transform transition-transform duration-200 flex flex-col ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex items-center justify-between h-16 px-6 border-b border-blue-400 flex-shrink-0">
          <span className="text-xl font-bold">LMS THPT CÀ MAU</span>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 rounded hover:bg-blue-400"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <nav className="p-4 space-y-1">
            {menu.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/classes' || item.path === '/my-classes'}
                className={({ isActive }) =>
                  `block px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-white text-[#2563EB]'
                      : 'text-blue-100 hover:bg-blue-400 hover:text-white'
                  }`
                }
                onClick={() => setSidebarOpen(false)}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Stats */}
          {stats && (
            <div className="px-4 mt-2 space-y-2">
              <p className="text-xs text-blue-200 uppercase tracking-wide font-medium px-1">Thống kê</p>
              {user?.role === 'teacher' ? (
                <>
                  <StatCard label="Lớp học" value={stats.total_classes} />
                  <StatCard label="Bài tập" value={stats.total_assignments}
                    sub={`Py ${stats.assignments_by_grade?.[10] || 0} • SQL ${stats.assignments_by_grade?.[11] || 0} • HTML ${stats.assignments_by_grade?.[12] || 0}`} />
                </>
              ) : (
                <>
                  <StatCard label="Lớp học" value={stats.total_classes} />
                  <StatCard label="Bài tập đã làm" value={`${stats.completed_assignments}/${stats.total_assignments}`} />
                </>
              )}
            </div>
          )}

          {/* Top Rank */}
          {topRank && (
            <div className="px-4 mt-3 space-y-2">
              <p className="text-xs text-yellow-300 uppercase tracking-wide font-medium px-1 flex items-center gap-1">
                <span>🏆</span> Top Rank
              </p>
              {['10', '11', '12'].map((g) => {
                const students = topRank[g] || [];
                if (students.length === 0) return null;
                const gradeLabel = { 10: 'Python', 11: 'SQL', 12: 'HTML' }[g];
                return (
                  <div key={g} className="space-y-1">
                    <p className="text-[10px] text-blue-300 font-medium px-1">Khối {g} ({gradeLabel})</p>
                    {students.map((s, i) => (
                      <TopRankCard key={s.userId} rank={i} name={s.name} score={s.totalScore} />
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-auto p-4 border-t border-blue-400 text-center">
          <p className="text-[11px] text-blue-200">Thanh Vũ - THPT Cà Mau</p>
          <p className="text-[10px] text-blue-300">By OPENCODE</p>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-h-screen">
        <header className="h-16 bg-white border-b flex items-center justify-between px-4 lg:px-8 sticky top-0 z-10">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded hover:bg-gray-100"
          >
            <Bars3Icon className="w-6 h-6 text-gray-600" />
          </button>

          <div className="ml-auto flex items-center gap-4">
            <span className="text-sm text-gray-600">
              Xin chào, <span className="font-semibold">{user?.full_name}</span>
            </span>
            <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700 capitalize">
              {user?.role === 'teacher' ? 'Giáo viên' : 'Học sinh'}
            </span>
            <button
              onClick={logout}
              className="text-sm text-red-500 hover:text-red-700 font-medium"
            >
              Đăng xuất
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
