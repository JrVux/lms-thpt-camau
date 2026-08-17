import { useState } from 'react';
import { useVisualizerStepper, CodeDisplay, VisualizerControls, StepDescription, ArrayBar } from './common';

const generateKnapsackSteps = () => {
  const items = [{ w: 2, v: 3 }, { w: 3, v: 4 }, { w: 4, v: 5 }, { w: 5, v: 6 }];
  const capacity = 8;
  const n = items.length;
  const dp = Array.from({ length: n + 1 }, () => Array(capacity + 1).fill(0));
  const steps = [];

  steps.push({ dp: dp.map(r => [...r]), i: 0, w: 0, description: 'Khởi tạo bảng DP 0' });
  for (let i = 1; i <= n; i++) {
    for (let w = 1; w <= capacity; w++) {
      if (items[i - 1].w <= w) {
        const include = items[i - 1].v + dp[i - 1][w - items[i - 1].w];
        const exclude = dp[i - 1][w];
        dp[i][w] = Math.max(include, exclude);
        steps.push({
          dp: dp.map(r => [...r]), i, w,
          item: items[i - 1],
          include, exclude, chosen: include >= exclude,
          description: `Vật ${i} (w=${items[i - 1].w}, v=${items[i - 1].v}) — ba lô ${w}kg: max(${include}, ${exclude}) = ${dp[i][w]}`,
        });
      } else {
        dp[i][w] = dp[i - 1][w];
        steps.push({ dp: dp.map(r => [...r]), i, w, description: `Vật ${i} quá nặng cho ba lô ${w}kg, giữ ${dp[i][w]}` });
      }
    }
  }
  steps.push({ dp: dp.map(r => [...r]), i: n, w: capacity, description: `Kết quả: giá trị tối đa = ${dp[n][capacity]}` });
  return steps.map((s, idx) => ({ ...s, _index: idx }));
};

export const DpKnapsackVisualizer = () => {
  const steps = generateKnapsackSteps();
  const stepper = useVisualizerStepper({ steps, intervalMs: 600 });
  const current = stepper.current;
  const dp = current?.dp || Array.from({ length: 5 }, () => Array(9).fill(0));

  return (
    <div>
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-brand-heading">Quy hoạch động — Bài toán Ba lô (Knapsack)</h3>
        <p className="text-sm text-brand-muted">Các vật: (2,3), (3,4), (4,5), (5,6) — Sức chứa: 8. Tìm giá trị lớn nhất.</p>
        <span className="inline-block mt-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">O(n×W) — DP bảng</span>
      </div>

      <StepDescription step={stepper.current} total={stepper.total} />

      <div className="mb-6 overflow-x-auto">
        <table className="border-collapse mx-auto text-[10px] font-mono">
          <thead>
            <tr>
              <th className="px-1.5 py-1 border border-gray-200 bg-gray-50 text-gray-500">i\w</th>
              {Array.from({ length: 9 }, (_, w) => (
                <th key={w} className={`px-1.5 py-1 border border-gray-200 text-gray-500 ${w === current?.w ? 'bg-amber-100' : 'bg-gray-50'}`}>{w}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dp.map((row, i) => (
              <tr key={i}>
                <td className={`px-1.5 py-1 border border-gray-200 font-bold text-gray-500 ${i === current?.i ? 'bg-amber-100' : 'bg-gray-50'}`}>{i}</td>
                {row.map((cell, w) => {
                  const isCurrent = i === current?.i && w === current?.w;
                  const isUpdated = current?.dp?.[i]?.[w] !== undefined && current?.dp?.[i]?.[w] !== (steps[stepper.step - 1]?.dp?.[i]?.[w] ?? -1);
                  return (
                    <td key={w} className={`px-1.5 py-1 border border-gray-200 text-center transition-colors ${
                      isCurrent ? 'bg-amber-200 font-bold text-amber-900' :
                      isUpdated ? 'bg-green-100 text-green-800' :
                      cell > 0 ? 'text-gray-700' : 'text-gray-400'
                    }`}>
                      {cell}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CodeDisplay code={`def knapsack(values, weights, capacity):
    n = len(values)
    dp = [[0]*(capacity+1) for _ in range(n+1)]
    for i in range(1, n+1):
        for w in range(1, capacity+1):
            if weights[i-1] <= w:
                dp[i][w] = max(
                    values[i-1] + dp[i-1][w-weights[i-1]],
                    dp[i-1][w]
                )
            else:
                dp[i][w] = dp[i-1][w]
    return dp[n][capacity]`} />
      <VisualizerControls {...stepper} />
    </div>
  );
};