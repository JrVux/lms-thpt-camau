import { Award, CheckCircle2, Lightbulb } from 'lucide-react';

export default function EssayPublishedResult({ result, maxScore = 10 }) {
  if (!result) return null;
  return <div className="space-y-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5">
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2 font-semibold text-emerald-300"><Award size={18} /> Kết quả giáo viên đã công bố</div>
      <div className="text-xl font-bold text-emerald-300">{result.score} / {maxScore} điểm</div>
    </div>
    {result.feedback && <p className="whitespace-pre-wrap text-sm text-slate-200">{result.feedback}</p>}
    {result.criteria_results?.length > 0 && <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Giải thích theo từng nội dung</div>
      {result.criteria_results.map((item) => <div key={item.rubric_item_id} className="rounded-lg border border-slate-700/70 bg-slate-900/50 p-3">
        <div className="flex items-center justify-between text-sm"><span className="font-medium text-slate-200">{item.title || item.rubric_item_id}</span><span className="font-semibold text-emerald-300">{item.awarded_points} điểm</span></div>
        {(item.explanation || item.feedback) && <p className="mt-1 text-xs leading-relaxed text-slate-400">{item.explanation || item.feedback}</p>}
      </div>)}
    </div>}
    <div className="grid gap-3 md:grid-cols-2">
      {result.strengths?.length > 0 && <div className="rounded-lg bg-slate-900/40 p-3"><div className="mb-2 flex items-center gap-1 text-xs font-semibold text-emerald-300"><CheckCircle2 size={14} /> Điểm làm tốt</div><ul className="list-disc space-y-1 pl-4 text-xs text-slate-300">{result.strengths.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
      {result.improvements?.length > 0 && <div className="rounded-lg bg-slate-900/40 p-3"><div className="mb-2 flex items-center gap-1 text-xs font-semibold text-amber-300"><Lightbulb size={14} /> Cần cải thiện</div><ul className="list-disc space-y-1 pl-4 text-xs text-slate-300">{result.improvements.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
    </div>
    {result.model_answer && <details className="rounded-lg border border-slate-700 bg-slate-900/50 p-3"><summary className="cursor-pointer text-sm font-semibold text-violet-300">Xem đáp án mẫu</summary><div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{result.model_answer}</div></details>}
  </div>;
}
