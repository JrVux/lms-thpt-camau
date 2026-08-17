import { useVisualizerStepper, CodeDisplay, VisualizerControls, ArrayBar, StepDescription } from './common';

const sortAlgorithms = {
  bubble: {
    title: 'Sắp xếp nổi bọt (Bubble Sort)',
    description: 'So sánh và đổi chỗ các cặp phần tử liền kề. O(n²)',
    complexity: 'O(n²) — Ổn định, tại chỗ',
    code: `def bubble_sort(arr):
    n = len(arr)
    for i in range(n-1):
        for j in range(n-1-i):
            if arr[j] > arr[j+1]:
                arr[j], arr[j+1] = arr[j+1], arr[j]
    return arr`,
  },
  selection: {
    title: 'Sắp xếp chọn (Selection Sort)',
    description: 'Tìm phần tử nhỏ nhất và đưa về đầu. O(n²)',
    complexity: 'O(n²) — Không ổn định, tại chỗ',
    code: `def selection_sort(arr):
    n = len(arr)
    for i in range(n-1):
        min_idx = i
        for j in range(i+1, n):
            if arr[j] < arr[min_idx]:
                min_idx = j
        arr[i], arr[min_idx] = arr[min_idx], arr[i]
    return arr`,
  },
  merge: {
    title: 'Sắp xếp trộn (Merge Sort)',
    description: 'Chia để trị: chia đôi mảng, sắp xếp từng nửa, trộn lại. O(n log n)',
    complexity: 'O(n log n) — Ổn định, O(n) bộ nhớ phụ',
    code: `def merge_sort(arr):
    if len(arr) <= 1: return arr
    mid = len(arr) // 2
    left = merge_sort(arr[:mid])
    right = merge_sort(arr[mid:])
    return merge(left, right)

def merge(left, right):
    res = []
    i = j = 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            res.append(left[i]); i += 1
        else:
            res.append(right[j]); j += 1
    return res + left[i:] + right[j:]`,
  },
  quick: {
    title: 'Sắp xếp nhanh (Quick Sort)',
    description: 'Chọn pivot, phân hoạch, đệ quy. O(n log n) trung bình',
    complexity: 'O(n log n) TB / O(n²) xấu nhất — Không ổn định, tại chỗ',
    code: `def quick_sort(arr, low, high):
    if low < high:
        p = partition(arr, low, high)
        quick_sort(arr, low, p - 1)
        quick_sort(arr, p + 1, high)

def partition(arr, low, high):
    pivot = arr[high]
    i = low - 1
    for j in range(low, high):
        if arr[j] <= pivot:
            i += 1
            arr[i], arr[j] = arr[j], arr[i]
    arr[i+1], arr[high] = arr[high], arr[i+1]
    return i + 1`,
  },
};

const initialArray = [29, 10, 14, 37, 13, 33, 48, 22];

const generateSortSteps = (algo) => {
  const arr = [...initialArray];
  const steps = [];
  const snapshot = () => steps.push({ arr: [...arr], ...(steps.length === 0 ? {} : {}) });
  snapshot();

  const algoKey = algo === sortAlgorithms.bubble ? 'bubble' : algo === sortAlgorithms.selection ? 'selection' : '';

  if (algoKey === 'bubble') {
    const n = arr.length;
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < n - 1 - i; j++) {
        steps.push({ arr: [...arr], comparing: [j, j + 1], description: `So sánh arr[${j}]=${arr[j]} và arr[${j + 1}]=${arr[j + 1]}` });
        if (arr[j] > arr[j + 1]) {
          [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
          steps.push({ arr: [...arr], swapped: [j, j + 1], description: `Đổi chỗ ${arr[j + 1]} và ${arr[j]}` });
        }
      }
      steps.push({ arr: [...arr], sortedUpTo: n - 1 - i, description: `Phần tử lớn nhất đã về đúng vị trí cuối` });
    }
  } else if (algoKey === 'selection') {
    const n = arr.length;
    for (let i = 0; i < n - 1; i++) {
      let minIdx = i;
      steps.push({ arr: [...arr], comparing: [i], description: `Bắt đầu tìm phần tử nhỏ nhất từ vị trí ${i}` });
      for (let j = i + 1; j < n; j++) {
        steps.push({ arr: [...arr], comparing: [minIdx, j], description: `So sánh arr[${minIdx}]=${arr[minIdx]} và arr[${j}]=${arr[j]}` });
        if (arr[j] < arr[minIdx]) { minIdx = j; steps.push({ arr: [...arr], comparing: [minIdx], description: `Phần tử nhỏ nhất mới tại ${minIdx}` }); }
      }
      if (minIdx !== i) {
        [arr[i], arr[minIdx]] = [arr[minIdx], arr[i]];
        steps.push({ arr: [...arr], swapped: [i, minIdx], sortedUpTo: i, description: `Đưa ${arr[i]} về đúng vị trí ${i}` });
      }
    }
  } else {
    steps.push({ arr: [...arr], description: 'Mảng ban đầu' });
    steps.push({ arr: [...arr], description: 'Đã sắp xếp (demo)' });
  }

  return steps.map((s, i) => ({ ...s, _index: i }));
};

export const SortingVisualizer = ({ algo }) => {
  const algorithm = sortAlgorithms[algo];
  if (!algorithm) return <div className="text-center py-10 text-brand-muted">Không tìm thấy thuật toán</div>;

  const steps = generateSortSteps(algorithm);
  const stepper = useVisualizerStepper({ steps, intervalMs: 800 });
  const current = stepper.current;
  const data = current?.arr || initialArray;
  const maxVal = Math.max(...data, 1);

  const getBarColor = (i) => {
    if (current?.swapped?.includes(i)) return 'bg-green-500';
    if (current?.comparing?.includes(i)) return 'bg-amber-500';
    if (current?.sortedUpTo !== undefined && i >= current.sortedUpTo) return 'bg-blue-300';
    return 'bg-blue-500';
  };

  return (
    <div>
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-brand-heading">{algorithm.title}</h3>
        <p className="text-sm text-brand-muted">{algorithm.description}</p>
        <span className="inline-block mt-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">{algorithm.complexity}</span>
      </div>

      <StepDescription step={stepper.current} total={stepper.total} />

      <div className="mb-6 p-6 bg-white dark:bg-zinc-800/50 rounded-xl border border-brand-border shadow-sm flex items-end justify-center gap-1" style={{ minHeight: 220 }}>
        {data.map((val, i) => (
          <ArrayBar key={i} value={val} maxVal={maxVal} label={val} color={getBarColor(i)} />
        ))}
      </div>

      <CodeDisplay code={algorithm.code} highlightLine={undefined} />
      <VisualizerControls {...stepper} />
    </div>
  );
};