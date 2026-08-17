import { useParams, Link } from 'react-router-dom';
import { Code2, ArrowLeft } from 'lucide-react';
import { SortingVisualizer } from '../components/visualizer/SortingVisualizer';
import { NQueensVisualizer } from '../components/visualizer/NQueensVisualizer';
import { BfsVisualizer, DfsVisualizer } from '../components/visualizer/GraphVisualizer';
import { DpKnapsackVisualizer } from '../components/visualizer/DpKnapsackVisualizer';
import { SegmentTreeVisualizer, BigOVisualizer } from '../components/visualizer/AdvancedVisualizers';
import { ForLoopVisualizer, WhileLoopVisualizer } from '../components/visualizer/LoopVisualizer';
import { StackQueueVisualizer } from '../components/visualizer/StackQueueVisualizer';

const visualizers = {
  'vong-lap-for': {
    title: 'Vòng lặp for', desc: 'Trực quan hóa for với range(5)',
    component: ForLoopVisualizer, props: {}, icon: '🔄',
  },
  'vong-lap-while': {
    title: 'Vòng lặp while', desc: 'Trực quan hóa while với điều kiện n < 4',
    component: WhileLoopVisualizer, props: {}, icon: '🔄',
  },
  'stack-queue': {
    title: 'Stack & Queue', desc: 'Mô phỏng LIFO và FIFO',
    component: StackQueueVisualizer, props: {}, icon: '📚',
  },
  'bubble-sort': {
    title: 'Sắp xếp nổi bọt', desc: 'Bubble Sort — O(n²)', component: SortingVisualizer, props: { algo: 'bubble' }, icon: '🫧',
  },
  'selection-sort': {
    title: 'Sắp xếp chọn', desc: 'Selection Sort — O(n²)', component: SortingVisualizer, props: { algo: 'selection' }, icon: '🔍',
  },
  'merge-sort': {
    title: 'Sắp xếp trộn', desc: 'Merge Sort — O(n log n)', component: SortingVisualizer, props: { algo: 'merge' }, icon: '🔀',
  },
  'quick-sort': {
    title: 'Sắp xếp nhanh', desc: 'Quick Sort — O(n log n)', component: SortingVisualizer, props: { algo: 'quick' }, icon: '⚡',
  },
  'n-queens': {
    title: 'N-Queens', desc: 'Xếp hậu bằng Backtracking', component: NQueensVisualizer, props: {}, icon: '♛',
  },
  'bfs': {
    title: 'BFS', desc: 'Duyệt theo chiều rộng', component: BfsVisualizer, props: {}, icon: '📋',
  },
  'dfs': {
    title: 'DFS', desc: 'Duyệt theo chiều sâu', component: DfsVisualizer, props: {}, icon: '📚',
  },
  'dp-knapsack': {
    title: 'Knapsack DP', desc: 'Bài toán ba lô — Quy hoạch động', component: DpKnapsackVisualizer, props: {}, icon: '🎒',
  },
  'segment-tree': {
    title: 'Segment Tree', desc: 'Cây phân đoạn — xây dựng và truy vấn', component: SegmentTreeVisualizer, props: {}, icon: '🌳',
  },
  'big-o': {
    title: 'Độ phức tạp Big-O', desc: 'So sánh O(1), O(log n), O(n), O(n log n), O(n²), O(2ⁿ)',
    component: BigOVisualizer, props: {}, icon: '📈',
  },
};

const VisualizerDemo = () => {
  const { slug } = useParams();
  const viz = visualizers[slug];

  if (!viz) {
    return (
      <div className="max-w-3xl mx-auto">
        <Link to="/python-assistant" className="text-sm text-brand hover:text-red-700 flex items-center gap-1 mb-4">
          <ArrowLeft className="h-4 w-4" /> Về trợ lý
        </Link>
        <div className="text-center py-10 text-brand-muted">
          <Code2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Chọn một mô phỏng:</p>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3 max-w-lg mx-auto">
            {Object.entries(visualizers).map(([key, v]) => (
              <Link key={key} to={`/visualizer/${key}`}
                className="p-3 bg-white dark:bg-zinc-800 rounded-xl border border-brand-border hover:shadow-md hover:border-brand transition-all text-left">
                <span className="text-lg">{v.icon}</span>
                <p className="text-xs font-semibold text-brand-heading mt-1">{v.title}</p>
                <p className="text-[10px] text-brand-muted">{v.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const Component = viz.component;
  return (
    <div className="max-w-3xl mx-auto">
      <Link to="/visualizer" className="text-sm text-brand hover:text-red-700 flex items-center gap-1 mb-4">
        <ArrowLeft className="h-4 w-4" /> Tất cả mô phỏng
      </Link>
      <Component {...viz.props} />
    </div>
  );
};

export default VisualizerDemo;