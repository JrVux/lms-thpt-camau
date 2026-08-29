import { useState, useEffect, useCallback } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import QuickSearch from './QuickSearch';
import {
  GraduationCap, Users, Home, Search, Moon, Sun,
  LogOut, ChevronDown, Menu, X, Trophy, BarChart3, RefreshCw, Library, FileCode2, Code2, FileText, FileCheck,
} from 'lucide-react';

const APP_NAME = 'LMS THPT';
const APP_VERSION = 'v1.0.0';

const teacherMenu = [
  {
    label: 'Lớp của tôi',
    subtitle: 'Quản lý lớp & học sinh',
    path: '/classes',
    icon: Users,
    section: 'Quản lý',
  },
  {
    label: 'Kho bài tập',
    subtitle: 'Tất cả bài tập',
    path: '/assignments',
    icon: Library,
    section: 'Quản lý',
  },
  {
    label: 'Bài tập Thực hành',
    subtitle: 'Bài nộp file sản phẩm',
    path: '/assignments?type=practice_file',
    icon: FileCheck,
    section: 'Quản lý',
  },
  {
    label: 'Bài tập Tự luận',
    subtitle: 'Bài tự luận nộp file',
    path: '/assignments?type=essay',
    icon: FileText,
    section: 'Quản lý',
  },
];

const studentMenu = [
  {
    label: 'Lớp học',
    subtitle: 'Các lớp đã tham gia',
    path: '/classes',
    icon: Home,
    section: 'Học tập',
  },
  {
    label: 'Bài tập của tôi',
    subtitle: 'Tất cả bài tập được giao',
    path: '/assignments',
    icon: FileCode2,
    section: 'Học tập',
  },
  {
    label: 'Bài tập Thực hành',
    subtitle: 'Bài thực hành nộp file',
    path: '/assignments?type=practice_file',
    icon: FileCheck,
    section: 'Học tập',
  },
  {
    label: 'Bài tập Tự luận',
    subtitle: 'Bài tự luận nộp file',
    path: '/assignments?type=essay',
    icon: FileText,
    section: 'Học tập',
  },
];

const Logo = () => (
  <div className="flex items-center gap-3">
    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white shadow-sm">
      <GraduationCap className="h-5 w-5" />
    </div>
    <div className="flex flex-col leading-tight">
      <span className="text-[15px] font-semibold tracking-tight">{APP_NAME}</span>
      <span className="text-xs text-gray-400">{APP_VERSION}</span>
    </div>
  </div>
);

const palette = {
  red: { bg: 'bg-badge-red-bg', text: 'text-badge-red-text' },
  green: { bg: 'bg-badge-green-bg', text: 'text-badge-green-text' },
  blue: { bg: 'bg-badge-blue-bg', text: 'text-badge-blue-text' },
  purple: { bg: 'bg-badge-purple-bg', text: 'text-badge-purple-text' },
  orange: { bg: 'bg-badge-orange-bg', text: 'text-badge-orange-text' },
};

