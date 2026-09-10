const Empty = ({ children }) => <p className="text-xs italic text-slate-500">{children}</p>;

const AnalysisSection = ({ title, items, tone = 'slate', evidence = false }) => {
  const toneClass = tone === 'green'
    ? 'border-emerald-500/30 bg-emerald-500/10'
    : tone === 'red'
      ? 'border-rose-500/30 bg-rose-500/10'
      : 'border-slate-700 bg-slate-950/40';
  return <section className="space-y-2">
    <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-300">{title}</h4>
    {items?.length ? items.map((item, index) => <div key={`${title}-${index}`} className={`rounded-lg border p-3 ${toneClass}`}>
      <p className="text-sm text-slate-200">{item.description}</p>
      {item.explanation && <p className="mt-1 text-xs leading-relaxed text-slate-400">{item.explanation}</p>}
      {evidence && item.evidence_snippets?.length > 0 && <p className="mt-1 text-[11px] italic text-slate-500">Dẫn chứng: {item.evidence_snippets.join(' · ')}</p>}
    </div>) : <Empty>Không có nội dung trong nhóm này.</Empty>}
  </section>;
};

export default function EssayPercentageReview({
  report,
  maxScore,
  percentage,
  score,
  feedback,
  onPercentageChange,
  onScoreChange,
  onFeedbackChange,
}) {
  const analysis = report?.ai_content_analysis || {};
  const confidence = Number(analysis.confidence);
  const extractionLabel = {
    sufficient: 'Đủ rõ để chấm',
    uncertain: 'Chưa chắc chắn, cần kiểm tra',
    empty: 'Không đọc được nội dung',
  }[report?.extraction_quality] || 'Chưa xác định';
  return <div className="space-y-4">
    <div className="grid gap-4 md:grid-cols-2">
      <label className="text-xs font-medium text-slate-400">
        Phần trăm nội dung đúng
        <div className="mt-1 flex items-center gap-2">
          <input type="number" min="0" max="100" step="0.1" value={percentage} onChange={(event) => onPercentageChange(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-sm font-semibold text-slate-100" />
          <span className="text-slate-300">%</span>
        </div>
      </label>
      <label className="text-xs font-medium text-slate-400">
        Điểm đề xuất
        <div className="mt-1 flex items-center gap-2">
          <input type="number" min="0" max={maxScore} step="0.1" value={score} onChange={(event) => onScoreChange(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-sm font-semibold text-slate-100" />
          <span className="whitespace-nowrap text-slate-300">/ {maxScore}</span>
        </div>
      </label>
    </div>

    <AnalysisSection title="Nội dung làm đúng" items={analysis.correct_content} tone="green" evidence />
    <AnalysisSection title="Nội dung thiếu hoặc sai" items={analysis.missing_or_incorrect_content} />
    <AnalysisSection title="Nội dung mâu thuẫn" items={analysis.contradictions} tone="red" />

    <div className="grid gap-3 md:grid-cols-2">
      <section className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
        <h4 className="mb-2 text-xs font-semibold text-emerald-300">Điểm làm tốt</h4>
        {report?.ai_strengths?.length ? <ul className="list-disc space-y-1 pl-4 text-xs text-slate-300">{report.ai_strengths.map((item, index) => <li key={index}>{item}</li>)}</ul> : <Empty>Chưa có nhận xét.</Empty>}
      </section>
      <section className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
        <h4 className="mb-2 text-xs font-semibold text-amber-300">Hướng cải thiện</h4>
        {report?.ai_improvements?.length ? <ul className="list-disc space-y-1 pl-4 text-xs text-slate-300">{report.ai_improvements.map((item, index) => <li key={index}>{item}</li>)}</ul> : <Empty>Chưa có nhận xét.</Empty>}
      </section>
    </div>

    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
      <span>Chất lượng trích xuất: {extractionLabel}</span>
      <span>Độ tin cậy AI: {Number.isFinite(confidence) ? `${Math.round(confidence * 100)}%` : 'Chưa xác định'}</span>
    </div>

    <label className="block text-xs font-medium text-slate-400">
      Nhận xét của giáo viên
      <textarea rows={3} value={feedback} onChange={(event) => onFeedbackChange(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-sm text-slate-100" placeholder="Nhập nhận xét gửi học sinh..." />
    </label>
  </div>;
}
