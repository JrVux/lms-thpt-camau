const IconBadge = ({ icon: Icon, color = 'red', size = 11, className = '' }) => {
  const palette = {
    red: 'bg-badge-red-bg text-badge-red-text',
    green: 'bg-badge-green-bg text-badge-green-text',
    purple: 'bg-badge-purple-bg text-badge-purple-text',
    orange: 'bg-badge-orange-bg text-badge-orange-text',
    blue: 'bg-badge-blue-bg text-badge-blue-text',
    gray: 'bg-gray-100 text-gray-500',
  };
  const sizes = {
    9: 'h-9 w-9 rounded-lg',
    10: 'h-10 w-10 rounded-xl',
    11: 'h-11 w-11 rounded-xl',
    12: 'h-12 w-12 rounded-xl',
  };
  return (
    <span className={`flex flex-shrink-0 items-center justify-center ${sizes[size]} ${palette[color]} ${className}`}>
      {Icon && <Icon className={`${size === 9 ? 'h-4 w-4' : size === 12 ? 'h-5.5 w-5.5' : 'h-5 w-5'}`} />}
    </span>
  );
};

export default IconBadge;