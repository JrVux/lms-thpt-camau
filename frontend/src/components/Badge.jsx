const Badge = ({ children, color = 'blue', className = '' }) => {
  const palette = {
    red: 'bg-badge-red-bg text-badge-red-text',
    green: 'bg-badge-green-bg text-badge-green-text',
    purple: 'bg-badge-purple-bg text-badge-purple-text',
    orange: 'bg-badge-orange-bg text-badge-orange-text',
    blue: 'bg-badge-blue-bg text-badge-blue-text',
    gray: 'bg-gray-100 text-gray-500',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${palette[color]} ${className}`}>
      {children}
    </span>
  );
};

export default Badge;