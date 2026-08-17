import { useVisualizerStepper, CodeDisplay, VisualizerControls, StepDescription } from './common';

const generateForLoopSteps = () => {
  const steps = [];
  const n = 5;
  for (let i = 0; i <= n; i++) {
    steps.push({
      i,
      description: i < n
        ? `i = ${i}: i < ${n} → true, thực hiện thân lặp`
        : `i = ${i}: i < ${n} → false, kết thúc vòng lặp`,
      _index: i,
      highlightLine: i < n ? 2 : 4,
    });
  }
  return steps;
};

export const ForLoopVisualizer = () => {
  const steps = generateForLoopSteps();
  const stepper = useVisualizerStepper({ steps, intervalMs: 1000 });
  const current = stepper.current;

  return (
    <div>
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-brand-heading">Vòng lặp for</h3>
        <p className="text-sm text-brand-muted">Trực quan hóa cách vòng lặp for hoạt động với range(5)</p>
        <span className="inline-block mt-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Số lần lặp = n</span>
      </div>

      <StepDescription step={stepper.current} total={stepper.total} />

      <div className="mb-6 p-6 bg-white dark:bg-zinc-800/50 rounded-xl border border-brand-border shadow-sm">
        <div className="flex items-center justify-center gap-3 mb-4">
          {Array.from({ length: 5 }, (_, v) => (
            <div key={v} className={`w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold transition-all duration-300 shadow-sm
              ${stepper.current?.i === v ? 'bg-amber-400 text-white scale-125 ring-2 ring-amber-300' :
                stepper.current?.i !== undefined && v < stepper.current.i ? 'bg-green-100 text-green-700' :
                'bg-gray-100 text-gray-400'}`}>
              {v}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-center gap-2 text-xs text-brand-muted">
          <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded">Đang xét</span>
          <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded">Đã duyệt</span>
          <span className="px-2 py-0.5 bg-gray-100 text-gray-400 rounded">Chưa tới</span>
        </div>
        <div className="mt-4 text-center">
          <div className="inline-flex items-center gap-3 px-4 py-2 bg-gray-900 text-green-400 rounded-lg font-mono text-sm">
            <span className="text-gray-500">range(5) →</span>
            <span className="text-white">{Array.from({ length: 5 }, (_, v) => v).join(', ')}</span>
          </div>
        </div>
      </div>

      <CodeDisplay code={`for i in range(5):
    print(f"Lần lặp {i}")
print("Kết thúc")`} highlightLine={current?.highlightLine} />

      <VisualizerControls {...stepper} />
    </div>
  );
};

const generateWhileLoopSteps = () => {
  const steps = [];
  let n = 0;
  steps.push({ n, highlightLine: 1, description: 'Khởi tạo n = 0' });
  while (n < 4) {
    steps.push({ n, highlightLine: 2, description: `n = ${n}: n < 4 → true, vào thân lặp` });
    n++;
    steps.push({ n, highlightLine: 3, description: `n++ → n = ${n}` });
  }
  steps.push({ n, highlightLine: 2, description: `n = ${n}: n < 4 → false, kết thúc` });
  return steps.map((s, i) => ({ ...s, _index: i }));
};

export const WhileLoopVisualizer = () => {
  const steps = generateWhileLoopSteps();
  const stepper = useVisualizerStepper({ steps, intervalMs: 1200 });
  const current = stepper.current;

  return (
    <div>
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-brand-heading">Vòng lặp while</h3>
        <p className="text-sm text-brand-muted">Trực quan hóa vòng lặp while với điều kiện n &lt; 4</p>
        <span className="inline-block mt-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Lặp khi điều kiện còn đúng</span>
      </div>

      <StepDescription step={stepper.current} total={stepper.total} />

      <div className="mb-6 p-6 bg-white dark:bg-zinc-800/50 rounded-xl border border-brand-border shadow-sm">
        <div className="flex items-center justify-center gap-4">
          <div className="text-center">
            <p className="text-xs text-brand-muted mb-2">Giá trị n</p>
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold transition-all duration-300 shadow-md
              ${current?.n !== undefined && current?.n < 4 ? 'bg-amber-400 text-white' :
                current?.n !== undefined && current?.n >= 4 ? 'bg-green-500 text-white' :
                'bg-gray-100 text-gray-400'}`}>
              {current?.n ?? 0}
            </div>
          </div>
          <div className="text-2xl text-gray-300">→</div>
          <div className="text-center">
            <p className="text-xs text-brand-muted mb-2">Điều kiện</p>
            <div className={`w-24 h-16 rounded-2xl flex items-center justify-center text-sm font-bold shadow-md
              ${current?.n !== undefined && current?.n < 4 ? 'bg-green-100 text-green-700 border-2 border-green-400' :
                current?.n !== undefined && current?.n >= 4 ? 'bg-red-100 text-red-700 border-2 border-red-400' :
                'bg-gray-100 text-gray-400'}`}>
              n &lt; 4 → {current?.n < 4 ? 'true' : 'false'}
            </div>
          </div>
        </div>
      </div>

      <CodeDisplay code={`n = 0
while n < 4:
    print(n)
    n += 1`} highlightLine={current?.highlightLine} />

      <VisualizerControls {...stepper} />
    </div>
  );
};