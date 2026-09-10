import { Sparkles } from 'lucide-react';
import { AI_ESSAY_FILE_MIME_TYPES } from '../utils/fileSubmission';

export default function EssayAiGradingFields({ value, onChange }) {
  const setEnabled = (enabled) => onChange({
    ...value,
    ai_grading_enabled: enabled,
    allowed_mime_types: enabled ? AI_ESSAY_FILE_MIME_TYPES : value.allowed_mime_types,
    essay_rubric: [],
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
          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            AI sẽ so sánh bài làm với đáp án mẫu theo ý nghĩa, đề xuất phần trăm nội dung đúng và giải thích chi tiết. Giáo viên phải duyệt trước khi công bố.
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={Boolean(value.show_model_answer_after_publish)} onChange={(event) => onChange({ ...value, show_model_answer_after_publish: event.target.checked })} />
          Cho học sinh xem đáp án mẫu trong kết quả đã công bố
        </label>
      </>}
    </div>
  );
}
