import { useState, useCallback } from 'react';
import { useVisualizerStepper, CodeDisplay, VisualizerControls, StepDescription } from './common';

const N = 4;
const solveNQueens = (n) => {
  const solutions = [];
  const board = Array.from({ length: n }, () => Array(n).fill(0));
  const cols = new Set(), diag1 = new Set(), diag2 = new Set();
  const steps = [];

  const snapshot = (board, row, col, type) => {
    steps.push({
      board: board.map(r => [...r]),
      currentRow: row, currentCol: col,
      description: type === 'place' ? `Đặt hậu tại (${row + 1}, ${col + 1})` :
        type === 'remove' ? `Không đặt được, gỡ hậu (${row + 1}, ${col + 1})` :
        type === 'done' ? `Tìm thấy lời giải!` : `Thử (${row + 1}, ${col + 1})`,
      _index: steps.length,
    });
  };

  const backtrack = (row) => {
    if (row === n) { snapshot(board, -1, -1, 'done'); return true; }
    const found = false;
    for (let col = 0; col < n; col++) {
      if (cols.has(col) || diag1.has(row - col) || diag2.has(row + col)) {
        snapshot(board, row, col, 'skip');
        continue;
      }
      board[row][col] = 1;
      cols.add(col); diag1.add(row - col); diag2.add(row + col);
      snapshot(board, row, col, 'place');
      if (backtrack(row + 1)) return true;
      board[row][col] = 0;
      cols.delete(col); diag1.delete(row - col); diag2.delete(row + col);
      snapshot(board, row, col, 'remove');
    }
    return false;
  };

  backtrack(0);
  return steps.map((s, i) => ({ ...s, _index: i }));
};

export const NQueensVisualizer = () => {
  const [n, setN] = useState(N);
  const steps = solveNQueens(n);
  const stepper = useVisualizerStepper({ steps, intervalMs: 1000 });
  const current = stepper.current;
  const board = current?.board || Array.from({ length: n }, () => Array(n).fill(0));

  const isHighlighted = (r, c) => current?.currentRow === r && current?.currentCol === c;

  return (
    <div>
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-brand-heading">N-Queens (Backtracking)</h3>
        <p className="text-sm text-brand-muted">Xếp N quân hậu trên bàn cờ N×N sao cho không quân nào ăn nhau. Quay lui khi không đặt được.</p>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs text-brand-muted">Kích thước:</span>
          {[4, 5, 6].map(v => (
            <button key={v} onClick={() => { setN(v); stepper.reset(); }}
              className={`px-2 py-0.5 text-xs rounded ${n === v ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {v}×{v}
            </button>
          ))}
        </div>
      </div>

      <StepDescription step={stepper.current} total={stepper.total} />

      <div className="mb-6 flex justify-center">
        <div className="grid gap-0.5 rounded-lg overflow-hidden shadow-lg" style={{ gridTemplateColumns: `repeat(${n}, 48px)` }}>
          {board.map((row, r) => row.map((cell, c) => {
            const isDark = (r + c) % 2 === 0;
            const hl = isHighlighted(r, c);
            const highlightType = current?.board?.[r]?.[c] === 1 && stepper.current?.description?.includes('gỡ') ? 'remove' : '';
            return (
              <div key={`${r}-${c}`} className={`w-12 h-12 flex items-center justify-center text-xl transition-colors duration-300 ${
                isDark ? 'bg-gray-800' : 'bg-amber-100'
              } ${hl ? 'ring-2 ring-amber-400 ring-inset' : ''} ${
                highlightType === 'remove' ? 'bg-red-200' : ''
              }`}>
                {cell === 1 ? <span className="text-2xl drop-shadow-lg">♛</span> : ''}
              </div>
            );
          }))}
        </div>
      </div>

      <CodeDisplay code={`def solve_n_queens(n):
    board = [[0]*n for _ in range(n)]
    cols, d1, d2 = set(), set(), set()

    def backtrack(row):
        if row == n: return True
        for col in range(n):
            if col in cols or (row-col) in d1 or (row+col) in d2:
                continue
            board[row][col] = 1
            cols.add(col); d1.add(row-col); d2.add(row+col)
            if backtrack(row + 1): return True
            board[row][col] = 0
            cols.remove(col); d1.remove(row-col); d2.remove(row+col)
        return False

    backtrack(0)
    return board`} />
      <VisualizerControls {...stepper} />
    </div>
  );
};