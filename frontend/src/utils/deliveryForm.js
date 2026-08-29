export const buildDeliveryPayload = (classSelections) => {
  const deliveries = Object.entries(classSelections)
    .filter(([, selection]) => selection.selected)
    .map(([classId, selection]) => {
      const studentIds = [...new Set(selection.student_ids ?? [])];
      if (selection.recipient_mode === 'selected' && studentIds.length === 0) {
        throw new Error('Vui lòng chọn ít nhất một học sinh cho mỗi lớp chỉ định.');
      }
      return {
        class_id: classId,
        recipient_mode: selection.recipient_mode || 'all',
        student_ids: selection.recipient_mode === 'selected' ? studentIds : [],
        due_date: selection.due_date || null,
        is_published: selection.is_published !== undefined ? Boolean(selection.is_published) : true,
        max_submissions: selection.max_submissions
          ? Number(selection.max_submissions)
          : null,
      };
    });
  if (deliveries.length === 0) throw new Error('Vui lòng chọn ít nhất một lớp.');
  return { deliveries };
};
