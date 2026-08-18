import { AlertTriangle } from 'lucide-react';

const ConfirmDialog = ({ open, title, message, confirmLabel = 'Xác nhận', onConfirm, onCancel, tone = 'danger' }) => {
  if (!open) return null;
  const isDanger = tone === 'danger';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-card-hover animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-3">
          <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${isDanger ? 'bg-badge-red-bg text-badge-red-text' : 'bg-badge-blue-bg text-badge-blue-text'}`}>
            <AlertTriangle className="h-5 w-5" />
          </span>
          <h3 className="text-base font-semibold text-brand-heading">{title}</h3>
        </div>
        <p className="text-sm leading-relaxed text-brand-body">{message}</p>
        <div className="mt-5 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-brand-border px-4 py-2.5 text-sm font-medium text-brand-body transition-colors hover:bg-gray-50"
          >
            Hủy
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors ${
              isDanger ? 'bg-brand hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
export default ConfirmDialog;