import { useState, useEffect } from 'react';
import api from '../services/api';
import { CheckCircle, XCircle, Filter, Eye, BookOpen, GraduationCap, Loader2 } from 'lucide-react';

const ExerciseReview = () => {
  const [exercises, setExercises] = useState([]);
  const [exams, setExams] = useState([]);
  const [tab, setTab] = useState('exercises');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterNhanh, setFilterNhanh] = useState('');
  const [filterMucDo, setFilterMucDo] = useState('');
  const [preview, setPreview] = useState(null);

  const fetchPending = async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (filterNhanh) params.nhanh = filterNhanh;
      if (filterMucDo) params.muc_do = filterMucDo;
      const [exRes, examRes] = await Promise.all([
        api.get('/api/python-assistant/exercises/pending', { params }),
        api.get('/api/python-assistant/exams/pending'),
      ]);
      setExercises(exRes.data.data || []);
      setExams(examRes.data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải danh sách duyệt');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
  }, [filterNhanh, filterMucDo]);

  const handleReview = async (type, id, decision) => {
    setError('');
    try {
      const url = type === 'exercise'
        ? `/api/python-assistant/exercises/${id}/review`
        : `/api/python-assistant/exams/${id}/review`;
      await api.post(url, { decision });
      if (type === 'exercise') setExercises(prev => prev.filter(e => e.id !== id));
      else setExams(prev => prev.filter(e => e.id !== id));
    } catch (err) {
      setError(err.response?.data?.message || 'Duyệt thất bại');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-brand-heading flex items-center gap-2">
            <Eye className="h-5 w-5 text-brand" /> Duyệt bài tập AI
          </h2>
          <p className="text-sm text-brand-muted">Xem xét và duyệt bài tập, đề thi do AI sinh</p>
        </div>
        <button onClick={fetchPending} className="text-sm text-brand hover:text-red-700 font-medium">
          Làm mới
        </button>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-xl text-sm">{error}</div>}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-4 w-fit">
        <button onClick={() => setTab('exercises')}
          className={`px-4 py-1.5 rounded-md text-xs font-medium ${tab === 'exercises' ? 'bg-white text-brand shadow-sm' : 'text-gray-500'}`}>
          Bài tập chờ duyệt ({exercises.length})
        </button>
        <button onClick={() => setTab('exams')}
          className={`px-4 py-1.5 rounded-md text-xs font-medium ${tab === 'exams' ? 'bg-white text-brand shadow-sm' : 'text-gray-500'}`}>
          Đề thi chờ duyệt ({exams.length})
        </button>
      </div>

      {/* Filters */}
      {tab === 'exercises' && (
        <div className="mb-4 flex items-center gap-3">
          <Filter className="h-4 w-4 text-brand-muted" />
          <select value={filterNhanh} onChange={(e) => setFilterNhanh(e.target.value)}
            className="px-3 py-1.5 border border-brand-border rounded-lg text-sm outline-none">
            <option value="">Tất cả nhánh</option>
            <option value="dai-tra">Đại trà</option>
            <option value="hsg">HSG</option>
          </select>
          <select value={filterMucDo} onChange={(e) => setFilterMucDo(e.target.value)}
            className="px-3 py-1.5 border border-brand-border rounded-lg text-sm outline-none">
            <option value="">Tất cả mức</option>
            <option value="CB">Cơ bản</option>
            <option value="TB">Trung bình</option>
            <option value="NC">Nâng cao</option>
            <option value="HSG">HSG</option>
          </select>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="text-center py-10 text-brand-muted">Đang tải...</div>
      ) : tab === 'exercises' ? (
        exercises.length === 0 ? (
          <div className="text-center py-10 text-brand-muted">Không có bài tập nào chờ duyệt</div>
        ) : (
          <div className="space-y-3">
            {exercises.map((ex) => (
              <div key={ex.id} className="bg-white dark:bg-zinc-800/50 rounded-xl border border-brand-border p-4 shadow-sm">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${ex.muc_do === 'HSG' ? 'bg-purple-100 text-purple-700' : ex.muc_do === 'NC' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                        {ex.muc_do}
                      </span>
                      <span className="text-xs text-brand-muted">
                        {ex.chu_de_id?.ten_chu_de || 'Không có chủ đề'}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-brand-heading">
                      {ex.noi_dung?.title || 'Bài tập không tiêu đề'}
                    </h3>
                    {ex.noi_dung?.description && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{ex.noi_dung.description}</p>
                    )}
                  </div>
                  <span className="text-[10px] text-gray-400">{new Date(ex.created_at).toLocaleDateString('vi-VN')}</span>
                </div>

                {/* Preview button + actions */}
                <div className="flex items-center gap-2">
                  <button onClick={() => setPreview(ex)}
                    className="text-xs px-3 py-1 rounded-lg border border-brand-border text-brand-muted hover:text-brand">
                    Xem chi tiết
                  </button>
                  <div className="flex-1" />
                  <button onClick={() => handleReview('exercise', ex.id, 'tu_choi')}
                    className="text-xs px-3 py-1 rounded-lg border border-red-200 text-red-500 hover:bg-red-50">
                    <XCircle className="h-3 w-3 inline mr-1" />Từ chối
                  </button>
                  <button onClick={() => handleReview('exercise', ex.id, 'da_duyet')}
                    className="text-xs px-3 py-1 rounded-lg bg-green-500 text-white hover:bg-green-600">
                    <CheckCircle className="h-3 w-3 inline mr-1" />Duyệt
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        exams.length === 0 ? (
          <div className="text-center py-10 text-brand-muted">Không có đề thi nào chờ duyệt</div>
        ) : (
          <div className="space-y-3">
            {exams.map((ex) => (
              <div key={ex.id} className="bg-white dark:bg-zinc-800/50 rounded-xl border border-brand-border p-4 shadow-sm">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-brand-heading">{ex.ten_de}</h3>
                    <p className="text-xs text-brand-muted mt-1">
                      {ex.nhanh === 'hsg' ? 'HSG' : 'Đại trà'} · {ex.muc_do || 'N/A'} · {ex.nam_hoc || 'N/A'}
                      {ex.thoi_gian_lam_bai_phut && ` · ${ex.thoi_gian_lam_bai_phut} phút`}
                    </p>
                    {ex.danh_sach_bai_tap?.length > 0 && (
                      <p className="text-xs text-gray-400 mt-1">{ex.danh_sach_bai_tap.length} bài tập</p>
                    )}
                  </div>
                  <span className="text-[10px] text-gray-400">{new Date(ex.created_at).toLocaleDateString('vi-VN')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1" />
                  <button onClick={() => handleReview('exam', ex.id, 'tu_choi')}
                    className="text-xs px-3 py-1 rounded-lg border border-red-200 text-red-500 hover:bg-red-50">
                    <XCircle className="h-3 w-3 inline mr-1" />Từ chối
                  </button>
                  <button onClick={() => handleReview('exam', ex.id, 'da_duyet')}
                    className="text-xs px-3 py-1 rounded-lg bg-green-500 text-white hover:bg-green-600">
                    <CheckCircle className="h-3 w-3 inline mr-1" />Duyệt
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Preview modal */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl max-h-[80vh] rounded-2xl bg-white dark:bg-zinc-900 p-6 shadow-xl overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-brand-heading">{preview.noi_dung?.title || 'Chi tiết bài tập'}</h3>
              <button onClick={() => setPreview(null)} className="p-1 hover:bg-gray-100 rounded-lg">
                <XCircle className="h-5 w-5 text-gray-400" />
              </button>
            </div>
            <div className="space-y-4 text-sm">
              <div>
                <p className="text-brand-muted text-xs mb-1">Mô tả</p>
                <p className="text-gray-700">{preview.noi_dung?.description || 'Không có mô tả'}</p>
              </div>
              {preview.noi_dung?.code_mau && (
                <div>
                  <p className="text-brand-muted text-xs mb-1">Code mẫu</p>
                  <pre className="p-3 bg-gray-900 text-green-400 rounded-lg text-xs font-mono overflow-x-auto">{preview.noi_dung.code_mau}</pre>
                </div>
              )}
              {preview.noi_dung?.goi_y && (
                <div>
                  <p className="text-brand-muted text-xs mb-1">Gợi ý</p>
                  <p className="p-3 bg-yellow-50 rounded-lg text-xs">{preview.noi_dung.goi_y}</p>
                </div>
              )}
              {preview.noi_dung?.test_cases?.length > 0 && (
                <div>
                  <p className="text-brand-muted text-xs mb-1">Test cases ({preview.noi_dung.test_cases.length})</p>
                  {preview.noi_dung.test_cases.map((tc, i) => (
                    <div key={i} className="p-2 bg-gray-50 dark:bg-zinc-800 rounded-lg mb-1 text-xs font-mono">
                      <span className="text-gray-500">Input: </span>{tc.input || 'N/A'}
                      <span className="text-gray-500 ml-2">Expected: </span>{tc.expected || 'N/A'}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExerciseReview;