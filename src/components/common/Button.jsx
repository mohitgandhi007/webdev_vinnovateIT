import React from 'react';

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  icon,
  iconPosition = 'left',
  ...props
}) {
  const baseClasses = 'inline-flex items-center justify-center font-body-sm text-body-sm transition-all select-none disabled:opacity-50 disabled:pointer-events-none';
  
  const sizeClasses = {
    sm: 'px-2.5 py-1 text-xs rounded',
    md: 'px-space-md py-2.5 rounded',
    lg: 'px-6 py-3 text-base rounded-md'
  };

  const variantClasses = {
    primary: 'bg-primary hover:bg-primary-container text-on-primary font-medium shadow-sm active:scale-[0.99]',
    secondary: 'bg-transparent border border-outline-variant hover:bg-surface-container text-on-surface font-normal',
    ghost: 'bg-transparent hover:bg-surface-container text-on-surface-variant hover:text-on-surface',
    danger: 'bg-error hover:bg-error/90 text-on-error font-medium',
    subtle: 'bg-surface-container hover:bg-surface-container-high text-on-surface font-medium'
  };

  return (
    <button
      className={`${baseClasses} ${sizeClasses[size] || sizeClasses.md} ${variantClasses[variant] || variantClasses.primary} ${className}`}
      {...props}
    >
      {icon && iconPosition === 'left' && (
        <span className="material-symbols-outlined text-[18px] mr-1.5 shrink-0">{icon}</span>
      )}
      {children}
      {icon && iconPosition === 'right' && (
        <span className="material-symbols-outlined text-[18px] ml-1.5 shrink-0">{icon}</span>
      )}
    </button>
  );
}
