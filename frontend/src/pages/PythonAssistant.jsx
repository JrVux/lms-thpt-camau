import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { Send, Bot, User, BookOpen, ChevronRight, GraduationCap, Loader2, Globe } from 'lucide-react';

const BRANCH_LABELS = { 'dai-tra': 'Đại trà (SGK Bài 16-32)', hsg: 'HSG & Luyện thi' };

const initMessages = (nhanh) => [{
  role: 'assistant',
  content: `Xin chào! Bạn đang ở nhánh **${BRANCH_LABELS[nhanh]}**. Mình có thể giúp gì cho bạn về Python hôm nay?`,
}];

const suggestQuestions = {
  'dai-tra': [
    'Vòng lặp for trong Python hoạt động thế nào?',
    'Giải thích câu lệnh if-else có ví dụ',
    'Cách dùng list trong Python',
    'Bài 20: Câu lệnh lặp for',
  ],
  hsg: [
    'Đệ quy là gì? Cho ví dụ',
    'So sánh nhanh và chậm của các thuật toán sắp xếp',
    'Cách dùng dict và set trong Python',
    'Bài toán quay lui (backtracking)',
  ],
};

const PythonAssistant = () => {
  const { user } = useAuth();
  const [nhanh, setNhanh] = useState(user?.role === 'student' ? 'dai-tra' : 'dai-tra');
  const [messages, setMessages] = useState(initMessages('dai-tra'));
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggested, setSuggested] = useState(suggestQuestions['dai-tra']);
  const [sources, setSources] = useState([]);
  const [showSources, setShowSources] = useState(false);
  const [webResults, setWebResults] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (messages.length === 1) {
      setSuggested(suggestQuestions[nhanh]);
    }
  }, [nhanh, messages.length]);

  const switchBranch = (b) => {
    setNhanh(b);
    setMessages(initMessages(b));
    setSuggested(suggestQuestions[b]);
    setSources([]);
    setShowSources(false);
    setWebResults(null);
  };

  const sendMessage = async (question) => {
    const q = question || input;
    if (!q.trim() || loading) return;
    setInput('');
    setSuggested([]);

    const userMsg = { role: 'user', content: q.trim() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setLoading(true);
    setSources([]);
    setWebResults(null);

    try {
      const lichSu = updatedMessages.slice(-6).map(m => ({ vai: m.role, noi_dung: m.content }));
      const res = await api.post('/api/python-assistant/chat', {
        question: q.trim(),
        nhanh,
        lichSu,
      });
      const { reply, nguon_tham_khao, hinh_anh, web_search } = res.data.data;
      setMessages(prev => [...prev, { role: 'assistant', content: reply, images: hinh_anh }]);
      if (nguon_tham_khao?.length) {
        setSources(nguon_tham_khao);
      }
      if (web_search?.results?.length) {
        setWebResults(web_search);
      }
    } catch (err) {
      const errMsg = err.response?.data?.message || 'Không thể kết nối đến trợ lý. Vui lòng thử lại.';
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ ${errMsg}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-9rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-brand-heading">Trợ lý Python</h2>
            <p className="text-xs text-brand-muted">Hỏi đáp về Python — RAG trên tài liệu giáo viên</p>
          </div>
        </div>
        <div className="flex gap-1 bg-gray-100 dark:bg-white/10 rounded-lg p-1">
          <button onClick={() => switchBranch('dai-tra')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${nhanh === 'dai-tra' ? 'bg-white dark:bg-zinc-700 text-brand shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <GraduationCap className="h-3.5 w-3.5 inline mr-1" />Đại trà
          </button>
          <button onClick={() => switchBranch('hsg')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${nhanh === 'hsg' ? 'bg-white dark:bg-zinc-700 text-brand shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <BookOpen className="h-3.5 w-3.5 inline mr-1" />HSG
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-2 mb-4 scrollbar-thin">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'assistant' && (
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white">
                <Bot className="h-4 w-4" />
              </div>
            )}
            <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-brand text-white rounded-br-md'
                : 'bg-gray-50 dark:bg-zinc-800/50 border border-brand-border rounded-bl-md'
            }`}>
              <div className="whitespace-pre-wrap">{msg.content}</div>
              {msg.images?.length > 0 && (
                <div className="mt-2 flex gap-2 flex-wrap">
                  {msg.images.map((img) => (
                    <img key={img.id} src={img.file_path} alt={img.mo_ta || ''}
                      className="max-w-[200px] rounded-lg border border-brand-border" />
                  ))}
                </div>
              )}
            </div>
            {msg.role === 'user' && (
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-light flex items-center justify-center text-brand text-sm font-semibold">
                {user?.full_name?.charAt(0) || 'U'}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white">
              <Bot className="h-4 w-4" />
            </div>
            <div className="bg-gray-50 dark:bg-zinc-800/50 border border-brand-border rounded-2xl rounded-bl-md px-4 py-3">
              <Loader2 className="h-5 w-5 animate-spin text-brand-muted" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested questions */}
      {suggested.length > 0 && messages.length <= 2 && (
        <div className="mb-3 flex-shrink-0">
          <p className="text-xs text-brand-muted mb-2">Gợi ý câu hỏi:</p>
          <div className="flex flex-wrap gap-2">
            {suggested.map((q, i) => (
              <button key={i} onClick={() => sendMessage(q)}
                className="px-3 py-1.5 text-xs font-medium rounded-full border border-brand-border bg-white dark:bg-zinc-800 text-brand-body hover:bg-brand-light hover:border-brand transition-colors">
                {q} <ChevronRight className="h-3 w-3 inline" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sources */}
      {sources.length > 0 && (
        <div className="mb-3 flex-shrink-0">
          <button onClick={() => setShowSources(!showSources)}
            className="text-xs text-brand-muted hover:text-brand flex items-center gap-1">
            <BookOpen className="h-3 w-3" /> {showSources ? 'Ẩn' : 'Xem'} nguồn tham khảo ({sources.length})
          </button>
          {showSources && (
            <div className="mt-1 space-y-1 max-h-24 overflow-y-auto">
              {sources.map((s, i) => (
                <div key={i} className="text-xs text-gray-500 bg-gray-50 dark:bg-zinc-800/30 rounded-lg px-3 py-1.5">
                  {s.ten_file} — {s.chuyen_de} ({s.muc_do || 'N/A'})
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Web search results */}
      {webResults?.results?.length > 0 && (
        <div className="mb-3 flex-shrink-0">
          <div className="flex items-center gap-1 text-xs text-brand-muted mb-1">
            <Globe className="h-3 w-3" /> Tra cứu web ({webResults.source})
          </div>
          <div className="space-y-1 max-h-24 overflow-y-auto">
            {webResults.results.map((r, i) => (
              <a key={i} href={r.url} target="_blank" rel="noopener noreferrer"
                className="block text-xs bg-blue-50 dark:bg-blue-900/20 rounded-lg px-3 py-1.5 text-blue-700 dark:text-blue-300 hover:underline">
                {r.title}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="flex-shrink-0 flex gap-2">
        <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
          placeholder="Nhập câu hỏi về Python..."
          disabled={loading}
          className="flex-1 px-4 py-2.5 border border-brand-border rounded-xl text-sm outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand disabled:bg-gray-50 disabled:cursor-not-allowed" />
        <button onClick={() => sendMessage()} disabled={!input.trim() || loading}
          className="px-4 py-2.5 bg-brand text-white rounded-xl hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed transition-colors">
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default PythonAssistant;