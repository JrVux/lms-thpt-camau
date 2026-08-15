import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { getEligibleTargetClasses } from '../utils/assignmentSharing';
import { canConfirmClassDeletion } from '../utils/classDeletion';
import Badge from '../components/Badge';
import Button from '../components/Button';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import ClassCompetencyDashboard from '../components/ClassCompetencyDashboard';
import * as XLSX from 'xlsx';
import { GraduationCap, Users, BookOpen, BarChart3, BrainCircuit, Plus, Upload, UserSearch, UserPlus, Search, ArrowUpDown, Pencil, KeyRound, LogOut, Copy } from 'lucide-react';

const inputCls = 'w-full rounded-lg border border-brand-border px-3 py-2 text-sm outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20';
const miniBtn = 'px-2 py-1 text-xs rounded-lg font-medium transition-colors';
const blueBtn = `${miniBtn} bg-badge-blue-bg text-badge-blue-text hover:bg-blue-100`;
const yellowBtn = `${miniBtn} bg-badge-orange-bg text-badge-orange-text hover:bg-orange-100`;
const redBtn = `${miniBtn} bg-badge-red-bg text-badge-red-text hover:bg-red-100`;

const TeacherTabs = ({ classId }) => {
  const [tab, setTab] = useState('students');
  const tabs = [
    { key: 'students', label: 'Học sinh' },
    { key: 'assignments', label: 'Bài tập' },
    { key: 'gradebook', label: 'Bảng điểm' },
    { key: 'competencies', label: 'Phân tích năng lực' },
  ];

  return (
    <div>
      <div className="mb-6 inline-flex gap-1 rounded-xl bg-card p-1 shadow-card ring-1 ring-brand-border">
        {tabs.map((t) => {
          const IconMap = { students: Users, assignments: BookOpen, gradebook: BarChart3, competencies: BrainCircuit };
          const Icon = IconMap[t.key];
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'bg-brand-light text-brand'
                  : 'text-brand-muted hover:text-brand-heading hover:bg-gray-50'
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>
      {tab === 'students' && <StudentTab classId={classId} />}
      {tab === 'assignments' && <AssignmentsTab classId={classId} />}
      {tab === 'gradebook' && <GradebookTab classId={classId} />}
      {tab === 'competencies' && <ClassCompetencyDashboard classId={classId} />}
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

  if (loading) return <div className="py-10 text-center text-brand-muted">Đang tải...</div>;

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => { setShowAdd(true); setForm({ full_name: '', username: '', email: '', password: '' }); setErr(''); }} icon={Plus}>Thêm HS</Button>
          <Button size="sm" variant="orange" onClick={() => { setShowImport(true); setImportFile(null); setImportResult(null); setErr(''); }} icon={Upload}>Import Excel</Button>
          <Button size="sm" variant="purple" onClick={() => { setShowLookup(true); setLookupQuery(''); setLookupResults([]); setErr(''); }} icon={UserSearch}>Tra cứu HS</Button>
          <Button size="sm" variant="outline" onClick={async () => {
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
          }} icon={UserPlus}>HS chưa có lớp</Button>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
            <input
              placeholder="Tìm kiếm..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-48 rounded-lg border border-brand-border py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </div>
          <Button size="sm" variant="outline" onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}>
            <ArrowUpDown className="h-3.5 w-3.5" />
            {sortDir === 'asc' ? 'A→Z' : 'Z→A'}
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl bg-card shadow-card ring-1 ring-brand-border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-border bg-page/60">
                <th className="px-4 py-3 text-left font-medium text-brand-muted">STT</th>
                <th className="px-4 py-3 text-left font-medium text-brand-muted">Họ tên</th>
                <th className="px-4 py-3 text-left font-medium text-brand-muted">Username</th>
                <th className="px-4 py-3 text-left font-medium text-brand-muted">Email</th>
                <th className="px-4 py-3 text-center font-medium text-brand-muted">Bài đã nộp</th>
                <th className="px-4 py-3 text-center font-medium text-brand-muted">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, i) => (
                <tr key={s.user_id} className="border-b border-brand-border transition-colors last:border-0 hover:bg-gray-50/60">
                  <td className="px-4 py-3 text-brand-muted">{i + 1}</td>
                  <td className="px-4 py-3 font-medium text-brand-heading">{s.full_name}</td>
                  <td className="px-4 py-3 text-brand-body">{s.username}</td>
                  <td className="px-4 py-3 text-brand-body">{s.email}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex min-w-[28px] justify-center rounded-full bg-badge-blue-bg px-2 py-0.5 text-xs font-semibold text-badge-blue-text">
                      {s.submission_count}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => editStudent(s)} className={blueBtn}><Pencil className="mr-1 inline h-3 w-3" />Sửa</button>
                      <button onClick={() => resetStudent(s.user_id)} className={yellowBtn}><KeyRound className="mr-1 inline h-3 w-3" />MKM</button>
                      <button onClick={() => setDeleteTarget(s.user_id)} className={redBtn}><LogOut className="mr-1 inline h-3 w-3" />Rời lớp</button>
                    </div>
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-brand-muted">Chưa có học sinh</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal thêm */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Thêm học sinh">
        {err && <p className="mb-3 rounded-lg bg-badge-red-bg p-2.5 text-sm text-badge-red-text">{err}</p>}
        <form onSubmit={handleAdd} className="space-y-3">
          <input placeholder="Họ tên" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className={inputCls} />
          <input placeholder="Tên đăng nhập" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className={inputCls} />
          <input placeholder="Mật khẩu" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputCls} />
          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={saving} className="flex-1">{saving ? 'Đang lưu...' : 'Thêm'}</Button>
            <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Hủy</Button>
          </div>
        </form>
      </Modal>

      {/* Modal sửa */}
      <Modal open={!!showEdit} onClose={() => setShowEdit(null)} title="Sửa thông tin">
        {err && <p className="mb-3 rounded-lg bg-badge-red-bg p-2.5 text-sm text-badge-red-text">{err}</p>}
        <form onSubmit={handleEdit} className="space-y-3">
          <input placeholder="Họ tên" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className={inputCls} />
          <input placeholder="Tên đăng nhập" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className={inputCls} />
          <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} />
          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={saving} className="flex-1">{saving ? 'Đang lưu...' : 'Lưu'}</Button>
            <Button type="button" variant="outline" onClick={() => setShowEdit(null)}>Hủy</Button>
          </div>
        </form>
      </Modal>

      {/* Modal reset mật khẩu */}
      <Modal open={!!showReset} onClose={() => setShowReset(null)} title="Reset mật khẩu">
        {err && <p className="mb-3 rounded-lg bg-badge-red-bg p-2.5 text-sm text-badge-red-text">{err}</p>}
        <form onSubmit={handleReset} className="space-y-3">
          <input placeholder="Mật khẩu mới (ít nhất 6 ký tự)" type="password" value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputCls} />
          <div className="flex gap-2 pt-2">
            <Button type="submit" variant="yellow" disabled={saving} className="flex-1">{saving ? 'Đang lưu...' : 'Đặt lại'}</Button>
            <Button type="button" variant="outline" onClick={() => setShowReset(null)}>Hủy</Button>
          </div>
        </form>
      </Modal>

      {/* Modal xác nhận xóa */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Xác nhận cho rời lớp"
        message="Bạn có chắc muốn cho học sinh này rời khỏi lớp? (Tài khoản sẽ được giữ lại)"
        confirmText="Rời lớp"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Modal Tra cứu HS */}
      <Modal open={showLookup} onClose={() => setShowLookup(false)} title="Tra cứu học sinh" maxWidth="max-w-lg">
        {err && <p className="mb-3 rounded-lg bg-badge-red-bg p-2.5 text-sm text-badge-red-text">{err}</p>}
        <div className="mb-4 flex gap-2">
          <input placeholder="Nhập tên hoặc username..." value={lookupQuery}
            onChange={(e) => setLookupQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLookup()} className={`${inputCls} flex-1`} />
          <Button onClick={handleLookup} disabled={lookingUp} variant="purple">{lookingUp ? 'Đang tìm...' : 'Tìm'}</Button>
        </div>
        {lookupResults.length > 0 && (
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {lookupResults.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-xl border border-brand-border p-3">
                <div>
                  <p className="text-sm font-medium text-brand-heading">{s.full_name}</p>
                  <p className="text-xs text-brand-muted">{s.username} {s.email ? `• ${s.email}` : ''}</p>
                </div>
                <Button size="sm" variant="blue" onClick={() => handleEnroll(s.id)} disabled={enrolling === s.id}>
                  {enrolling === s.id ? 'Đang ghi...' : 'Ghi danh'}
                </Button>
              </div>
            ))}
          </div>
        )}
        {lookupResults.length === 0 && lookupQuery.length >= 2 && !lookingUp && (
          <p className="py-4 text-center text-sm text-brand-muted">Không tìm thấy học sinh</p>
        )}
      </Modal>

      {/* Modal HS chưa có lớp */}
      <Modal open={showUnassigned} onClose={() => setShowUnassigned(false)} title="Học sinh chưa có lớp" maxWidth="max-w-2xl">
        {loadingUnassigned ? (
          <p className="py-8 text-center text-brand-muted">Đang tải...</p>
        ) : unassignedStudents.length === 0 ? (
          <p className="py-8 text-center text-brand-muted">Tất cả học sinh đều đã có lớp</p>
        ) : (
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {unassignedStudents.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-xl border border-brand-border p-3">
                <div>
                  <p className="text-sm font-medium text-brand-heading">{s.full_name}</p>
                  <p className="text-xs text-brand-muted">{s.username} {s.email ? `• ${s.email}` : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                  <select value={assignClassMap[s.id] || ''} onChange={(e) => setAssignClassMap({ ...assignClassMap, [s.id]: e.target.value })}
                    className="max-w-[140px] rounded-md border border-brand-border px-2 py-1 text-xs">
                    <option value="">Chọn lớp</option>
                    {allClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <Button size="sm" variant="blue" onClick={() => handleAssignClass(s.id)} disabled={!assignClassMap[s.id]}>Ghi danh</Button>
                  <Button size="sm" variant="danger" onClick={() => handleDeleteStudent(s.id, s.full_name)} disabled={deletingStudent === s.id}>
                    {deletingStudent === s.id ? '...' : 'Xóa'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Modal Import Excel */}
      <Modal open={showImport} onClose={() => { if (!importing) setShowImport(false); }} title="Import danh sách từ Excel" maxWidth="max-w-lg">
        {err && <p className="mb-3 rounded-lg bg-badge-red-bg p-2.5 text-sm text-badge-red-text">{err}</p>}
        {importResult ? (
          <div>
            <p className="mb-2 text-sm text-brand-body">Kết quả:</p>
            <p className="text-sm font-medium text-green-600">✓ Thêm thành công: {importResult.success}</p>
            {importResult.errors?.length > 0 && (
              <div className="mt-2 max-h-40 overflow-y-auto">
                <p className="mb-1 text-sm text-red-500">Lỗi ({importResult.errors.length}):</p>
                {importResult.errors.map((e, i) => (
                  <p key={i} className="text-xs text-red-400">- {e.row?.full_name || e.row?.username}: {e.error}</p>
                ))}
              </div>
            )}
                <div className="mt-3">
                  <Button onClick={() => setShowImport(false)}>Đóng</Button>
                </div>
          </div>
        ) : (
          <div>
            <p className="mb-3 text-xs text-brand-muted">
              File Excel cần có các cột: <b className="text-brand-body">Họ tên</b>, <b className="text-brand-body">Tên đăng nhập</b>, <b className="text-brand-body">Mật khẩu</b> (có thể để trống, mặc định 123456)
            </p>
            <input type="file" accept=".xlsx,.xls" onChange={(e) => setImportFile(e.target.files[0])} className="mb-3 w-full text-sm" />
            <div className="flex gap-2">
              <Button onClick={handleImport} disabled={!importFile || importing} variant="orange" className="flex-1">
                {importing ? 'Đang import...' : 'Import'}
              </Button>
              <Button onClick={() => setShowImport(false)} variant="outline">Hủy</Button>
            </div>
          </div>
        )}
      </Modal>
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

  const togglePublish = async (assignment) => {
    try {
      await api.patch(`/api/assignment-deliveries/${assignment.delivery_id}`, {
        is_published: !assignment.is_published,
      });
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
      setAllClasses(getEligibleTargetClasses(data, classId));
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

  if (loading) return <div className="py-10 text-center text-brand-muted">Đang tải...</div>;

  return (
    <div>
      <div className="mb-4 flex justify-between items-center gap-3">
        <h3 className="text-lg font-semibold text-brand-heading">Danh sách bài tập</h3>
        <div className="flex items-center gap-2">
          {selectedAssignments.length > 0 && (
            <Button size="sm" onClick={openShare}><Copy className="h-3.5 w-3.5" />Chia sẻ ({selectedAssignments.length})</Button>
          )}
          <Button size="sm" onClick={() => navigate(`/assignments?classId=${classId}`)}>Kho bài tập</Button>
        </div>
      </div>

      <div className="space-y-3">
        {assignments.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-3 rounded-2xl bg-card p-4 shadow-card ring-1 ring-brand-border">
            <div className="flex flex-1 items-center gap-3">
              <input
                type="checkbox"
                checked={selectedAssignments.includes(a.id)}
                onChange={() => toggleSelect(a.id)}
                className="h-4 w-4 accent-brand"
              />
              <div>
                <h4 className="font-medium text-brand-heading">{a.title}</h4>
                <p className="mt-0.5 text-sm text-brand-muted">
                  {a.type?.toUpperCase()}
                  {a.max_score ? ` • ${a.max_score}đ` : ''}
                  {a.due_date && ` • Hạn: ${new Date(a.due_date).toLocaleDateString('vi-VN')}`}
                  {a.max_submissions && ` • Nộp ${a.max_submissions} lần`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => navigate(a.sync_mode === 'linked'
                ? `/assignments/${a.library_assignment_id}/edit`
                : `/classes/${classId}/assignments/${a.assignment_id}/edit`)}>Sửa</Button>
              <button onClick={() => togglePublish(a)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  a.is_published
                    ? 'bg-badge-green-bg text-badge-green-text hover:bg-green-100'
                    : 'bg-gray-100 text-brand-muted hover:bg-gray-200'
                }`}>
                {a.is_published ? 'Đã publish' : 'Nháp'}
              </button>
            </div>
          </div>
        ))}
        {assignments.length === 0 && (
          <p className="py-10 text-center text-brand-muted">Chưa có bài tập nào</p>
        )}
      </div>

      {/* Modal chia sẻ */}
      <Modal open={showShare} onClose={() => { if (!sharing) setShowShare(false); }} title="Chia sẻ bài tập sang lớp khác" maxWidth="max-w-lg">
        {shareResult ? (
          <div>
            {shareResult.error ? (
              <p className="mb-3 text-sm text-red-500">{shareResult.error}</p>
            ) : (
              <div>
                <p className="mb-1 text-sm text-green-600">✓ Đã sao chép {shareResult.copied} bài tập</p>
                <p className="text-sm text-brand-body">Sang {shareResult.targetCount} lớp đích</p>
                {shareResult.failed > 0 && (
                  <div className="mt-3 rounded-xl bg-badge-red-bg p-3">
                    <p className="text-sm font-medium text-badge-red-text">{shareResult.failed} bản sao thất bại</p>
                    <ul className="mt-1 space-y-1 text-xs text-red-600">
                      {shareResult.failures?.map((failure) => (
                        <li key={`${failure.assignmentId}-${failure.targetClassId}`}>{failure.message}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            <div className="mt-3">
              <Button onClick={() => { setShowShare(false); fetch(); }}>Đóng</Button>
            </div>
          </div>
        ) : (
          <div>
            <p className="mb-1 text-sm text-brand-body">Chọn lớp cùng khối muốn sao chép bài tập đến:</p>
            <p className="mb-3 text-xs text-brand-muted">Mỗi bản sao là một bài nháp độc lập để bạn chỉnh sửa và publish riêng.</p>
            {allClasses.length === 0 ? (
              <p className="text-sm text-brand-muted">Bạn chưa có lớp nào khác cùng khối</p>
            ) : (
              <div className="mb-4 max-h-64 space-y-2 overflow-y-auto">
                {allClasses.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-brand-border p-3 transition-colors hover:bg-gray-50">
                    <input type="checkbox" checked={selectedTargets.includes(c.id)} onChange={() => toggleTarget(c.id)} className="h-4 w-4 accent-brand" />
                    <div>
                      <p className="text-sm font-medium text-brand-heading">{c.name}</p>
                      <p className="text-xs text-brand-muted">Khối {c.grade} • {c.subject?.toUpperCase()}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={handleShare} disabled={selectedTargets.length === 0 || sharing} variant="green" className="flex-1">
                {sharing ? 'Đang sao chép...' : `Sao chép sang ${selectedTargets.length} lớp`}
              </Button>
              <Button onClick={() => setShowShare(false)} variant="outline">Hủy</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

const GradebookTab = ({ classId }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  useEffect(() => {
    api.get(`/api/classes/${classId}/gradebook`)
      .then(({ data: d }) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [classId]);

  const openSubmission = async (submissionId) => {
    setDetailLoading(true);
    setDetailError('');
    setSelectedSubmission(null);
    try {
      const { data: detail } = await api.get(`/api/classes/${classId}/submissions/${submissionId}`);
      setSelectedSubmission(detail);
    } catch (error) {
      setDetailError(error.response?.data?.message || 'Không thể tải bài làm');
    } finally {
      setDetailLoading(false);
    }
  };

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

  if (loading) return <div className="py-10 text-center text-brand-muted">Đang tải...</div>;
  if (!data) return <div className="py-10 text-center text-brand-muted">Không có dữ liệu</div>;

  return (
    <div>
      <div className="mb-4 flex justify-end gap-2">
        <Button size="sm" variant="green" onClick={exportCSV}>Xuất CSV</Button>
        <Button size="sm" variant="orange" onClick={exportExcel}>Xuất Excel</Button>
      </div>
      <div className="overflow-hidden rounded-2xl bg-card shadow-card ring-1 ring-brand-border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-page/60 border-b border-brand-border">
                <th className="sticky left-0 bg-page/60 px-3 py-2.5 text-left font-medium text-brand-muted">Học sinh</th>
                {data.assignments.map((a) => (
                  <th key={a.id} className="min-w-[100px] px-3 py-2.5 text-center font-medium text-brand-muted">{a.title}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.student.user_id} className="border-b border-brand-border transition-colors hover:bg-gray-50/60">
                  <td className="sticky left-0 bg-card px-3 py-2.5 font-medium text-brand-heading">{row.student.full_name}</td>
                  {data.assignments.map((a) => {
                    const sub = row.assignments[a.id];
                    let cellClass = 'px-3 py-2.5 text-center';
                    if (sub) {
                      const pct = sub.max_score > 0 ? (sub.score / sub.max_score) * 100 : 0;
                      cellClass += pct >= 70 ? ' text-green-700 font-medium' : ' text-red-600 font-medium';
                    } else {
                      cellClass += ' text-gray-300';
                    }
                    return (
                      <td key={a.id} className={cellClass}>
                        {sub ? (
                          <button
                            type="button"
                            onClick={() => openSubmission(sub.id)}
                            className="rounded-md px-1.5 py-0.5 underline decoration-dotted underline-offset-4 transition-colors hover:bg-brand-light hover:text-brand"
                            title="Bấm để xem bài làm"
                          >
                            {sub.score}/{sub.max_score}
                          </button>
                        ) : '--'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {(detailLoading || detailError || selectedSubmission) && (
        <Modal
          open
          onClose={() => { setSelectedSubmission(null); setDetailError(''); setDetailLoading(false); }}
          maxWidth="max-w-4xl"
        >
          {detailLoading && <p className="py-8 text-center text-brand-muted">Đang tải bài làm...</p>}
          {detailError && <p className="py-8 text-center text-red-600">{detailError}</p>}
          {selectedSubmission && (
            <div className="space-y-5">
              <div className="rounded-xl bg-page p-3">
                <p className="text-sm font-medium text-brand-heading">
                  {selectedSubmission.student?.full_name} • {selectedSubmission.assignment?.title}
                </p>
                <p className="mt-1 text-sm text-brand-muted">
                  {selectedSubmission.score}/{selectedSubmission.max_score} điểm
                  {' • '}{new Date(selectedSubmission.submitted_at).toLocaleString('vi-VN')}
                </p>
              </div>
              <div>
                <h4 className="mb-2 font-medium text-brand-heading">Nội dung đã nộp</h4>
                <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl bg-neutral-900 p-4 text-sm text-gray-100">{selectedSubmission.code || '(Không có nội dung)'}</pre>
              </div>
              <div>
                <h4 className="mb-2 font-medium text-brand-heading">Kết quả chấm từng test</h4>
                <div className="space-y-2">
                  {selectedSubmission.results?.map((result, index) => (
                    <div key={result.id || index} className={`rounded-xl border p-3 ${result.passed ? 'border-green-200 bg-green-50/60' : 'border-red-200 bg-red-50'}`}>
                      <div className="flex justify-between gap-3">
                        <span className="font-medium">{result.test_name || `Test ${index + 1}`}</span>
                        <span className={result.passed ? 'text-green-700' : 'text-red-700'}>
                          {result.passed ? 'Đạt' : 'Chưa đạt'} • {result.points ?? 0} điểm
                        </span>
                      </div>
                      {result.test_case?.input_data && <p className="mt-2 text-sm"><span className="text-brand-muted">Đầu vào:</span> {result.test_case.input_data}</p>}
                      {result.test_case?.expected_output && <p className="text-sm"><span className="text-brand-muted">Mong đợi:</span> {result.test_case.expected_output}</p>}
                      <p className="text-sm"><span className="text-brand-muted">Kết quả:</span> {result.actual_output || '(trống)'}</p>
                      {result.error_message && <p className="mt-1 text-sm text-red-700">{result.error_message}</p>}
                    </div>
                  ))}
                  {(!selectedSubmission.results || selectedSubmission.results.length === 0) && (
                    <p className="text-sm text-brand-muted">Bài nộp này không có dữ liệu test chi tiết.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </Modal>
      )}
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
        const { data: deliveries } = await api.get('/api/my-assignments');
        const list = deliveries
          .filter((delivery) => delivery.class_id === classId)
          .map((delivery) => ({
            ...delivery.assignments,
            delivery_id: delivery.id,
            due_date: delivery.due_date,
            max_submissions: delivery.max_submissions,
            submissions: delivery.submissions ?? [],
          }));
        setAssignments(list);
        const subMap = {};
        for (const a of list) {
          const latest = [...a.submissions].sort((left, right) => new Date(right.submitted_at) - new Date(left.submitted_at))[0] ?? null;
          subMap[a.id] = {
            data: latest,
            max_submissions: a.max_submissions,
            remaining_attempts: a.max_submissions === null ? null : Math.max(0, a.max_submissions - a.submissions.length),
          };
        }
        setSubmissions(subMap);
      } catch {} finally { setLoading(false); }
    };
    fetchData();
  }, [classId]);

  if (loading) return <div className="py-10 text-center text-brand-muted">Đang tải...</div>;

  return (
    <div className="space-y-3">
      <h3 className="mb-4 text-lg font-semibold text-brand-heading">Bài tập được giao</h3>
      {assignments.map((a) => {
        const sub = submissions[a.id];
        const submissionData = sub?.data;
        const remaining = sub?.remaining_attempts;
        const maxSub = sub?.max_submissions;
        return (
          <div key={a.id} className="flex items-center justify-between gap-3 rounded-2xl bg-card p-5 shadow-card ring-1 ring-brand-border">
            <div>
              <h4 className="font-medium text-brand-heading">{a.title}</h4>
              <p className="mt-0.5 text-sm text-brand-muted">{a.description}</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium uppercase ${
                  a.type === 'sql' ? 'bg-badge-purple-bg text-badge-purple-text' :
                  a.type === 'html' ? 'bg-badge-orange-bg text-badge-orange-text' :
                  'bg-badge-green-bg text-badge-green-text'}`}>
                  {a.type}
                </span>
                {a.due_date && (
                  <span className="text-xs text-brand-muted">
                    Hạn: {new Date(a.due_date).toLocaleDateString('vi-VN')}
                  </span>
                )}
                {submissionData && (
                  <span className={`text-xs font-medium ${submissionData.score >= (submissionData.max_score || 1) * 0.7 ? 'text-green-600' : 'text-red-500'}`}>
                    Điểm: {submissionData.score}/{submissionData.max_score}
                  </span>
                )}
                {maxSub && (
                  <span className={`text-xs font-medium ${remaining > 0 ? 'text-badge-blue-text' : 'text-red-500'}`}>
                    {remaining > 0 ? `Còn ${remaining}/${maxSub} lần` : `Đã nộp đủ ${maxSub} lần`}
                  </span>
                )}
              </div>
            </div>
            <Button
              onClick={() => navigate(`/deliveries/${a.delivery_id}/${a.type === 'sql' ? 'sql' : a.type === 'html' ? 'html' : 'python'}-practice`)}
              variant={remaining === 0 ? 'outline' : 'primary'}
            >
              {remaining === 0 ? 'Xem lại' : submissionData ? 'Làm lại' : 'Vào làm bài'}
            </Button>
          </div>
        );
      })}
      {assignments.length === 0 && (
        <p className="py-10 text-center text-brand-muted">Chưa có bài tập nào</p>
      )}
    </div>
  );
};

const ClassDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [classInfo, setClassInfo] = useState(null);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [deleteName, setDeleteName] = useState('');
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    api.get('/api/classes').then(({ data }) => {
      const found = data.find((c) => c.id === id);
      if (found) setClassInfo(found);
    });
  }, [id]);

  const closeDeleteDialog = () => {
    if (deletePending) return;
    setDeleteDialog(false);
    setDeleteName('');
    setDeleteError('');
  };

  const deleteClass = async () => {
    if (!canConfirmClassDeletion(deleteName, classInfo?.name) || deletePending) return;
    setDeletePending(true);
    setDeleteError('');
    try {
      await api.delete(`/api/classes/${id}`);
      navigate('/classes', { replace: true });
    } catch (error) {
      setDeleteError(error.response?.data?.message || 'Xóa lớp thất bại');
      setDeletePending(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        {classInfo && (
          <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-light text-brand">
                <GraduationCap className="h-6 w-6" />
              </span>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-brand-heading">{classInfo.name}</h1>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  <Badge color="blue">Khối {classInfo.grade}</Badge>
                  <Badge color="purple" className="uppercase">{classInfo.subject}</Badge>
                </div>
              </div>
            </div>
            {user?.role === 'teacher' && (
              <Button variant="dangerOutline" onClick={() => setDeleteDialog(true)}>Xóa lớp</Button>
            )}
          </div>
        )}
      </div>

      {user?.role === 'teacher' ? <TeacherTabs classId={id} /> : <StudentAssignments classId={id} />}

      <Modal open={deleteDialog} onClose={closeDeleteDialog} title="Xóa lớp vĩnh viễn?" maxWidth="max-w-md">
        <p className="text-sm leading-relaxed text-brand-body">
          Lớp <strong>{classInfo && classInfo.name}</strong>, danh sách học sinh trong lớp,
          bài đã giao, bài nộp và điểm sẽ bị xóa vĩnh viễn.
        </p>
        <p className="mt-2 text-sm text-brand-body">Tài khoản học sinh và bài gốc trong Kho bài tập vẫn được giữ lại.</p>
        <label className="mb-1 mt-5 block text-sm font-medium text-brand-heading">
          Nhập chính xác <strong>{classInfo && classInfo.name}</strong> để xác nhận
        </label>
        <input
          type="text"
          value={deleteName}
          onChange={(event) => setDeleteName(event.target.value)}
          disabled={deletePending}
          autoFocus
          className="w-full rounded-lg border border-brand-border px-4 py-2.5 outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:bg-gray-100"
          placeholder={classInfo && classInfo.name}
        />
        {deleteError && <p className="mt-3 text-sm text-red-600">{deleteError}</p>}
        <div className="mt-6 flex gap-3">
          <Button type="button" variant="outline" className="flex-1" onClick={closeDeleteDialog} disabled={deletePending}>Hủy</Button>
          <Button type="button" variant="danger" className="flex-1" onClick={deleteClass} disabled={!canConfirmClassDeletion(deleteName, classInfo && classInfo.name) || deletePending}>
            {deletePending ? 'Đang xóa...' : 'Xóa vĩnh viễn'}
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default ClassDetail;
