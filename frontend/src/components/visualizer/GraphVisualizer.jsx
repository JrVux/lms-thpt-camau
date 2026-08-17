import { useVisualizerStepper, CodeDisplay, VisualizerControls, StepDescription } from './common';

const graphData = {
  nodes: [
    { id: 0, label: 'A' }, { id: 1, label: 'B' }, { id: 2, label: 'C' },
    { id: 3, label: 'D' }, { id: 4, label: 'E' }, { id: 5, label: 'F' },
  ],
  edges: [[0,1],[0,2],[1,2],[1,3],[2,4],[3,4],[3,5],[4,5]],
  adjacency: {
    0: [1, 2], 1: [0, 2, 3], 2: [0, 1, 4],
    3: [1, 4, 5], 4: [2, 3, 5], 5: [3, 4],
  },
};

const generateBfsSteps = () => {
  const steps = [];
  const g = graphData.adjacency;
  const visited = new Set();
  const queue = [0];
  visited.add(0);
  steps.push({ visited: new Set(visited), queue: [...queue], current: 0, description: 'Bắt đầu từ A' });

  while (queue.length > 0) {
    const node = queue.shift();
    steps.push({ visited: new Set(visited), queue: [...queue], current: node, description: `Đang xử lý ${graphData.nodes[node].label} — lấy ra khỏi hàng đợi` });
    for (const neighbor of g[node]) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
        steps.push({ visited: new Set(visited), queue: [...queue], current: neighbor, description: `Thêm ${graphData.nodes[neighbor].label} vào hàng đợi` });
      }
    }
  }
  steps.push({ visited: new Set(visited), queue: [], current: -1, description: 'BFS hoàn tất' });
  return steps.map((s, i) => ({ ...s, _index: i }));
};

const generateDfsSteps = () => {
  const steps = [];
  const g = graphData.adjacency;
  const visited = new Set();
  const stack = [0];

  const dfs = (node) => {
    visited.add(node);
    steps.push({ visited: new Set(visited), stack: [...stack], current: node, description: `Thăm ${graphData.nodes[node].label}` });
    for (const neighbor of g[node]) {
      if (!visited.has(neighbor)) {
        stack.push(neighbor);
        dfs(neighbor);
        stack.pop();
      }
    }
  };
  dfs(0);
  steps.push({ visited: new Set(visited), stack: [], current: -1, description: 'DFS hoàn tất' });
  return steps.map((s, i) => ({ ...s, _index: i }));
};

const GraphNode = ({ id, label, isVisited, isCurrent, isInQueue, x, y }) => {
  const color = isCurrent ? 'bg-amber-500 text-white' : isVisited ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600';
  const ring = isInQueue && !isVisited ? 'ring-2 ring-amber-400' : '';
  return (
    <g>
      <circle cx={x} cy={y} r={22} className={`${color} ${ring} transition-all duration-300`} />
      <text x={x} y={y + 1} textAnchor="middle" className="text-xs font-bold fill-white" fontSize={12}>{label}</text>
    </g>
  );
};

export const BfsVisualizer = () => {
  const steps = generateBfsSteps();
  const stepper = useVisualizerStepper({ steps, intervalMs: 1200 });
  const current = stepper.current;

  const positions = [{x:200,y:30},{x:100,y:120},{x:300,y:120},{x:60,y:220},{x:250,y:220},{x:180,y:300}];

  return (
    <div>
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-brand-heading">BFS — Duyệt theo chiều rộng</h3>
        <p className="text-sm text-brand-muted">Dùng hàng đợi (queue), duyệt tầng theo tầng. O(V+E)</p>
        <span className="inline-block mt-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">O(V+E) — Dùng queue</span>
      </div>

      <StepDescription step={stepper.current} total={stepper.total} />

      <div className="mb-6 p-4 bg-white dark:bg-zinc-800/50 rounded-xl border border-brand-border shadow-sm flex justify-center">
        <svg width="380" height="340" viewBox="0 0 380 340">
          {graphData.edges.map(([from, to], i) => (
            <line key={i} x1={positions[from].x} y1={positions[from].y} x2={positions[to].x} y2={positions[to].y}
              className="stroke-gray-300 dark:stroke-zinc-600" strokeWidth={2} />
          ))}
          {graphData.nodes.map((n, i) => (
            <GraphNode key={n.id} {...n} x={positions[i].x} y={positions[i].y}
              isVisited={current?.visited?.has(n.id)}
              isCurrent={current?.current === n.id}
              isInQueue={current?.queue?.includes(n.id)} />
          ))}
        </svg>
      </div>

      <div className="mb-4 flex items-center gap-4 text-xs text-brand-muted">
        <span>Hàng đợi: <span className="font-mono font-bold text-brand">[{current?.queue?.map(i => graphData.nodes[i]?.label).join(', ') || ''}]</span></span>
        <span>Đã thăm: <span className="font-mono font-bold text-green-600">{current?.visited?.size || 0}</span></span>
      </div>

      <CodeDisplay code={`from collections import deque

def bfs(graph, start):
    visited = set()
    queue = deque([start])
    visited.add(start)

    while queue:
        node = queue.popleft()
        for neighbor in graph[node]:
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append(neighbor)
    return visited`} />
      <VisualizerControls {...stepper} />
    </div>
  );
};

export const DfsVisualizer = () => {
  const steps = generateDfsSteps();
  const stepper = useVisualizerStepper({ steps, intervalMs: 1200 });
  const current = stepper.current;

  const positions = [{x:200,y:30},{x:100,y:120},{x:300,y:120},{x:60,y:220},{x:250,y:220},{x:180,y:300}];

  return (
    <div>
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-brand-heading">DFS — Duyệt theo chiều sâu</h3>
        <p className="text-sm text-brand-muted">Dùng ngăn xếp (stack/đệ quy), đi sâu trước. O(V+E)</p>
        <span className="inline-block mt-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">O(V+E) — Dùng stack/đệ quy</span>
      </div>

      <StepDescription step={stepper.current} total={stepper.total} />

      <div className="mb-6 p-4 bg-white dark:bg-zinc-800/50 rounded-xl border border-brand-border shadow-sm flex justify-center">
        <svg width="380" height="340" viewBox="0 0 380 340">
          {graphData.edges.map(([from, to], i) => (
            <line key={i} x1={positions[from].x} y1={positions[from].y} x2={positions[to].x} y2={positions[to].y}
              className="stroke-gray-300 dark:stroke-zinc-600" strokeWidth={2} />
          ))}
          {graphData.nodes.map((n, i) => (
            <GraphNode key={n.id} {...n} x={positions[i].x} y={positions[i].y}
              isVisited={current?.visited?.has(n.id)}
              isCurrent={current?.current === n.id}
              isInQueue={current?.stack?.includes(n.id)} />
          ))}
        </svg>
      </div>

      <div className="mb-4 flex items-center gap-4 text-xs text-brand-muted">
        <span>Đã thăm: <span className="font-mono font-bold text-green-600">{current?.visited?.size || 0}</span></span>
      </div>

      <CodeDisplay code={`def dfs(graph, node, visited=None):
    if visited is None:
        visited = set()
    visited.add(node)
    for neighbor in graph[node]:
        if neighbor not in visited:
            dfs(graph, neighbor, visited)
    return visited`} />
      <VisualizerControls {...stepper} />
    </div>
  );
};