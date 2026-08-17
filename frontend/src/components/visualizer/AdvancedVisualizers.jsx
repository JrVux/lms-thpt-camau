import { useState } from 'react';
import { useVisualizerStepper, CodeDisplay, VisualizerControls, StepDescription } from './common';

// Simplified segment tree with array steps
const arr = [1, 3, 5, 7, 9, 11];
const buildSteps = () => {
  const steps = [];
  const n = arr.length;
  const seg = Array(n * 4).fill(0);
  const build = (idx, l, r) => {
    if (l === r) { seg[idx] = arr[l]; steps.push({ seg: [...seg], idx, l, r, val: arr[l], type: 'leaf', description: `Leaf [${l}]: = ${arr[l]}` }); return; }
    const mid = (l + r) >> 1;
    build(idx * 2, l, mid);
    build(idx * 2 + 1, mid + 1, r);
    seg[idx] = seg[idx * 2] + seg[idx * 2 + 1];
    steps.push({ seg: [...seg], idx, l, r, val: seg[idx], type: 'internal', description: `Node [${l},${r}] = sum([${l},${mid}]) + sum([${mid + 1},${r}]) = ${seg[idx]}` });
  };
  build(1, 0, n - 1);
  return steps.map((s, i) => ({ ...s, _index: i }));
};

export const SegmentTreeVisualizer = () => {
  const [customArr, setCustomArr] = useState(arr.join(', '));
  const steps = buildSteps();
  const stepper = useVisualizerStepper({ steps, intervalMs: 1000 });
  const current = stepper.current;

  return (
    <div>
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-brand-heading">Segment Tree — Cây phân đoạn</h3>
        <p className="text-sm text-brand-muted">Cấu trúc dữ liệu cho truy vấn tổng/min/max trên đoạn. O(log n)</p>
        <span className="inline-block mt-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">Xây dựng O(n) — Truy vấn O(log n)</span>
        <div className="mt-2 flex items-center gap-2">
          <input value={customArr} onChange={(e) => setCustomArr(e.target.value)}
            className="px-2 py-1 border border-brand-border rounded text-xs font-mono outline-none w-48" placeholder="1, 3, 5, 7, 9, 11" />
          <button onClick={() => stepper.reset()} className="text-xs px-2 py-1 bg-brand text-white rounded hover:bg-red-700">Xây lại</button>
        </div>
      </div>

      <StepDescription step={stepper.current} total={stepper.total} />

      <div className="mb-6 p-4 bg-white dark:bg-zinc-800/50 rounded-xl border border-brand-border shadow-sm flex flex-wrap gap-2 justify-center" style={{ minHeight: 120 }}>
        {arr.map((v, i) => (
          <div key={i} className="flex flex-col items-center">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold transition-colors
              ${current?.l === i && current?.r === i && current?.type === 'leaf' ? 'bg-green-500 text-white scale-110' : 'bg-blue-100 text-blue-700'}`}>
              {v}
            </div>
            <span className="text-[9px] text-brand-muted mt-0.5">[{i}]</span>
          </div>
        ))}
      </div>

      <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-xs font-mono">
        <p className="text-blue-700 dark:text-blue-300">Seg tree array (size {arr.length * 4}):</p>
        <p className="mt-1 text-blue-600 dark:text-blue-400 break-all">
          {current?.seg?.map((v, i) => i === current?.idx
            ? <span key={i} className="bg-amber-200 text-amber-900 px-1 rounded">{v}</span>
            : v > 0 && <span key={i} className="text-gray-600 dark:text-gray-400">{v} </span>
          )}
        </p>
      </div>

      <CodeDisplay code={`class SegmentTree:
    def __init__(self, arr):
        n = len(arr)
        self.seg = [0] * (4 * n)
        self._build(arr, 1, 0, n - 1)

    def _build(self, arr, idx, l, r):
        if l == r:
            self.seg[idx] = arr[l]
            return
        mid = (l + r) // 2
        self._build(arr, idx*2, l, mid)
        self._build(arr, idx*2+1, mid+1, r)
        self.seg[idx] = self.seg[idx*2] + self.seg[idx*2+1]`} />
      <VisualizerControls {...stepper} />
    </div>
  );
};

const generateBigOSteps = () => {
  const ns = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  const complexities = [
    { label: 'O(1)', color: 'text-green-600', fn: n => 1 },
    { label: 'O(log n)', color: 'text-emerald-500', fn: n => Math.log2(n) },
    { label: 'O(n)', color: 'text-amber-500', fn: n => n },
    { label: 'O(n log n)', color: 'text-orange-500', fn: n => n * Math.log2(n) },
    { label: 'O(n²)', color: 'text-red-500', fn: n => n * n },
    { label: 'O(2ⁿ)', color: 'text-purple-600', fn: n => Math.min(Math.pow(2, n), 50000) },
  ];
  const steps = ns.map((n, i) => ({
    n,
    data: complexities.map(c => ({ label: c.label, color: c.color, value: Math.round(c.fn(n) * 10) / 10 })),
    description: `n = ${n}`,
    _index: i,
  }));
  return steps;
};

export const BigOVisualizer = () => {
  const steps = generateBigOSteps();
  const stepper = useVisualizerStepper({ steps, intervalMs: 1500 });
  const current = stepper.current;

  const maxVal = Math.max(...(current?.data?.map(d => d.value) || [1]), 1);

  return (
    <div>
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-brand-heading">Độ phức tạp thuật toán — Big-O</h3>
        <p className="text-sm text-brand-muted">So sánh tốc độ tăng của các độ phức tạp khi n tăng</p>
      </div>

      <StepDescription step={stepper.current} total={stepper.total} />

      <div className="mb-6 p-4 bg-white dark:bg-zinc-800/50 rounded-xl border border-brand-border shadow-sm">
        <div className="space-y-2">
          {current?.data?.map((d, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className={`w-20 text-xs font-bold ${d.color}`}>{d.label}</span>
              <div className="flex-1 bg-gray-100 dark:bg-zinc-700 rounded-full h-4 relative overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-500 ${d.color.replace('text-', 'bg-')} opacity-70`}
                  style={{ width: `${Math.min((d.value / maxVal) * 100, 100)}%` }} />
              </div>
              <span className={`w-16 text-right text-xs font-mono ${d.color}`}>{d.value.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {[
          { label: 'O(1)', desc: 'Truy cập mảng, bảng băm', color: 'text-green-600', ex: 'arr[i]' },
          { label: 'O(log n)', desc: 'Tìm kiếm nhị phân', color: 'text-emerald-500', ex: 'binary_search' },
          { label: 'O(n)', desc: 'Duyệt mảng một lần', color: 'text-amber-500', ex: 'for x in arr' },
          { label: 'O(n log n)', desc: 'Sắp xếp hiệu quả', color: 'text-orange-500', ex: 'merge_sort, quick_sort' },
          { label: 'O(n²)', desc: 'Vòng lặp lồng nhau', color: 'text-red-500', ex: 'bubble_sort' },
          { label: 'O(2ⁿ)', desc: 'Đệ quy nhân đôi', color: 'text-purple-600', ex: 'fibonacci đệ quy' },
        ].map((c, i) => (
          <div key={i} className="p-3 bg-gray-50 dark:bg-zinc-800/30 rounded-xl border border-brand-border">
            <span className={`text-xs font-bold ${c.color}`}>{c.label}</span>
            <p className="text-[10px] text-brand-muted mt-0.5">{c.desc}</p>
            <code className="text-[9px] text-gray-400">{c.ex}</code>
          </div>
        ))}
      </div>

      <VisualizerControls {...stepper} />
    </div>
  );
};