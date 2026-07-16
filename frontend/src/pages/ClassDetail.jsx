import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

const TeacherTabs = ({ classId }) => {
  const [tab, setTab] = useState('students');
  const tabs = [
    { key: 'students', label: 'Học sinh' },
    { key: 'assignments', label: 'Bài tập' },
    { key: 'gradebook', label: 'Bảng điểm' },
  ];

  return (
    <div>
      <div className="flex border-b border-gray-200 mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-[#2563EB] text-[#2563EB]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'students' && <StudentTab classId={classId} />}
      {tab === 'assignments' && <AssignmentsTab classId={classId} />}
      {tab === 'gradebook' && <GradebookTab classId={classId} />}
    </div>
  );
};

const StudentTab = ({ classId }) => {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortDir, setSortDir] = useState('asc');

  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(null);
  const [showReset, setShowReset] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [form, setForm] = useState({ full_name: '', username: '', email: '', password: '' });
  const [importFile, setImportFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [showLookup, setShowLookup] = useState(false);
  const [lookupQuery, setLookupQuery] = useState('');
  const [lookupResults, setLookupResults] = useState([]);
  const [lookingUp, setLookingUp] = useState(false);
  const [enrolling, setEnrolling] = useState(null);
  const [showUnassigned, setShowUnassigned] = useState(false);
  const [unassignedStudents, setUnassignedStudents] = useState([]);
  const [allClasses, setAllClasses] = useState([]);
  const [assignClassMap, setAssignClassMap] = useState({});
  const [loadingUnassigned, setLoadingUnassigned] = useState(false);
  const [deletingStudent, setDeletingStudent] = useState(null);

  const loadStudents = useCallback(() => {
    setLoading(true);
    api.get(`/api/classes/${classId}/students`)
      .then(({ data }) => setStudents(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [classId]);

  useEffect(() => { loadStudents(); }, [loadStudents]);

  const filtered = students.filter((s) =>
    s.full_name.toLowerCase().includes(search.toLowerCase()) ||
    s.email.toLowerCase().includes(search.toLowerCase()) ||
    s.username.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    const cmp = a.full_name.localeCompare(b.full_name, 'vi');
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.full_name || !form.username || !form.password) {
      setErr('Vui lòng nhập đầy đủ thông tin');
      return;
    }
    if (form.password.length < 6) { setErr('Mật khẩu phải có ít nhất 6 ký tự'); return; }
    setSaving(true); setErr('');
    try {
      await api.post(`/api/classes/${classId}/students`, form);
      setShowAdd(false);
      setForm({ full_name: '', username: '', email: '', password: '' });
      loadStudents();
    } catch (e) { setErr(e.response?.data?.message || 'Lỗi'); }
    finally { setSaving(false); }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    if (!form.full_name || !form.username || !form.email) {
      setErr('Vui lòng nhập đầy đủ thông tin');
      return;
    }
    setSaving(true); setErr('');
    try {
      await api.patch(`/api/classes/${classId}/students/${showEdit}`, { full_name: form.full_name, email: form.email, username: form.username });
      setShowEdit(null);
      loadStudents();
    } catch (e) { setErr(e.response?.data?.message || 'Lỗi'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/api/classes/${classId}/students/${deleteTarget}`);
      setDeleteTarget(null);
      loadStudents();
    } catch (e) { alert(e.response?.data?.message || 'Lỗi'); }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    if (!form.password || form.password.length < 6) {
      setErr('Mật khẩu phải có ít nhất 6 ký tự');
      return;
    }
    setSaving(true); setErr('');
    try {
      await api.post(`/api/classes/${classId}/students/reset-password`, { user_id: showReset, new_password: form.password });
      setShowReset(null);
      setForm({ ...form, password: '' });
    } catch (e) { setErr(e.response?.data?.message || 'Lỗi'); }
    finally { setSaving(false); }
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true); setErr(''); setImportResult(null);
    try {
      const buf = await importFile.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws);
      if (rows.length === 0) { setErr('File không có dữ liệu'); setImporting(false); return; }
      const studentsList = rows.map((r) => ({
        full_name: (r['Họ tên'] || r['full_name'] || '').toString().trim(),
        username: (r['Tên đăng nhập'] || r['username'] || '').toString().trim(),
        password: (r['Mật khẩu'] || r['password'] || '123456').toString().trim(),
      }));
      const { data } = await api.post(`/api/classes/${classId}/students/bulk-import`, { students: studentsList });
      setImportResult(data);
      if (data.success > 0) loadStudents();
    } catch (e) { setErr(e.response?.data?.message || 'Đọc file thất bại'); }
    finally { setImporting(false); }
  };

  const handleLookup = async () => {
    if (lookupQuery.trim().length < 2) { setErr('Nhập ít nhất 2 ký tự'); return; }
    setLookingUp(true); setErr('');
    try {
      const { data } = await api.get(`/api/students/search?q=${encodeURIComponent(lookupQuery)}`);
      setLookupResults(data);
    } catch (e) { setErr(e.response?.data?.message || 'Lỗi tìm kiếm'); }
    finally { setLookingUp(false); }
  };

  const handleEnroll = async (userId) => {
    setEnrolling(userId);
    try {
      await api.post(`/api/classes/${classId}/students/enroll`, { user_id: userId });
      loadStudents();
      setLookupResults((prev) => prev.filter((s) => s.id !== userId));
    } catch (e) { alert(e.response?.data?.message || 'Lỗi'); }
    finally { setEnrolling(null); }
  };

  const handleAssignClass = async (userId) => {
    const classIdToAssign = assignClassMap[userId];
    if (!classIdToAssign) { alert('Chọn lớp trước'); return; }
    try {
      await api.post(`/api/classes/${classIdToAssign}/students/enroll`, { user_id: userId });
      setUnassignedStudents((prev) => prev.filter((s) => s.id !== userId));
    } catch (e) { alert(e.response?.data?.message || 'Lỗi'); }
  };

  const handleDeleteStudent = async (userId, fullName) => {
    if (!window.confirm(`Xóa tài khoản "${fullName}" khỏi hệ thống? Hành động này không thể hoàn tác.`)) return;
    setDeletingStudent(userId);
    try {
      await api.delete(`/api/students/${userId}`);
      setUnassignedStudents((prev) => prev.filter((s) => s.id !== userId));
    } catch (e) { alert(e.response?.data?.message || 'Lỗi'); }
    finally { setDeletingStudent(null); }
  };

  const editStudent = (s) => {
    setForm({ full_name: s.full_name, username: s.username, email: s.email, password: '' });
    setShowEdit(s.user_id);
    setErr('');
  };

  const resetStudent = (id) => {
    setForm({ ...form, password: '' });
    setShowReset(id);
    setErr('');
  };

  const modalBg = 'fixed inset-0 bg-black/40 flex items-center justify-center z-50';

  if (loading) return <div className="text-center py-8 text-gray-500">Đang tải...</div>;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <button onClick={() => { setShowAdd(true); setForm({ full_name: '', username: '', email: '', password: '' }); setErr(''); }}
            className="px-4 py-2 bg-[#2563EB] text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
            + Thêm HS
          </button>
          <button onClick={() => { setShowImport(true); setImportFile(null); setImportResult(null); setErr(''); }}
            className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm font-medium">
            Import Excel
          </button>
          <button onClick={() => { setShowLookup(true); setLookupQuery(''); setLookupResults([]); setErr(''); }}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium">
            Tra cứu HS
          </button>
          <button onClick={async () => {
            setShowUnassigned(true); setLoadingUnassigned(true); setErr('');
            try {
              const [{ data: students }, { data: classes }] = await Promise.all([
                api.get('/api/students/unassigned'),
                api.get('/api/classes'),
              ]);
              setUnassignedStudents(students);
              setAllClasses(classes);
              setAssignClassMap({});
            } catch (e) { setErr(e.response?.data?.message || 'Lỗi'); }
            finally { setLoadingUnassigned(false); }
          }} className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 text-sm font-medium">
            HS chưa có lớp
          </button>
        </div>
        <div className="flex items-center gap-2">
          <input
            placeholder="Tìm kiếm..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <button onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
            className="px-3 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            {sortDir === 'asc' ? 'A→Z' : 'Z→A'}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="text-left px-4 py-3 font-medium text-gray-600">STT</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Họ tên</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Username</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Bài đã nộp</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s, i) => (
              <tr key={s.user_id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-500">{i + 1}</td>
                <td className="px-4 py-3 font-medium text-gray-800">{s.full_name}</td>
                <td className="px-4 py-3 text-gray-500">{s.username}</td>
                <td className="px-4 py-3 text-gray-500">{s.email}</td>
                <td className="px-4 py-3 text-center">{s.submission_count}</td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <button onClick={() => editStudent(s)} className="px-2 py-1 text-xs rounded bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200">
                      Sửa
                    </button>
                    <button onClick={() => resetStudent(s.user_id)} className="px-2 py-1 text-xs rounded bg-yellow-50 text-yellow-600 hover:bg-yellow-100 border border-yellow-200">
                      MKM
                    </button>
                    <button onClick={() => setDeleteTarget(s.user_id)} className="px-2 py-1 text-xs rounded bg-red-50 text-red-600 hover:bg-red-100 border border-red-200">
                      Rời lớp
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Chưa có học sinh</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal thêm */}
      {showAdd && (
        <div className={modalBg} onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Thêm học sinh</h3>
            {err && <p className="text-sm text-red-500 mb-3">{err}</p>}
            <form onSubmit={handleAdd} className="space-y-3">
              <input placeholder="Họ tên" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              <input placeholder="Tên đăng nhập" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              <input placeholder="Mật khẩu" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              <div className="flex gap-2 pt-2">
                <button type="submit" disabled={saving}
                  className="flex-1 px-4 py-2 bg-[#2563EB] text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50">
                  {saving ? 'Đang lưu...' : 'Thêm'}
                </button>
                <button type="button" onClick={() => setShowAdd(false)}
                  className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">Hủy</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal sửa */}
      {showEdit && (
        <div className={modalBg} onClick={() => setShowEdit(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Sửa thông tin</h3>
            {err && <p className="text-sm text-red-500 mb-3">{err}</p>}
            <form onSubmit={handleEdit} className="space-y-3">
              <input placeholder="Họ tên" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              <input placeholder="Tên đăng nhập" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              <div className="flex gap-2 pt-2">
                <button type="submit" disabled={saving}
                  className="flex-1 px-4 py-2 bg-[#2563EB] text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50">
                  {saving ? 'Đang lưu...' : 'Lưu'}
                </button>
                <button type="button" onClick={() => setShowEdit(null)}
                  className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">Hủy</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal reset mật khẩu */}
      {showReset && (
        <div className={modalBg} onClick={() => setShowReset(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Reset mật khẩu</h3>
            {err && <p className="text-sm text-red-500 mb-3">{err}</p>}
            <form onSubmit={handleReset} className="space-y-3">
              <input placeholder="Mật khẩu mới (ít nhất 6 ký tự)" type="password" value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              <div className="flex gap-2 pt-2">
                <button type="submit" disabled={saving}
                  className="flex-1 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 text-sm font-medium disabled:opacity-50">
                  {saving ? 'Đang lưu...' : 'Đặt lại'}
                </button>
                <button type="button" onClick={() => setShowReset(null)}
                  className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">Hủy</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal xác nhận xóa */}
      {deleteTarget && (
        <div className={modalBg} onClick={() => setDeleteTarget(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Xác nhận cho rời lớp</h3>
            <p className="text-sm text-gray-600 mb-4">Bạn có chắc muốn cho học sinh này rời khỏi lớp? (Tài khoản sẽ được giữ lại)</p>
            <div className="flex gap-2">
              <button onClick={handleDelete}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium">Rời lớp</button>
              <button onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">Hủy</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Tra cứu HS */}
      {showLookup && (
        <div className={modalBg} onClick={() => setShowLookup(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Tra cứu học sinh</h3>
            {err && <p className="text-sm text-red-500 mb-3">{err}</p>}
            <div className="flex gap-2 mb-4">
              <input placeholder="Nhập tên hoặc username..." value={lookupQuery}
                onChange={(e) => setLookupQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              <button onClick={handleLookup} disabled={lookingUp}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium disabled:opacity-50">
                {lookingUp ? 'Đang tìm...' : 'Tìm'}
              </button>
            </div>
            {lookupResults.length > 0 && (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {lookupResults.map((s) => (
                  <div key={s.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{s.full_name}</p>
                      <p className="text-xs text-gray-400">{s.username} {s.email ? `• ${s.email}` : ''}</p>
                    </div>
                    <button onClick={() => handleEnroll(s.id)} disabled={enrolling === s.id}
                      className="px-3 py-1 text-xs rounded bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 disabled:opacity-50">
                      {enrolling === s.id ? 'Đang ghi...' : 'Ghi danh'}
                    </button>
                  </div>
                ))}
              </div>
            )}
            {lookupResults.length === 0 && lookupQuery.length >= 2 && !lookingUp && (
              <p className="text-sm text-gray-400 text-center py-4">Không tìm thấy học sinh</p>
            )}
            <button onClick={() => setShowLookup(false)}
              className="mt-4 px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50 w-full">Đóng</button>
          </div>
        </div>
      )}

      {/* Modal HS chưa có lớp */}
      {showUnassigned && (
        <div className={modalBg} onClick={() => setShowUnassigned(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Học sinh chưa có lớp</h3>
            {loadingUnassigned ? (
              <p className="text-center py-8 text-gray-500">Đang tải...</p>
            ) : unassignedStudents.length === 0 ? (
              <p className="text-center py-8 text-gray-400">Tất cả học sinh đều đã có lớp</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {unassignedStudents.map((s) => (
                  <div key={s.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{s.full_name}</p>
                      <p className="text-xs text-gray-400">{s.username} {s.email ? `• ${s.email}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <select value={assignClassMap[s.id] || ''} onChange={(e) => setAssignClassMap({ ...assignClassMap, [s.id]: e.target.value })}
                        className="border rounded px-2 py-1 text-xs max-w-[140px]">
                        <option value="">Chọn lớp</option>
                        {allClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <button onClick={() => handleAssignClass(s.id)} disabled={!assignClassMap[s.id]}
                        className="px-2 py-1 text-xs rounded bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 disabled:opacity-30">
                        Ghi danh
                      </button>
                      <button onClick={() => handleDeleteStudent(s.id, s.full_name)} disabled={deletingStudent === s.id}
                        className="px-2 py-1 text-xs rounded bg-red-50 text-red-600 hover:bg-red-100 border border-red-200">
                        {deletingStudent === s.id ? '...' : 'Xóa'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => setShowUnassigned(false)}
              className="mt-4 px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50 w-full">Đóng</button>
          </div>
        </div>
      )}

      {/* Modal Import Excel */}
      {showImport && (
        <div className={modalBg} onClick={() => { if (!importing) setShowImport(false); }}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Import danh sách từ Excel</h3>
            {err && <p className="text-sm text-red-500 mb-3">{err}</p>}
            {importResult ? (
              <div>
                <p className="text-sm text-gray-700 mb-2">Kết quả:</p>
                <p className="text-sm text-green-600">✓ Thêm thành công: {importResult.success}</p>
                {importResult.errors?.length > 0 && (
                  <div className="mt-2 max-h-40 overflow-y-auto">
                    <p className="text-sm text-red-500 mb-1">Lỗi ({importResult.errors.length}):</p>
                    {importResult.errors.map((e, i) => (
                      <p key={i} className="text-xs text-red-400">- {e.row?.full_name || e.row?.username}: {e.error}</p>
                    ))}
                  </div>
                )}
                <button onClick={() => setShowImport(false)}
                  className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">Đóng</button>
              </div>
            ) : (
              <div>
                <p className="text-xs text-gray-500 mb-3">
                  File Excel cần có các cột: <b>Họ tên</b>, <b>Tên đăng nhập</b>, <b>Mật khẩu</b> (có thể để trống, mặc định 123456)
                </p>
                <input type="file" accept=".xlsx,.xls" onChange={(e) => setImportFile(e.target.files[0])}
                  className="w-full text-sm mb-3" />
                <div className="flex gap-2">
                  <button onClick={handleImport} disabled={!importFile || importing}
                    className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm font-medium disabled:opacity-50">
                    {importing ? 'Đang import...' : 'Import'}
                  </button>
                  <button onClick={() => setShowImport(false)}
                    className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">Hủy</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const AssignmentsTab = ({ classId }) => {
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAssignments, setSelectedAssignments] = useState([]);
  const [showShare, setShowShare] = useState(false);
  const [allClasses, setAllClasses] = useState([]);
  const [selectedTargets, setSelectedTargets] = useState([]);
  const [sharing, setSharing] = useState(false);
  const [shareResult, setShareResult] = useState(null);

  const fetch = useCallback(async () => {
    try {
      const { data } = await api.get(`/api/classes/${classId}/assignments`);
      setAssignments(data);
    } catch {} finally { setLoading(false); }
  }, [classId]);

  useEffect(() => { fetch(); }, [fetch]);

  const togglePublish = async (id) => {
    try {
      await api.patch(`/api/assignments/${id}/publish`);
      fetch();
    } catch {}
  };

  const toggleSelect = (id) => {
    setSelectedAssignments((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (selectedAssignments.length === assignments.length) {
      setSelectedAssignments([]);
    } else {
      setSelectedAssignments(assignments.map((a) => a.id));
    }
  };

  const openShare = async () => {
    try {
      const { data } = await api.get('/api/classes');
      setAllClasses(data.filter((c) => c.id !== classId));
      setSelectedTargets([]);
      setShareResult(null);
      setShowShare(true);
    } catch {}
  };

  const handleShare = async () => {
    if (selectedTargets.length === 0) return;
    setSharing(true);
    try {
      const { data } = await api.post(`/api/classes/${classId}/assignments/share`, {
        target_class_ids: selectedTargets,
        assignment_ids: selectedAssignments,
      });
      setShareResult(data);
    } catch (e) { setShareResult({ error: e.response?.data?.message || 'Lỗi' }); }
    finally { setSharing(false); }
  };

  const toggleTarget = (id) => {
    setSelectedTargets((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const modalBg = 'fixed inset-0 bg-black/40 flex items-center justify-center z-50';

  if (loading) return <div className="text-center py-8 text-gray-500">Đang tải...</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-800">Danh sách bài tập</h3>
        <div className="flex items-center gap-2">
          {selectedAssignments.length > 0 && (
            <button onClick={openShare}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium">
              Chia sẻ ({selectedAssignments.length})
            </button>
          )}
          <button
            onClick={() => navigate(`/classes/${classId}/assignments/new`)}
            className="px-4 py-2 bg-[#2563EB] text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            + Thêm bài tập
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {assignments.map((a) => (
          <div key={a.id} className="bg-white border rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1">
              <input type="checkbox" checked={selectedAssignments.includes(a.id)}
                onChange={() => toggleSelect(a.id)} className="accent-blue-600" />
              <div>
                <h4 className="font-medium text-gray-800">{a.title}</h4>
                <p className="text-sm text-gray-500 mt-0.5">
                  {a.type?.toUpperCase()}
                  {a.max_score ? ` • ${a.max_score}đ` : ''}
                  {a.due_date && ` • Hạn: ${new Date(a.due_date).toLocaleDateString('vi-VN')}`}
                  {a.max_submissions && ` • Nộp ${a.max_submissions} lần`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => navigate(`/classes/${classId}/assignments/${a.id}/edit`)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-50">
                Sửa
              </button>
              <button onClick={() => togglePublish(a.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                  a.is_published
                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {a.is_published ? 'Đã publish' : 'Nháp'}
              </button>
            </div>
          </div>
        ))}
        {assignments.length === 0 && (
          <p className="text-center py-8 text-gray-400">Chưa có bài tập nào</p>
        )}
      </div>

      {/* Checkbox chọn tất cả */}
      {assignments.length > 0 && (
        <label className="flex items-center gap-2 mt-3 text-sm text-gray-500 cursor-pointer">
          <input type="checkbox" checked={selectedAssignments.length === assignments.length}
            onChange={selectAll} className="accent-blue-600" />
          Chọn tất cả ({selectedAssignments.length}/{assignments.length})
        </label>
      )}

      {/* Modal chia sẻ */}
      {showShare && (
        <div className={modalBg} onClick={() => { if (!sharing) setShowShare(false); }}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Chia sẻ bài tập sang lớp khác</h3>

            {shareResult ? (
              <div>
                {shareResult.error ? (
                  <p className="text-sm text-red-500 mb-3">{shareResult.error}</p>
                ) : (
                  <div>
                    <p className="text-sm text-green-600 mb-1">✓ Đã sao chép {shareResult.copied} bài tập</p>
                    <p className="text-sm text-gray-500">Sang {shareResult.targetCount} lớp đích</p>
                  </div>
                )}
                <button onClick={() => { setShowShare(false); fetch(); }}
                  className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">Đóng</button>
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-500 mb-3">Chọn lớp muốn sao chép bài tập đến:</p>
                {allClasses.length === 0 ? (
                  <p className="text-sm text-gray-400">Bạn không có lớp nào khác</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
                    {allClasses.map((c) => (
                      <label key={c.id} className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                        <input type="checkbox" checked={selectedTargets.includes(c.id)} onChange={() => toggleTarget(c.id)}
                          className="accent-blue-600" />
                        <div>
                          <p className="text-sm font-medium text-gray-800">{c.name}</p>
                          <p className="text-xs text-gray-400">Khối {c.grade} • {c.subject?.toUpperCase()}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={handleShare} disabled={selectedTargets.length === 0 || sharing}
                    className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium disabled:opacity-50">
                    {sharing ? 'Đang sao chép...' : `Sao chép sang ${selectedTargets.length} lớp`}
                  </button>
                  <button onClick={() => setShowShare(false)}
                    className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">Hủy</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

import * as XLSX from 'xlsx';

const GradebookTab = ({ classId }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/api/classes/${classId}/gradebook`)
      .then(({ data: d }) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [classId]);

  const exportCSV = () => {
    api.get(`/api/classes/${classId}/gradebook/export`, { responseType: 'blob' })
      .then((res) => {
        const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8;' }));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `gradebook_${classId}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      });
  };

  const exportExcel = () => {
    const header = ['Họ tên', ...data.assignments.map((a) => a.title)];
    const rows = data.rows.map((row) => [
      row.student.full_name,
      ...data.assignments.map((a) => {
        const sub = row.assignments[a.id];
        return sub ? `${sub.score}/${sub.max_score}` : '--';
      }),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws['!cols'] = [{ wch: 25 }, ...data.assignments.map(() => ({ wch: 14 }))];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bảng điểm');
    XLSX.writeFile(wb, `gradebook_${classId}.xlsx`);
  };

  if (loading) return <div className="text-center py-8 text-gray-500">Đang tải...</div>;
  if (!data) return <div className="text-center py-8 text-gray-400">Không có dữ liệu</div>;

  return (
    <div>
      <div className="flex justify-end gap-2 mb-4">
        <button onClick={exportCSV}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">
          Xuất CSV
        </button>
        <button onClick={exportExcel}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium">
          Xuất Excel
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="text-left px-3 py-2 font-medium text-gray-600 sticky left-0 bg-gray-50">Học sinh</th>
              {data.assignments.map((a) => (
                <th key={a.id} className="text-center px-3 py-2 font-medium text-gray-600 min-w-[100px]">
                  {a.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.student.user_id} className="border-b hover:bg-gray-50">
                <td className="px-3 py-2 font-medium text-gray-800 sticky left-0 bg-white">{row.student.full_name}</td>
                {data.assignments.map((a) => {
                  const sub = row.assignments[a.id];
                  let cellClass = 'text-center px-3 py-2';
                  if (sub) {
                    const pct = sub.max_score > 0 ? (sub.score / sub.max_score) * 100 : 0;
                    cellClass += pct >= 70 ? ' text-green-700 font-medium' : ' text-red-600 font-medium';
                  } else {
                    cellClass += ' text-gray-300';
                  }
                  return (
                    <td key={a.id} className={cellClass}>
                      {sub ? `${sub.score}/${sub.max_score}` : '--'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const StudentAssignments = ({ classId }) => {
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState([]);
  const [submissions, setSubmissions] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: list } = await api.get(`/api/classes/${classId}/assignments`);
        setAssignments(list);
        const subMap = {};
        for (const a of list) {
          try {
            const { data: sub } = await api.get(`/api/submissions/my/${a.id}`);
            subMap[a.id] = sub;
          } catch {}
        }
        setSubmissions(subMap);
      } catch {} finally { setLoading(false); }
    };
    fetchData();
  }, [classId]);

  const typeRoute = { python: '/python-practice', sql: '/sql-practice', html: '/html-practice' };

  if (loading) return <div className="text-center py-8 text-gray-500">Đang tải...</div>;

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Bài tập được giao</h3>
      {assignments.map((a) => {
        const sub = submissions[a.id];
        const submissionData = sub?.data;
        const remaining = sub?.remaining_attempts;
        const maxSub = sub?.max_submissions;
        return (
          <div key={a.id} className="bg-white border rounded-lg p-5 flex items-center justify-between">
            <div>
              <h4 className="font-medium text-gray-800">{a.title}</h4>
              <p className="text-sm text-gray-500 mt-0.5">{a.description}</p>
              <div className="flex gap-3 mt-2">
                <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-700 text-xs font-medium uppercase">
                  {a.type}
                </span>
                {a.due_date && (
                  <span className="text-xs text-gray-400">
                    Hạn: {new Date(a.due_date).toLocaleDateString('vi-VN')}
                  </span>
                )}
                {submissionData && (
                  <span className={`text-xs font-medium ${submissionData.score >= (submissionData.max_score || 1) * 0.7 ? 'text-green-600' : 'text-red-500'}`}>
                    Điểm: {submissionData.score}/{submissionData.max_score}
                  </span>
                )}
                {maxSub && (
                  <span className={`text-xs font-medium ${remaining > 0 ? 'text-blue-600' : 'text-red-500'}`}>
                    {remaining > 0 ? `Còn ${remaining}/${maxSub} lần` : `Đã nộp đủ ${maxSub} lần`}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => navigate(`${typeRoute[a.type] || '/coding'}/${a.id}`)}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                remaining === 0
                  ? 'bg-gray-100 text-gray-500 border border-gray-300 hover:bg-gray-50'
                  : 'bg-[#2563EB] text-white hover:bg-blue-700'
              }`}
            >
              {remaining === 0 ? 'Xem lại' : submissionData ? 'Làm lại' : 'Vào làm bài'}
            </button>
          </div>
        );
      })}
      {assignments.length === 0 && (
        <p className="text-center py-8 text-gray-400">Chưa có bài tập nào</p>
      )}
    </div>
  );
};

const ClassDetail = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const [classInfo, setClassInfo] = useState(null);

  useEffect(() => {
    api.get('/api/classes').then(({ data }) => {
      const found = data.find((c) => c.id === id);
      if (found) setClassInfo(found);
    });
  }, [id]);

  return (
    <div>
      <div className="mb-6">
        {classInfo && (
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-gray-800">{classInfo.name}</h1>
            <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">Khối {classInfo.grade}</span>
            <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs font-medium uppercase">{classInfo.subject}</span>
          </div>
        )}
      </div>

      {user?.role === 'teacher' ? <TeacherTabs classId={id} /> : <StudentAssignments classId={id} />}
    </div>
  );
};

export default ClassDetail;
