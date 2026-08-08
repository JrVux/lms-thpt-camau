const btn = {
  primary: 'bg-brand text-white hover:bg-red-600',
  blue: 'bg-blue-600 text-white hover:bg-blue-700',
  green: 'bg-emerald-600 text-white hover:bg-emerald-700',
  orange: 'bg-orange-500 text-white hover:bg-orange-600',
  purple: 'bg-purple-600 text-white hover:bg-purple-700',
  outline: 'border border-brand-border text-brand-body hover:bg-gray-50',
  ghost: 'text-gray-600 hover:bg-gray-50',
  danger: 'bg-brand text-white hover:bg-red-700',
  dangerOutline: 'border border-brand-border text-brand hover:bg-brand-light',
  yellow: 'bg-amber-500 text-white hover:bg-amber-600',
};

const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  className = '',
  ...props
}) => {
  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-sm',
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${sizes[size]} ${btn[variant]} ${className}`}
      {...props}
    >
      {Icon && <Icon className="h-4 w-4" />}
      {children}
    </button>
  );
};

export default Button;