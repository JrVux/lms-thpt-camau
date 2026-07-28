import { useMemo, useState } from 'react';
import api from '../services/api';
import { eligibleTargetClasses } from '../utils/assignmentLibrary';
import { buildDeliveryPayload } from '../utils/deliveryForm';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Giao bài: {assignment.title}</h2>
            <p className="text-sm text-gray-500">Mỗi lớp có cấu hình và danh sách học sinh riêng.</p>
          </div>
          <button type="button" onClick={onClose} className="text-2xl text-gray-400">×</button>
        </div>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Tìm lớp..."
          className="mt-4 w-full rounded-lg border px-3 py-2"
        />
        {error && <div className="mt-3 rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <div className="mt-4 space-y-3">
          {visibleClasses.map((classItem) => {
            const selection = { ...emptySelection, ...selections[classItem.id] };
            const classStudents = students[classItem.id] ?? [];
            return (
              <div key={classItem.id} className="rounded-lg border p-4">
                <label className="flex items-center gap-2 font-semibold">
                  <input type="checkbox" checked={selection.selected} onChange={(event) => updateSelection(classItem.id, { selected: event.target.checked })} />
                  {classItem.name} · Khối {classItem.grade} · {classItem.subject.toUpperCase()}
                </label>
                {selection.selected && (
                  <div className="mt-3 grid gap-3 md:grid-cols-4">
                    <input type="datetime-local" value={selection.due_date} onChange={(event) => updateSelection(classItem.id, { due_date: event.target.value })} className="rounded border px-2 py-2 text-sm" />
                    <input type="number" min="1" value={selection.max_submissions} onChange={(event) => updateSelection(classItem.id, { max_submissions: event.target.value })} placeholder="Số lượt nộp" className="rounded border px-2 py-2 text-sm" />
                    <select
                      value={selection.recipient_mode}
                      onChange={(event) => {
                        updateSelection(classItem.id, { recipient_mode: event.target.value });
                        if (event.target.value === 'selected') loadStudents(classItem.id);
                      }}
                      className="rounded border px-2 py-2 text-sm"
                    >
                      <option value="all">Toàn bộ lớp</option>
                      <option value="selected">Học sinh cụ thể</option>
                    </select>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={selection.is_published} onChange={(event) => updateSelection(classItem.id, { is_published: event.target.checked })} />
                      Giao ngay
                    </label>
                    {selection.recipient_mode === 'selected' && (
                      <div className="md:col-span-4 max-h-40 overflow-y-auto rounded bg-gray-50 p-3">
                        <button type="button" className="mb-2 text-sm font-medium text-blue-600" onClick={() => updateSelection(classItem.id, { student_ids: classStudents.map((student) => student.user_id) })}>
                          Chọn toàn bộ học sinh
                        </button>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {classStudents.map((student) => (
                            <label key={student.user_id} className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={selection.student_ids.includes(student.user_id)}
                                onChange={(event) => updateSelection(classItem.id, {
                                  student_ids: event.target.checked
                                    ? [...selection.student_ids, student.user_id]
                                    : selection.student_ids.filter((id) => id !== student.user_id),
                                })}
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
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2">Hủy</button>
          <button type="button" onClick={submit} disabled={saving} className="rounded-lg bg-[#2563EB] px-4 py-2 text-white disabled:opacity-50">
            {saving ? 'Đang giao...' : 'Giao bài'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AssignmentDeliveryModal;
