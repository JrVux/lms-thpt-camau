const LoadingSpinner = ({ text = 'Đang tải...' }) => (
  <div className="flex flex-col items-center justify-center py-16 text-gray-400">
    <svg className="animate-spin h-8 w-8 mb-3 text-[#2563EB]" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
    <span className="text-sm">{text}</span>
  </div>
);
export default LoadingSpinner;
