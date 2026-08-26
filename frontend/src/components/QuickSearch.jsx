import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Users, FileCode2, Library, GraduationCap, X, Loader2 } from 'lucide-react';
import api from '../services/api';

export default function QuickSearch({ onSelectResult }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ classes: [], assignments: [], topics: [], students: [] });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const inputRef = useRef(null);

  // Keyboard shortcut (Cmd+K / Ctrl+K / /)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults({ classes: [], assignments: [], topics: [], students: [] });
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults({ classes: [], assignments: [], topics: [], students: [] });
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      api.get(`/api/search?q=${encodeURIComponent(query.trim())}`)
        .then(({ data }) => setResults(data))
        .catch(() => setResults({ classes: [], assignments: [], topics: [], students: [] }))
        .finally(() => setLoading(false));
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (path) => {
    setOpen(false);
    if (onSelectResult) onSelectResult();
    navigate(path);
  };

  const hasResults =
    results.classes.length > 0 ||
    results.assignments.length > 0 ||
    results.topics.length > 0 ||
    results.students.length > 0;

  return (
    <>
      {/* Sidebar search trigger box */}
      <div className="px-4 pb-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-2 rounded-lg border border-brand-border bg-gray-50 px-3 py-2 text-left text-gray-400 transition-colors hover:border-brand/40 hover:bg-gray-100 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
        >
          <Search className="h-4 w-4" />
          <span className="text-sm">Tìm nhanh học sinh, bài tập, lớp...</span>
          <kbd className="ml-auto rounded border border-gray-200 bg-white px-1.5 text-[10px] font-medium text-gray-400 dark:border-white/10 dark:bg-white/10">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Full Modal Search Dialog */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-16 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-zinc-900">
            {/* Input Header */}
            <div className="flex items-center border-b border-gray-200 px-4 py-3 dark:border-zinc-800">
              <Search className="h-5 w-5 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm nhanh học sinh, bài tập, lớp học, chủ đề..."
                className="ml-3 flex-1 bg-transparent text-base outline-none dark:text-white"
              />
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin text-brand" />
              ) : query ? (
                <button type="button" onClick={() => setQuery('')} className="p-1 text-gray-400 hover:text-gray-600">
                  <X className="h-5 w-5" />
                </button>
              ) : null}
            </div>

            {/* Results Body */}
            <div className="max-h-[60vh] overflow-y-auto p-4 scrollbar-thin">
              {!query.trim() ? (
                <div className="py-8 text-center text-sm text-gray-400">
                  Nhập tên học sinh, tiêu đề bài tập, tên lớp hoặc chủ đề để tìm nhanh...
                </div>
              ) : !loading && !hasResults ? (
                <div className="py-8 text-center text-sm text-gray-400">
                  Không tìm thấy kết quả phù hợp cho &quot;{query}&quot;
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Học sinh */}
                  {results.students.length > 0 && (
                    <div>
                      <div className="mb-2 flex items-center gap-1.5 px-2 text-xs font-semibold uppercase tracking-wider text-brand">
                        <GraduationCap className="h-3.5 w-3.5" /> Học sinh ({results.students.length})
                      </div>
                      <div className="space-y-1">
                        {results.students.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleSelect(item.path)}
                            className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-brand-light/60 dark:hover:bg-zinc-800"
                          >
                            <span className="font-medium text-gray-800 dark:text-gray-200">{item.title}</span>
                            <span className="text-xs text-gray-400">{item.subtitle}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Lớp học */}
                  {results.classes.length > 0 && (
                    <div>
                      <div className="mb-2 flex items-center gap-1.5 px-2 text-xs font-semibold uppercase tracking-wider text-blue-600">
                        <Users className="h-3.5 w-3.5" /> Lớp học ({results.classes.length})
                      </div>
                      <div className="space-y-1">
                        {results.classes.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleSelect(item.path)}
                            className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-blue-50 dark:hover:bg-zinc-800"
                          >
                            <span className="font-medium text-gray-800 dark:text-gray-200">{item.title}</span>
                            <span className="text-xs text-gray-400">{item.subtitle}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Bài tập */}
                  {results.assignments.length > 0 && (
                    <div>
                      <div className="mb-2 flex items-center gap-1.5 px-2 text-xs font-semibold uppercase tracking-wider text-purple-600">
                        <FileCode2 className="h-3.5 w-3.5" /> Bài tập ({results.assignments.length})
                      </div>
                      <div className="space-y-1">
                        {results.assignments.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleSelect(item.path)}
                            className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-purple-50 dark:hover:bg-zinc-800"
                          >
                            <span className="font-medium text-gray-800 dark:text-gray-200">{item.title}</span>
                            <span className="text-xs text-gray-400">{item.subtitle}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Chủ đề bài tập */}
                  {results.topics.length > 0 && (
                    <div>
                      <div className="mb-2 flex items-center gap-1.5 px-2 text-xs font-semibold uppercase tracking-wider text-emerald-600">
                        <Library className="h-3.5 w-3.5" /> Chủ đề bài tập ({results.topics.length})
                      </div>
                      <div className="space-y-1">
                        {results.topics.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleSelect(item.path)}
                            className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-emerald-50 dark:hover:bg-zinc-800"
                          >
                            <span className="font-medium text-gray-800 dark:text-gray-200">{item.title}</span>
                            <span className="text-xs text-gray-400">{item.subtitle}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-400 dark:border-zinc-800 dark:bg-zinc-950">
              <span>Bấm <kbd className="rounded bg-gray-200 px-1 dark:bg-zinc-800">ESC</kbd> để đóng</span>
              <span>LMS THPT Cà Mau</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
