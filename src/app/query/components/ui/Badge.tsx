'use client';

import { cn, variants } from '@/app/query/design-system';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'accent' | 'status' | 'discrepancy' | 'barcode' | 'tag';
  status?: 'active' | 'completed' | 'pending' | 'error' | 'skipped' | 'archived';
  discrepancy?: number;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'px-1.5 py-0.5 text-[10px]',
  md: 'px-2 py-0.5 text-xs',
  lg: 'px-3 py-1 text-sm',
};

export function Badge({ 
  children, 
  variant = 'default', 
  status, 
  discrepancy, 
  className, 
  size = 'md' 
}: BadgeProps) {
  const baseClasses = `
    inline-flex items-center gap-1 
    font-medium rounded-full 
    ${sizeClasses[size]}
    transition-all duration-100 ease-out
  `;

  // Select variant class from design system
  const variantDef = variants.badge[variant] || variants.badge.default;
  
  // Handle function variants (status, discrepancy)
  let variantClass: string;
  if (typeof variantDef === 'function') {
    if (variant === 'status') {
      // Type assertion for status function
      const statusFn = variantDef as (type: 'active' | 'completed' | 'pending' | 'error' | 'skipped' | 'archived') => string;
      variantClass = statusFn(status || 'pending');
    } else {
      // Type assertion for discrepancy function
      const discrepancyFn = variantDef as (value: number) => string;
      variantClass = discrepancyFn(discrepancy ?? 0);
    }
  } else {
    variantClass = variantDef;
  }

  return (
    <span
      className={cn(baseClasses, variantClass, className)}
    >
      {children}
    </span>
  );
}

export interface StatusBadgeProps {
  status: 'active' | 'completed' | 'pending' | 'error' | 'skipped' | 'archived';
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const statusLabels: Record<string, string> = {
  active: '進行中',
  completed: '已完成',
  pending: '待處理',
  error: '錯誤',
  skipped: '已跳過',
  archived: '已封存',
};

export function StatusBadge({ status, label, size = 'md', className }: StatusBadgeProps) {
  return (
    <Badge 
      variant="status" 
      status={status} 
      size={size} 
      className={className}
    >
      {label || statusLabels[status] || status}
    </Badge>
  );
}

export interface DiscrepancyBadgeProps {
  value: number;
  showSign?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function DiscrepancyBadge({ value, showSign = true, size = 'md', className }: DiscrepancyBadgeProps) {
  const displayValue = showSign && value > 0 ? `+${value}` : String(value);
  
  return (
    <Badge 
      variant="discrepancy" 
      discrepancy={value} 
      size={size} 
      className={className}
    >
      {displayValue}
    </Badge>
  );
}

export default Badge;