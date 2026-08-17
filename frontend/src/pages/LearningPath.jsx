import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { BookOpen, CheckCircle, Circle, Play, Lock, GraduationCap, TrendingUp, ArrowRight } from 'lucide-react';

const STATUS_LABELS = { chua_hoc: 'Chưa học', dang_hoc: 'Đang học', da_xong: 'Đã xong' };
const STATUS_COLORS = { chua_hoc: 'text-gray-300', dang_hoc: 'text-amber-500', da_xong: 'text-green-500' };

const LearningPath = () => {
  const { user } = useAuth();
  const [nhanh, setNhanh] = useState('dai-tra');
  const [path, setPath] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchPath = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/api/python-assistant/learning-path', { params: { nhanh } });
      setPath(res.data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải lộ trình học');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPath();
  }, [nhanh]);

  const updateStatus = async (chuDeId, trangThai) => {
    try {
      await api.post('/api/python-assistant/learning-path/progress', {
        chu_de_id: chuDeId,
        trang_thai: trangThai,
      });
      setPath(prev => prev.map(p => p.id === chuDeId ? { ...p, trang_thai: trangThai } : p));
    } catch (err) {
      console.error(err);
    }
  };

  const completedCount = path.filter(p => p.trang_thai === 'da_xong').length;
  const totalCount = path.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  if (loading) return <div className="text-center py-10 text-brand-muted">Đang tải lộ trình học...</div>;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-brand-heading flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-brand" /> Lộ trình học
          </h2>
          <p className="text-sm text-brand-muted">Theo dõi tiến độ học Python của bạn</p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <button onClick={() => setNhanh('dai-tra')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${nhanh === 'dai-tra' ? 'bg-white text-brand shadow-sm' : 'text-gray-500'}`}>
            <GraduationCap className="h-3.5 w-3.5 inline mr-1" />Đại trà
          </button>
          <button onClick={() => setNhanh('hsg')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${nhanh === 'hsg' ? 'bg-white text-brand shadow-sm' : 'text-gray-500'}`}>
            <BookOpen className="h-3.5 w-3.5 inline mr-1" />HSG
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-6 p-4 bg-white dark:bg-zinc-800/50 rounded-2xl border border-brand-border shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-brand-heading">Tiến độ tổng thể</span>
          <span className="text-sm font-semibold text-brand">{completedCount}/{totalCount} bài</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-zinc-700 rounded-full h-2.5">
          <div className="h-2.5 rounded-full bg-gradient-to-r from-brand to-amber-500 transition-all duration-500"
            style={{ width: `${progressPct}%` }} />
        </div>
        <p className="text-xs text-brand-muted mt-2">{progressPct}% hoàn thành</p>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-xl text-sm">{error}</div>}

      {/* Timeline */}
      <div className="relative space-y-0">
        {path.length === 0 && (
          <div className="text-center py-10 text-brand-muted">Chưa có dữ liệu lộ trình cho nhánh này</div>
        )}
        {path.map((node, i) => {
          const isPrereqMet = !node.chu_de_tien_quyet || path.find(p => p.id === node.chu_de_tien_quyet)?.trang_thai === 'da_xong';
          return (
            <div key={node.id} className="relative flex gap-4 pb-6">
              {/* Timeline line */}
              {i < path.length - 1 && (
                <div className="absolute left-[15px] top-8 bottom-0 w-0.5 bg-gray-200 dark:bg-zinc-700" />
              )}
              {/* Status icon */}
              <div className="relative flex-shrink-0">
                {node.trang_thai === 'da_xong' ? (
                  <CheckCircle className="h-7 w-7 text-green-500" />
                ) : node.trang_thai === 'dang_hoc' ? (
                  <Play className="h-7 w-7 text-amber-500 fill-amber-500" />
                ) : !isPrereqMet ? (
                  <Lock className="h-7 w-7 text-gray-300" />
                ) : (
                  <Circle className="h-7 w-7 text-gray-300" />
                )}
              </div>
              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="bg-white dark:bg-zinc-800/50 rounded-xl border border-brand-border p-4 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-brand-heading">{node.ten_chu_de}</h3>
                      {node.ma_bai && <p className="text-xs text-brand-muted">{node.ma_bai}</p>}
                      {node.mo_ta_ngan && <p className="text-xs text-gray-500 mt-1">{node.mo_ta_ngan}</p>}
                    </div>
                    <span className={`flex-shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[node.trang_thai]} bg-opacity-10`}>
                      {STATUS_LABELS[node.trang_thai]}
                    </span>
                  </div>
                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-3">
                    {user?.role === 'student' && (
                      <>
                        {node.trang_thai === 'chua_hoc' && (
                          <button onClick={() => updateStatus(node.id, 'dang_hoc')}
                            disabled={!isPrereqMet}
                            className="text-xs px-3 py-1 rounded-lg bg-brand text-white hover:bg-red-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed">
                            Bắt đầu học
                          </button>
                        )}
                        {node.trang_thai === 'dang_hoc' && (
                          <button onClick={() => updateStatus(node.id, 'da_xong')}
                            className="text-xs px-3 py-1 rounded-lg bg-green-500 text-white hover:bg-green-600">
                            Đánh dấu hoàn thành
                          </button>
                        )}
                        {node.trang_thai === 'da_xong' && (
                          <button onClick={() => updateStatus(node.id, 'dang_hoc')}
                            className="text-xs px-3 py-1 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200">
                            Ôn tập lại
                          </button>
                        )}
                      </>
                    )}
                    {node.visualizer_route && (
                      <a href={node.visualizer_route}
                        className="text-xs px-3 py-1 rounded-lg border border-brand-border text-brand-muted hover:text-brand hover:border-brand">
                        Xem trực quan <ArrowRight className="h-3 w-3 inline" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LearningPath;