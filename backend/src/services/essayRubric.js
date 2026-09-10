export const AI_ESSAY_MIME_TYPES = Object.freeze([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const normalizeEssayRubric = (rubric = []) => (Array.isArray(rubric) ? rubric : []).map((item) => ({
  id: String(item?.id || '').trim(),
  title: String(item?.title || '').trim(),
  description: String(item?.description || '').trim(),
  max_points: Number(item?.max_points),
  acceptance_notes: String(item?.acceptance_notes || '').trim(),
}));

export const rubricTotal = (rubric = []) => normalizeEssayRubric(rubric)
  .reduce((sum, item) => sum + (Number.isFinite(item.max_points) ? item.max_points : 0), 0);

export const validateEssayAiSettings = (input = {}, maxScore = input.max_score) => {
  if (input.ai_grading_enabled !== true) return null;
  if (input.submission_type !== 'essay') return 'Chỉ bài tự luận mới được bật chấm AI.';
  if (!String(input.essay_model_answer || '').trim()) return 'Vui lòng nhập đáp án mẫu.';
  if (!Number.isFinite(Number(maxScore)) || Number(maxScore) <= 0) return 'Điểm tối đa phải lớn hơn 0.';
  const rubric = normalizeEssayRubric(input.essay_rubric);
  if (!rubric.length) return null;
  if (rubric.some((item) => !item.id || !item.title || !item.description)) return 'Mỗi ý cốt lõi phải có mã, tên và mô tả.';
  if (new Set(rubric.map((item) => item.id)).size !== rubric.length) return 'Mã ý cốt lõi không được trùng.';
  if (rubric.some((item) => !Number.isFinite(item.max_points) || item.max_points <= 0)) return 'Điểm từng ý phải lớn hơn 0.';
  if (Math.abs(rubricTotal(rubric) - Number(maxScore)) > 0.0001) return 'Tổng điểm các ý phải bằng tổng điểm của bài.';
  return null;
};
