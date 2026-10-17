import React from 'react';

export default function IconButton({
  icon,
  title,
  onClick,
  className = '',
  size = 'md',
  variant = 'ghost',
  ...props
}) {
  const sizeClasses = {
    sm: 'p-1 text-[16px]',
    md: 'p-1.5 text-[20px]',
    lg: 'p-2.5 text-[24px]'
  };

  const variantClasses = {
    ghost: 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-full transition-colors',
    bordered: 'border border-outline-variant text-on-surface hover:bg-surface-container rounded transition-colors',
    pill: 'bg-surface-container-lowest text-on-surface-variant hover:text-on-surface rounded-full shadow-xs'
  };

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`inline-flex items-center justify-center transition-colors ${sizeClasses[size] || sizeClasses.md} ${variantClasses[variant] || variantClasses.ghost} ${className}`}
      {...props}
    >
      <span className="material-symbols-outlined text-inherit">{icon}</span>
    </button>
  );
}
