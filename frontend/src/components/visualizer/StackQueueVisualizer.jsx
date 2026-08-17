import { useVisualizerStepper, CodeDisplay, VisualizerControls, StepDescription } from './common';

const generateStackSteps = () => {
  const steps = [];
  const stack = [];
  steps.push({ stack: [...stack], operation: 'init', description: 'Stack rỗng', _index: 0 });
  const ops = [
    { op: 'push', val: 1, desc: 'Push(1) — thêm 1 vào đỉnh stack' },
    { op: 'push', val: 2, desc: 'Push(2) — thêm 2 vào đỉnh stack' },
    { op: 'push', val: 3, desc: 'Push(3) — thêm 3 vào đỉnh stack' },
    { op: 'pop', val: null, desc: 'Pop() — lấy phần tử trên cùng: 3' },
    { op: 'pop', val: null, desc: 'Pop() — lấy phần tử trên cùng: 2' },
    { op: 'push', val: 4, desc: 'Push(4) — thêm 4 vào đỉnh stack' },
    { op: 'pop', val: null, desc: 'Pop() — lấy phần tử trên cùng: 4' },
    { op: 'pop', val: null, desc: 'Pop() — lấy phần tử trên cùng: 1' },
  ];
  for (const op of ops) {
    if (op.op === 'push') stack.push(op.val);
    else stack.pop();
    steps.push({ stack: [...stack], operation: op.op, description: op.desc, _index: steps.length });
  }
  steps.push({ stack: [...stack], operation: 'done', description: 'Stack rỗng — kết thúc', _index: steps.length });
  return steps;
};

const generateQueueSteps = () => {
  const steps = [];
  const queue = [];
  steps.push({ queue: [...queue], operation: 'init', description: 'Queue rỗng', _index: 0 });
  const ops = [
    { op: 'enqueue', val: 1, desc: 'Enqueue(1) — thêm 1 vào cuối hàng' },
    { op: 'enqueue', val: 2, desc: 'Enqueue(2) — thêm 2 vào cuối hàng' },
    { op: 'enqueue', val: 3, desc: 'Enqueue(3) — thêm 3 vào cuối hàng' },
    { op: 'dequeue', val: null, desc: 'Dequeue() — lấy phần tử đầu hàng: 1' },
    { op: 'dequeue', val: null, desc: 'Dequeue() — lấy phần tử đầu hàng: 2' },
    { op: 'enqueue', val: 4, desc: 'Enqueue(4) — thêm 4 vào cuối hàng' },
    { op: 'dequeue', val: null, desc: 'Dequeue() — lấy phần tử đầu hàng: 3' },
    { op: 'dequeue', val: null, desc: 'Dequeue() — lấy phần tử đầu hàng: 4' },
  ];
  for (const op of ops) {
    if (op.op === 'enqueue') queue.push(op.val);
    else queue.shift();
    steps.push({ queue: [...queue], operation: op.op, description: op.desc, _index: steps.length });
  }
  steps.push({ queue: [...queue], operation: 'done', description: 'Queue rỗng — kết thúc', _index: steps.length });
  return steps;
};

export const StackQueueVisualizer = () => {
  const stackSteps = generateStackSteps();
  const queueSteps = generateQueueSteps();
  const stackStepper = useVisualizerStepper({ steps: stackSteps, intervalMs: 900 });
  const queueStepper = useVisualizerStepper({ steps: queueSteps, intervalMs: 900 });

  const StackPanel = () => {
    const data = stackStepper.current?.stack || [];
    return (
      <div className="flex-1 p-4 bg-white dark:bg-zinc-800/50 rounded-xl border border-brand-border shadow-sm">
        <h4 className="text-sm font-semibold text-brand-heading mb-2">Stack (LIFO)</h4>
        <div className="flex flex-col items-center gap-1 min-h-[200px] justify-end">
          {data.length === 0 && <span className="text-xs text-gray-400 italic">(rỗng)</span>}
          {data.map((val, i) => (
            <div key={i}
              className={`w-20 h-8 flex items-center justify-center rounded-lg text-xs font-bold transition-all duration-300
                ${i === data.length - 1 ? 'bg-amber-400 text-white shadow-md scale-110' :
                  'bg-blue-100 text-blue-700'}`}>
              {val}
              {i === data.length - 1 && <span className="ml-1 text-[8px] opacity-60">← đỉnh</span>}
            </div>
          ))}
        </div>
        <StepDescription step={stackStepper.current} total={stackStepper.total} />
        <VisualizerControls {...stackStepper} />
      </div>
    );
  };

  const QueuePanel = () => {
    const data = queueStepper.current?.queue || [];
    return (
      <div className="flex-1 p-4 bg-white dark:bg-zinc-800/50 rounded-xl border border-brand-border shadow-sm">
        <h4 className="text-sm font-semibold text-brand-heading mb-2">Queue (FIFO)</h4>
        <div className="relative flex items-center min-h-[200px] gap-1 justify-center">
          {data.length === 0 && <span className="text-xs text-gray-400 italic">(rỗng)</span>}
          {data.map((val, i) => (
            <div key={i} className="relative"
              style={{ width: 56, height: `${Math.min(60 + i * 8, 140)}px` }}>
              <div className={`w-full h-full flex items-center justify-center rounded-lg text-xs font-bold transition-all duration-300
                ${i === 0 ? 'bg-green-400 text-white shadow-md scale-110' :
                  i === data.length - 1 ? 'bg-amber-200 text-amber-800' :
                  'bg-blue-100 text-blue-700'}`}>
                {val}
              </div>
              {i === 0 && <span className="absolute -right-12 top-1/2 -translate-y-1/2 text-[8px] text-gray-400 whitespace-nowrap">đầu →</span>}
            </div>
          ))}
        </div>
        <StepDescription step={queueStepper.current} total={queueStepper.total} />
        <VisualizerControls {...queueStepper} />
      </div>
    );
  };

  return (
    <div>
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-brand-heading">Stack & Queue</h3>
        <p className="text-sm text-brand-muted">Stack (LIFO) và Queue (FIFO) — hai cấu trúc dữ liệu cơ bản</p>
        <div className="flex gap-2 mt-1">
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">Stack: push/pop — O(1)</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">Queue: enqueue/dequeue — O(1)</span>
        </div>
      </div>
      <div className="flex gap-4">
        <StackPanel />
        <QueuePanel />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <CodeDisplay code={`stack = []  # LIFO
stack.append(1)  # push
stack.append(2)
top = stack.pop()  # 2`} />
        <CodeDisplay code={`from collections import deque
queue = deque()  # FIFO
queue.append(1)  # enqueue
queue.append(2)
first = queue.popleft()  # 1`} />
      </div>
    </div>
  );
};