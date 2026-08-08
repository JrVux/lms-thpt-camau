import { useMemo, useState } from 'react';
import api from '../services/api';
import { eligibleTargetClasses } from '../utils/assignmentLibrary';
import { buildDeliveryPayload } from '../utils/deliveryForm';
import Modal from './Modal';
import Button from './Button';
import { Search, Send } from 'lucide-react';

const emptySelection = {
  selected: false,
  recipient_mode: 'all',
  student_ids: [],
  due_date: '',
  is_published: false,
  max_submissions: '',
};

const AssignmentDeliveryModal = ({ assignment, classes, open, onClose, onDelivered, initialClassId }) => {
  const eligibleClasses = useMemo(
    () => eligibleTargetClasses(assignment, classes),
    [assignment, classes]
  );
  const [selections, setSelections] = useState(initialClassId
    ? { [initialClassId]: { ...emptySelection, selected: true } }
    : {});
  const [students, setStudents] = useState({});
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const updateSelection = (classId, patch) => {
    setSelections((current) => ({
      ...current,
      [classId]: { ...emptySelection, ...current[classId], ...patch },
    }));
  };

  const loadStudents = async (classId) => {
    if (students[classId]) return;
    try {
      const { data } = await api.get(`/api/classes/${classId}/students`);
      setStudents((current) => ({ ...current, [classId]: data }));
    } catch {
      setError('Không thể tải danh sách học sinh của lớp.');
    }
  };

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = buildDeliveryPayload(selections);
      const { data } = await api.post(`/api/assignment-library/${assignment.id}/deliver`, payload);
      onDelivered?.(data);
      onClose();
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const visibleClasses = eligibleClasses.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Giao bài: ${assignment.title}`}
      subtitle="Mỗi lớp có cấu hình và danh sách học sinh riêng."
      maxWidth="max-w-4xl"
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Tìm lớp..."
          className="w-full rounded-lg border border-brand-border py-2.5 pl-9 pr-3 outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
      </div>
      {error && <div className="mt-3 rounded-xl bg-badge-red-bg p-3 text-sm text-badge-red-text">{error}</div>}
      <div className="mt-4 space-y-3">
        {visibleClasses.map((classItem) => {
          const selection = { ...emptySelection, ...selections[classItem.id] };
          const classStudents = students[classItem.id] ?? [];
          return (
            <div key={classItem.id} className="rounded-2xl border border-brand-border bg-page/40 p-4">
              <label className="flex cursor-pointer items-center gap-2.5 font-semibold text-brand-heading">
                <input
                  type="checkbox"
                  checked={selection.selected}
                  onChange={(event) => updateSelection(classItem.id, { selected: event.target.checked })}
                  className="h-4 w-4 rounded accent-brand"
                />
                {classItem.name} · Khối {classItem.grade} · {classItem.subject.toUpperCase()}
              </label>
              {selection.selected && (
                <div className="mt-3 grid gap-3 md:grid-cols-4">
                  <input type="datetime-local" value={selection.due_date} onChange={(event) => updateSelection(classItem.id, { due_date: event.target.value })} className="rounded-lg border border-brand-border px-2 py-2 text-sm" />
                  <input type="number" min="1" value={selection.max_submissions} onChange={(event) => updateSelection(classItem.id, { max_submissions: event.target.value })} placeholder="Số lượt nộp" className="rounded-lg border border-brand-border px-2 py-2 text-sm" />
                  <select
                    value={selection.recipient_mode}
                    onChange={(event) => {
                      updateSelection(classItem.id, { recipient_mode: event.target.value });
                      if (event.target.value === 'selected') loadStudents(classItem.id);
                    }}
                    className="rounded-lg border border-brand-border px-2 py-2 text-sm bg-white"
                  >
                    <option value="all">Toàn bộ lớp</option>
                    <option value="selected">Học sinh cụ thể</option>
                  </select>
                  <label className="flex items-center gap-2 text-sm text-brand-body">
                    <input type="checkbox" checked={selection.is_published} onChange={(event) => updateSelection(classItem.id, { is_published: event.target.checked })} className="h-4 w-4 accent-brand" />
                    Giao ngay
                  </label>
                  {selection.recipient_mode === 'selected' && (
                    <div className="max-h-40 overflow-y-auto rounded-xl bg-badge-blue-bg/50 p-3 md:col-span-4">
                      <button type="button" className="mb-2 text-sm font-medium text-badge-blue-text hover:underline" onClick={() => updateSelection(classItem.id, { student_ids: classStudents.map((student) => student.user_id) })}>
                        Chọn toàn bộ học sinh
                      </button>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {classStudents.map((student) => (
                          <label key={student.user_id} className="flex items-center gap-2 text-sm text-brand-body">
                            <input
                              type="checkbox"
                              checked={selection.student_ids.includes(student.user_id)}
                              onChange={(event) => updateSelection(classItem.id, {
                                student_ids: event.target.checked
                                  ? [...selection.student_ids, student.user_id]
                                  : selection.student_ids.filter((id) => id !== student.user_id),
                              })}
                              className="h-4 w-4 accent-brand"
                            />
                            {student.full_name || student.username}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-5 flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onClose}>Hủy</Button>
        <Button type="button" onClick={submit} disabled={saving} icon={Send}>
          {saving ? 'Đang giao...' : 'Giao bài'}
        </Button>
      </div>
    </Modal>
  );
};

export default AssignmentDeliveryModal;