const StatCard = ({ icon: Icon, label, value, color = 'blue' }) => {
  const { bg, text } = palette[color];
  return (
    <div className="rounded-lg bg-gray-50/80 px-3 py-2.5 transition-colors hover:bg-gray-100 dark:bg-white/5 dark:hover:bg-white/10">
      <div className="flex items-center gap-2">
        <span className={`flex h-6 w-6 items-center justify-center rounded-md ${bg} ${text}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <p className="text-lg font-semibold leading-none">{value}</p>
      </div>
      <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  );
};

const TopRankCard = ({ rank, name, score }) => {
  const colors = ['text-brand', 'text-amber-400', 'text-gray-400'];
  const medals = ['🥇', '🥈', '🥉'];
  return (
    <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-gray-100 dark:hover:bg-white/10">
      <span className="text-sm">{medals[rank]}</span>
      <span className="flex-1 truncate text-xs font-medium text-gray-700 dark:text-gray-300">{name}</span>
      <span className="text-xs font-semibold text-brand">{score}đ</span>
    </div>
  );
};

const Layout = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [stats, setStats] = useState(null);
  const [topRank, setTopRank] = useState(null);
  const [dark, setDark] = useState(false);
  const [langDropdown, setLangDropdown] = useState(false);

  const fetchStats = useCallback(() => {
    if (!user) return;
    api.get('/api/stats').then(({ data }) => setStats(data)).catch(() => {});
  }, [user]);

  const fetchTopRank = useCallback(() => {
    if (!user || user.role !== 'teacher') return;
    api.get('/api/stats/top-rank').then(({ data }) => setTopRank(data)).catch(() => {});
  }, [user]);

  useEffect(() => {
    fetchStats();
    fetchTopRank();
    const interval = setInterval(() => {
      fetchStats();
      fetchTopRank();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchStats, fetchTopRank]);

  useEffect(() => {
    setDark(localStorage.getItem('theme') === 'dark');
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  const baseMenu = user?.role === 'teacher' ? teacherMenu : studentMenu;
  const menu = [...baseMenu].map((item) => ({
    ...item,
    section: item.section || 'Chính',
  }));

  // page meta for header breadcrumb
  const currentPath = location.pathname;
  const currentItem = menu.find(
    (item) =>
      currentPath === item.path ||
      (item.path === '/classes' && currentPath.startsWith('/classes')) ||
      (item.path === '/assignments' && (currentPath.startsWith('/assignments') || currentPath.includes('-practice') || currentPath.includes('-editor')))
  );

  const pageMeta = currentItem
    ? { title: currentItem.label, subtitle: currentItem.subtitle }
    : { title: 'LMS THPT', subtitle: 'Quản lý lớp học' };

  const sections = [...new Set(menu.map((item) => item.section))];

  return (
    <div className="min-h-screen bg-page dark:bg-zinc-950">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[280px] flex-col border-r border-brand-border bg-white transition-transform duration-200 dark:border-white/10 dark:bg-zinc-900 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex h-16 flex-shrink-0 items-center justify-between px-5">
          <Logo />
          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search */}
        <QuickSearch onSelectResult={() => setSidebarOpen(false)} />

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto pb-4 scrollbar-thin">
          {sections.map((section) => (
            <div key={section} className="mb-1">
              <p className="px-5 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                {section}
              </p>
              {menu
                .filter((item) => item.section === section)
                .map((item) => {
                  const currentFull = location.pathname + location.search;
                  const isActive = item.path.includes('?')
                    ? currentFull === item.path
                    : location.pathname === item.path && !location.search;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={
                        `relative mx-3 flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                          isActive ? 'bg-brand-light dark:bg-brand/15' : 'hover:bg-gray-50 dark:hover:bg-white/5'
                        }`
                      }
                      onClick={() => setSidebarOpen(false)}
                    >
                      {isActive && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-brand" />}
                      <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${isActive ? 'bg-white text-brand dark:bg-brand/20' : 'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400'}`}>
                        <item.icon className="h-4 w-4" />
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className={`text-sm font-medium ${isActive ? 'text-brand' : 'text-gray-700 dark:text-gray-300'}`}>
                          {item.label}
                        </span>
                        <span className="truncate text-xs text-gray-400 dark:text-gray-500">{item.subtitle}</span>
                      </span>
                    </NavLink>
                  );
                })}
            </div>
          ))}

          {/* Stats */}
          {stats && (
            <div className="mt-2 px-4">
              <p className="px-1 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                Thống kê
              </p>
              <div className="space-y-2">
                {user?.role === 'teacher' ? (
                  <>
                    <StatCard icon={Users} color="blue" label="Số lớp đang quản lý" value={stats.total_classes} />
                    <StatCard
                      icon={FileCode2}
                      color="purple"
                      label="Tổng bài tập"
                      value={stats.total_assignments}
                    />
                  </>
                ) : (
                  <>
                    <StatCard icon={Home} color="blue" label="Lớp học" value={stats.total_classes} />
                    <StatCard
                      icon={BarChart3}
                      color="green"
                      label="Bài đã làm"
                      value={`${stats.completed_assignments ?? 0}/${stats.total_assignments}`}
                    />
                  </>
                )}
              </div>
            </div>
          )}

          {/* Top rank */}
          {topRank && (
            <div className="mt-3 px-4">
              <p className="flex items-center gap-1.5 px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                <Trophy className="h-3.5 w-3.5" /> Xếp hạng
                <button onClick={fetchTopRank} className="ml-auto rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-brand" title="Làm mới">
                  <RefreshCw className="h-3 w-3" />
                </button>
              </p>
              {['10', '11', '12'].map((g) => {
                const students = topRank[g] || [];
                if (students.length === 0) return null;
                const gradeLabel = { 10: 'Python', 11: 'SQL', 12: 'HTML' }[g];
                return (
                  <div key={g} className="mb-2 space-y-1">
                    <p className="px-1 text-[10px] font-medium uppercase text-gray-400">
                      Khối {g} · {gradeLabel}
                    </p>
                    {students.map((s, i) => (
                      <TopRankCard key={s.userId} rank={i} name={s.name} score={s.totalScore} />
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </nav>

        {/* Footer status */}
        <div className="flex-shrink-0 border-t border-brand-border p-4 dark:border-white/10">
          <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500 dark:bg-white/5 dark:text-gray-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
            Hệ thống đang hoạt động
          </div>
          <div className="mt-3 text-center text-[11px] text-gray-400 dark:text-gray-500">
            {user?.role === 'teacher' ? (
              <>
                <p>Giáo viên • Thanh Vũ - THPT Cà Mau</p>
                <p className="mt-0.5">by KILO CODE & CODEX & OPENCODE</p>
              </>
            ) : (
              <p>Học sinh • {user?.full_name || user?.username}</p>
            )}
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-h-screen flex-col lg:pl-[280px] bg-page dark:bg-zinc-950">
        <header className="sticky top-0 z-20 flex h-16 flex-shrink-0 items-center justify-between border-b border-brand-border bg-card/90 px-4 backdrop-blur-md dark:border-white/10 dark:bg-zinc-950/80 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight">{pageMeta.title}</h1>
              <p className="truncate text-xs text-gray-400">{pageMeta.subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Command palette search */}
            <div className="hidden items-center gap-2 rounded-lg border border-brand-border bg-gray-50 px-3 py-1.5 text-gray-400 md:flex dark:border-white/10 dark:bg-white/5">
              <Search className="h-4 w-4" />
              <span className="text-sm">Điều hướng nhanh</span>
              <kbd className="rounded-md border border-gray-200 bg-white px-1.5 text-[10px] font-medium text-gray-400 dark:border-white/10 dark:bg-white/10">
                Ctrl+K
              </kbd>
            </div>

            {/* Language dropdown */}
            <div className="relative">
              <button
                onClick={() => setLangDropdown(!langDropdown)}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10"
              >
                <span className="text-sm">🇻🇳</span>
                <span className="hidden sm:inline">vi</span>
                <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
              </button>
              {langDropdown && (
                <div className="absolute right-0 top-full z-30 mt-1 w-44 rounded-xl border border-brand-border bg-white p-1 shadow-card animate-fade-in dark:border-white/10 dark:bg-zinc-900">
                  <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/10">
                    <span>🇻🇳</span> Tiếng Việt
                  </button>
                  <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/10">
                    <span>🇬🇧</span> English
                  </button>
                </div>
              )}
            </div>

            {/* Dark mode toggle */}
            <button
              onClick={() => setDark(!dark)}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10"
              aria-label="Đổi chế độ sáng tối"
            >
              {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>

            {/* Divider */}
            <span className="mx-1 hidden h-6 w-px bg-gray-200 sm:block dark:bg-white/10" />

            {/* User */}
            <div className="hidden items-center gap-2 sm:flex">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-light font-semibold text-brand dark:bg-brand/20">
                {(user?.full_name || 'U').charAt(0).toUpperCase()}
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-medium">{user?.full_name}</span>
                <span className="text-[11px] text-gray-400 dark:text-gray-500">
                  {user?.role === 'teacher' ? 'Giáo viên' : 'Học sinh'}
                </span>
              </div>
            </div>

            {/* Logout */}
            <button
              onClick={logout}
              className="ml-1 rounded-lg p-2 text-gray-500 transition-colors hover:bg-red-50 hover:text-brand dark:hover:bg-red-900/20"
              title="Đăng xuất"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;