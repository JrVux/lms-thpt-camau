import { Loader2 } from 'lucide-react';

const LoadingSpinner = ({ text = 'Đang tải...' }) => (
  <div className="flex flex-col items-center justify-center py-16 text-brand-muted">
    <Loader2 className="mb-3 h-7 w-7 animate-spin text-brand" />
    <span className="text-sm">{text}</span>
  </div>
);
export default LoadingSpinner;