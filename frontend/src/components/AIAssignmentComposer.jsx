import { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import api from '../services/api';
import Button from './Button';

export default function AIAssignmentComposer({ initialSubject, onApply, onClose }) {
  const [request, setRequest] = useState('');
  const [subject, setSubject] = useState(initialSubject || '');
  const [difficulty, setDifficulty] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const generate = async () => {
    setLoading(true); setError('');
    try {
      const { data } = await api.post('/api/ai/assignment-drafts', {
        request, ...(subject ? { subject } : {}), ...(difficulty ? { difficulty: Number(difficulty) } : {}),
      });
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tạo bài bằng AI.');
    } finally { setLoading(false); }
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Soạn bài tập bằng AI">
    <div className="w-full max-w-2xl rounded-2xl bg-card p-6 shadow-xl">
      <div className="flex justify-between"><h2 className="flex items-center gap-2 text-xl font-semibold"><Sparkles className="h-5 w-5 text-brand" />Soạn bằng AI</h2><button type="button" aria-label="Đóng" onClick={onClose}><X /></button></div>
      <p className="mt-2 text-sm text-brand-muted">Dán yêu cầu hoặc một bài mẫu. AI chỉ điền bản nháp, chưa tự lưu.</p>
      <textarea className="mt-4 min-h-40 w-full rounded-lg border p-3" maxLength={12000} value={request} onChange={(e) => setRequest(e.target.value)} placeholder="Ví dụ: Tạo bài Python về vòng lặp for..." />
      <div className="mt-3 grid grid-cols-2 gap-3"><select aria-label="Môn học" className="rounded-lg border p-2" value={subject} onChange={(e) => setSubject(e.target.value)}><option value="">Tự nhận diện</option><option value="python">Python — lớp 10</option><option value="sql">SQL — lớp 11</option><option value="html">HTML/CSS — lớp 12</option></select><select aria-label="Độ khó" className="rounded-lg border p-2" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}><option value="">AI chọn độ khó</option>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>Mức {value}</option>)}</select></div>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {result ? <div className="mt-3 rounded-lg bg-page p-3 text-sm">Đã nhận diện: <b>{result.draft.type}</b> — lớp {result.draft.grade}{result.generation.fallback_used ? ' (đã dùng Gemini dự phòng)' : ''}</div> : null}
      <div className="mt-5 flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Đóng</Button>{result ? <Button type="button" onClick={() => onApply(result.draft)}>Điền vào biểu mẫu</Button> : <Button type="button" disabled={loading || !request.trim()} onClick={generate}>{loading ? 'Đang tạo...' : 'Tạo bản nháp'}</Button>}</div>
    </div>
  </div>;
}
