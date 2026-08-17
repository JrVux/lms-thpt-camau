import { useState, useEffect, useRef, useCallback } from 'react';

export const useVisualizerStepper = ({ steps, intervalMs = 1000, initialStep = 0 }) => {
  const [step, setStep] = useState(initialStep);
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef(null);
  const total = steps?.length || 0;

  const play = useCallback(() => {
    if (step >= total - 1) { setStep(0); setPlaying(true); }
    else setPlaying(true);
  }, [step, total]);

  const pause = useCallback(() => setPlaying(false), []);
  const reset = useCallback(() => { setPlaying(false); setStep(0); }, []);
  const next = useCallback(() => setStep(s => Math.min(s + 1, total - 1)), [total]);
  const prev = useCallback(() => setStep(s => Math.max(s - 1, 0)), []);

  useEffect(() => {
    if (!playing) return;
    timerRef.current = setInterval(() => {
      setStep(s => { if (s >= total - 1) { setPlaying(false); return s; } return s + 1; });
    }, intervalMs);
    return () => clearInterval(timerRef.current);
  }, [playing, total, intervalMs]);

  return { step, setStep, playing, play, pause, reset, next, prev, total, current: steps?.[step] };
};

export const CodeDisplay = ({ code, highlightLine, language = 'python' }) => {
  const lines = code?.split('\n') || [];
  return (
    <div className="rounded-xl bg-gray-900 overflow-hidden shadow-lg">
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex gap-1.5"><div className="w-3 h-3 rounded-full bg-red-500" /><div className="w-3 h-3 rounded-full bg-yellow-500" /><div className="w-3 h-3 rounded-full bg-green-500" /></div>
        <span className="text-xs text-gray-400 ml-2">{language === 'python' ? 'main.py' : 'algo.py'}</span>
      </div>
      <div className="p-4 font-mono text-sm leading-6 overflow-x-auto">
        {lines.map((line, i) => (
          <div key={i} className={`px-3 py-0.5 rounded whitespace-pre ${highlightLine === i + 1 ? 'bg-amber-500/20 text-amber-300 border-l-2 border-amber-400' : 'text-gray-300'}`}>
            <span className="text-gray-600 mr-3 select-none w-8 inline-block text-right">{i + 1}</span>
            {line || ' '}
          </div>
        ))}
      </div>
    </div>
  );
};

export const VisualizerControls = ({ playing, onPlay, onPause, onReset, onPrev, onNext, step, total, disabled = false }) => (
  <div className="flex items-center gap-2 mt-4">
    <button onClick={onReset} disabled={disabled} className="p-2 rounded-lg border border-brand-border hover:bg-gray-50 text-gray-500 disabled:opacity-30">
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
    </button>
    <button onClick={onPrev} disabled={disabled || step === 0} className="p-2 rounded-lg border border-brand-border hover:bg-gray-50 text-gray-500 disabled:opacity-30">
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
    </button>
    <button onClick={playing ? onPause : onPlay} disabled={disabled}
      className="px-4 py-2 rounded-lg bg-brand text-white hover:bg-red-700 disabled:bg-red-300 text-sm font-medium flex items-center gap-2">
      {playing
        ? <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
        : <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>}
      {playing ? 'Dừng' : 'Chạy'}
    </button>
    <button onClick={onNext} disabled={disabled || step >= total - 1} className="p-2 rounded-lg border border-brand-border hover:bg-gray-50 text-gray-500 disabled:opacity-30">
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
    </button>
    <span className="text-xs text-gray-400 ml-2">Bước {step + 1}/{total}</span>
  </div>
);

export const ArrayBar = ({ value, maxVal, label, color = 'bg-blue-500', width = 28, height = 160 }) => {
  const pct = maxVal > 0 ? (value / maxVal) * 100 : 0;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-end" style={{ height }}>
        <div className={`${color} rounded-t transition-all duration-300`} style={{ width, height: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-mono text-gray-500">{label ?? value}</span>
    </div>
  );
};

export const StepDescription = ({ step, total }) => {
  if (!step) return null;
  return (
    <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl text-sm text-amber-800 dark:text-amber-300">
      Bước {step._index + 1}/{total}: {step.description}
    </div>
  );
};