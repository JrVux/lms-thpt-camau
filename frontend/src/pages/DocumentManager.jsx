import { useState, useEffect } from 'react';
import api from '../services/api';
import { Upload, FileText, Search, Filter, CheckCircle, AlertCircle, Clock, X } from 'lucide-react';

const STATUS_BADGES = {
  cho_xu_ly: { label: 'Chờ xử lý', class: 'bg-yellow-100 text-yellow-700' },
  da_xu_ly: { label: 'Đã xử lý', class: 'bg-green-100 text-green-700' },
  loi: { label: 'Lỗi', class: 'bg-red-100 text-red-700' },
};

const DocumentManager = () => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterNhanh, setFilterNhanh] = useState('');
  const [filterTrangThai, setFilterTrangThai] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    ten_file: '', noi_dung: '', chuyen_de: '', nhanh: 'dai-tra', loai: 'ly-thuyet', muc_do: 'CB',
  });
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);

  const fetchDocs = async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (filterNhanh) params.nhanh = filterNhanh;
      if (filterTrangThai) params.trang_thai = filterTrangThai;
      const res = await api.get('/api/python-assistant/documents', { params });
      setDocuments(res.data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải danh sách tài liệu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocs();
  }, [filterNhanh, filterTrangThai]);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!uploadForm.ten_file || !uploadForm.noi_dung || !uploadForm.chuyen_de) return;
    setUploading(true);
    setError('');
    try {
      let body = { ...uploadForm };

      // Nếu có file, đọc và gửi base64
      if (selectedFile) {
        const buffer = await selectedFile.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        body.file_buffer = btoa(binary);
        body.file_mime = selectedFile.type || 'application/octet-stream';
        body.ten_file = selectedFile.name;
        // Nếu upload file, nội dung text lấy từ file (hoặc để backend tự extract)
      }

      await api.post('/api/python-assistant/documents/upload', body);
      setShowUpload(false);
      setSelectedFile(null);
      setUploadForm({ ten_file: '', noi_dung: '', chuyen_de: '', nhanh: 'dai-tra', loai: 'ly-thuyet', muc_do: 'CB' });
      fetchDocs();
    } catch (err) {
      setError(err.response?.data?.message || 'Upload thất bại');
    } finally {
      setUploading(false);
    }
  };

  const viewDoc = async (id) => {
    try {
      const res = await api.get(`/api/python-assistant/documents/${id}`);
      setPreview(res.data.data);
    } catch (err) {
      setError('Không thể xem chi tiết');
    }
  };

  const chunkCounts = documents.reduce((acc, d) => {
    acc[d.ten_file] = (acc[d.ten_file] || 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-brand-heading flex items-center gap-2">
            <FileText className="h-5 w-5 text-brand" /> Quản lý tài liệu
          </h2>
          <p className="text-sm text-brand-muted">Tải lên và quản lý tài liệu học tập cho Trợ lý Python</p>
        </div>
        <button onClick={() => setShowUpload(true)}
          className="px-4 py-2 bg-brand text-white rounded-xl hover:bg-red-700 text-sm font-medium flex items-center gap-2">
          <Upload className="h-4 w-4" /> Tải lên
        </button>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-xl text-sm flex items-center gap-2">{error}</div>}

      {/* Filters */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-brand-muted">
          <Filter className="h-4 w-4" /> Lọc:
        </div>
        <select value={filterNhanh} onChange={(e) => setFilterNhanh(e.target.value)}
          className="px-3 py-1.5 border border-brand-border rounded-lg text-sm outline-none">
          <option value="">Tất cả nhánh</option>
          <option value="dai-tra">Đại trà</option>
          <option value="hsg">HSG</option>
        </select>
        <select value={filterTrangThai} onChange={(e) => setFilterTrangThai(e.target.value)}
          className="px-3 py-1.5 border border-brand-border rounded-lg text-sm outline-none">
          <option value="">Tất cả trạng thái</option>
          <option value="cho_xu_ly">Chờ xử lý</option>
          <option value="da_xu_ly">Đã xử lý</option>
          <option value="loi">Lỗi</option>
        </select>
        <span className="text-xs text-brand-muted">{documents.length} chunk</span>
      </div>

      {/* Upload form */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-zinc-900 p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-brand-heading">Tải lên tài liệu</h3>
              <button onClick={() => setShowUpload(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>
            <form onSubmit={handleUpload} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-brand-muted mb-1">Chọn file (PDF, DOCX, TXT) hoặc nhập text bên dưới</label>
                <input type="file" accept=".pdf,.docx,.doc,.txt,.md" onChange={(e) => {
                  const file = e.target.files?.[0];
                  setSelectedFile(file || null);
                  if (file) setUploadForm({ ...uploadForm, ten_file: file.name });
                }}
                  className="w-full text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-brand file:text-white file:text-sm file:cursor-pointer hover:file:bg-red-700" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium text-brand-muted mb-1">Nhánh</label>
                  <select value={uploadForm.nhanh} onChange={(e) => setUploadForm({ ...uploadForm, nhanh: e.target.value })}
                    className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm outline-none">
                    <option value="dai-tra">Đại trà</option>
                    <option value="hsg">HSG</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-brand-muted mb-1">Loại</label>
                  <select value={uploadForm.loai} onChange={(e) => setUploadForm({ ...uploadForm, loai: e.target.value })}
                    className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm outline-none">
                    <option value="ly-thuyet">Lý thuyết</option>
                    <option value="bai-tap">Bài tập</option>
                    <option value="de-thi">Đề thi</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-brand-muted mb-1">Mức độ</label>
                  <select value={uploadForm.muc_do} onChange={(e) => setUploadForm({ ...uploadForm, muc_do: e.target.value })}
                    className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm outline-none">
                    <option value="CB">Cơ bản</option>
                    <option value="TB">Trung bình</option>
                    <option value="NC">Nâng cao</option>
                    <option value="HSG">HSG</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-muted mb-1">Chuyên đề</label>
                <input value={uploadForm.chuyen_de} onChange={(e) => setUploadForm({ ...uploadForm, chuyen_de: e.target.value })}
                  className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand/20"
                  placeholder="vd: bai-20-cau-lenh-lap-for" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-muted mb-1">Nội dung</label>
                <textarea value={uploadForm.noi_dung} onChange={(e) => setUploadForm({ ...uploadForm, noi_dung: e.target.value })}
                  rows={8}
                  className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm font-mono outline-none focus:ring-2 focus:ring-brand/20 resize-none"
                  placeholder="Nhập nội dung tài liệu (sẽ được tự động chunk)" required />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" disabled={uploading}
                  className="flex-1 py-2 bg-brand text-white rounded-lg hover:bg-red-700 disabled:bg-red-300 text-sm font-medium">
                  {uploading ? 'Đang tải lên...' : 'Tải lên'}
                </button>
                <button type="button" onClick={() => setShowUpload(false)}
                  className="px-4 py-2 border border-brand-border rounded-lg text-sm text-brand-body hover:bg-gray-50">
                  Hủy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Preview */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl max-h-[80vh] rounded-2xl bg-white dark:bg-zinc-900 p-6 shadow-xl overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-brand-heading">{preview.ten_file}</h3>
              <button onClick={() => setPreview(null)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <p><span className="text-brand-muted">Chuyên đề:</span> {preview.chuyen_de}</p>
              <p><span className="text-brand-muted">Nhánh:</span> {preview.nhanh}</p>
              <p><span className="text-brand-muted">Loại:</span> {preview.loai}</p>
              <p><span className="text-brand-muted">Mức độ:</span> {preview.muc_do || 'N/A'}</p>
              <p><span className="text-brand-muted">Chunk thứ:</span> {preview.thu_tu_chunk}</p>
              <div className="mt-3 p-3 bg-gray-50 dark:bg-zinc-800 rounded-lg text-xs font-mono whitespace-pre-wrap max-h-60 overflow-y-auto">
                {preview.noi_dung}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Document list */}
      {loading ? (
        <div className="text-center py-10 text-brand-muted">Đang tải...</div>
      ) : documents.length === 0 ? (
        <div className="text-center py-10 text-brand-muted">Chưa có tài liệu nào. Hãy tải lên tài liệu đầu tiên!</div>
      ) : (
        <div className="space-y-2">
          {Object.entries(chunkCounts).map(([fileName, count]) => {
            const fileDocs = documents.filter(d => d.ten_file === fileName);
            const firstDoc = fileDocs[0];
            const statusCounts = fileDocs.reduce((acc, d) => {
              acc[d.trang_thai] = (acc[d.trang_thai] || 0) + 1;
              return acc;
            }, {});
            return (
              <div key={fileName} className="bg-white dark:bg-zinc-800/50 rounded-xl border border-brand-border p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="h-5 w-5 text-brand-muted flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-brand-heading truncate">{fileName}</p>
                      <p className="text-xs text-brand-muted">
                        {firstDoc.chuyen_de} · {firstDoc.nhanh === 'hsg' ? 'HSG' : 'Đại trà'} · {firstDoc.loai}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-xs text-gray-400">{count} chunks</span>
                    <div className="flex gap-1">
                      {statusCounts['da_xu_ly'] > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">{statusCounts['da_xu_ly']} ✓</span>}
                      {statusCounts['cho_xu_ly'] > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">{statusCounts['cho_xu_ly']} ⏳</span>}
                      {statusCounts['loi'] > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">{statusCounts['loi']} ✗</span>}
                    </div>
                    <button onClick={() => viewDoc(firstDoc.id)}
                      className="text-xs text-brand hover:text-red-700 font-medium">
                      Chi tiết
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default DocumentManager;