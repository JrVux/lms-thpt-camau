import { Plus, Trash2, Sparkles } from 'lucide-react';
import { AI_ESSAY_FILE_MIME_TYPES } from '../utils/fileSubmission';

const emptyCriterion = () => ({
  id: `core-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  title: '', description: '', max_points: 1, acceptance_notes: '',
});

export default function EssayAiGradingFields({ value, onChange, maxScore }) {
  const rubric = value.essay_rubric || [];
  const total = rubric.reduce((sum, item) => sum + Number(item.max_points || 0), 0);
  const updateCriterion = (index, key, nextValue) => onChange({
    ...value,
    essay_rubric: rubric.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: nextValue } : item),
  });

  const setEnabled = (enabled) => onChange({
    ...value,
    ai_grading_enabled: enabled,
    allowed_mime_types: enabled ? AI_ESSAY_FILE_MIME_TYPES : value.allowed_mime_types,
    essay_rubric: enabled && rubric.length === 0 ? [emptyCriterion()] : rubric,
  });

  return (
    <div className="space-y-4 rounded-xl border border-violet-500/30 bg-violet-950/20 p-4">
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" checked={Boolean(value.ai_grading_enabled)} onChange={(event) => setEnabled(event.target.checked)} className="mt-1 h-4 w-4" />
        <span>
          <span className="flex items-center gap-2 font-semibold text-violet-200"><Sparkles size={16} /> Chấm tự luận tự động bằng AI</span>
          <span className="mt-1 block text-xs text-slate-400">AI tạo bản chấm nháp. Giáo viên phải duyệt rồi mới có thể công bố cho học sinh.</span>
        </span>
      </label>

      {value.ai_grading_enabled && <>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-200">Đáp án mẫu <span className="text-rose-400">*</span></label>
          <textarea rows={7} value={value.essay_model_answer || ''} onChange={(event) => onChange({ ...value, essay_model_answer: event.target.value })} placeholder="Nhập đáp án mẫu đầy đủ để AI đối chiếu..." className="w-full rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-slate-200" />
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-slate-200">Nội dung cốt lõi và thang điểm</div>
              <div className={`text-xs ${Number(maxScore) > 0 && total === Number(maxScore) ? 'text-emerald-400' : 'text-amber-300'}`}>Tổng tiêu chí: {total} / {Number(maxScore) || 0} điểm</div>
            </div>
            <button type="button" onClick={() => onChange({ ...value, essay_rubric: [...rubric, emptyCriterion()] })} className="flex items-center gap-1 rounded-lg border border-violet-500/40 px-3 py-1.5 text-xs text-violet-200"><Plus size={14} /> Thêm ý</button>
          </div>
          {rubric.map((item, index) => (
            <div key={item.id} className="grid gap-2 rounded-lg border border-slate-700 bg-slate-900/60 p-3 md:grid-cols-12">
              <input value={item.title || ''} onChange={(event) => updateCriterion(index, 'title', event.target.value)} placeholder="Tên ý cốt lõi" className="rounded border border-slate-700 bg-slate-950 p-2 text-sm text-slate-200 md:col-span-8" />
              <input type="number" min="0.25" step="0.25" value={item.max_points ?? ''} onChange={(event) => updateCriterion(index, 'max_points', event.target.value)} className="rounded border border-slate-700 bg-slate-950 p-2 text-sm text-slate-200 md:col-span-3" aria-label="Điểm tối đa" />
              <button type="button" onClick={() => onChange({ ...value, essay_rubric: rubric.filter((_, itemIndex) => itemIndex !== index) })} className="flex items-center justify-center rounded text-rose-300 md:col-span-1" aria-label="Xóa tiêu chí"><Trash2 size={16} /></button>
              <textarea rows={2} value={item.description || ''} onChange={(event) => updateCriterion(index, 'description', event.target.value)} placeholder="Mô tả nội dung học sinh cần đạt" className="rounded border border-slate-700 bg-slate-950 p-2 text-sm text-slate-200 md:col-span-6" />
              <textarea rows={2} value={item.acceptance_notes || ''} onChange={(event) => updateCriterion(index, 'acceptance_notes', event.target.value)} placeholder="Cách diễn đạt tương đương được chấp nhận" className="rounded border border-slate-700 bg-slate-950 p-2 text-sm text-slate-200 md:col-span-6" />
            </div>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={Boolean(value.show_model_answer_after_publish)} onChange={(event) => onChange({ ...value, show_model_answer_after_publish: event.target.checked })} />
          Cho học sinh xem đáp án mẫu trong kết quả đã công bố
        </label>
      </>}
    </div>
  );
}
