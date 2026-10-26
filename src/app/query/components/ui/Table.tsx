'use client';

import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/app/query/design-system';

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T, index: number) => ReactNode;
  className?: string;
  headerClassName?: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
}

export interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  isLoading?: boolean;
  emptyMessage?: string;
  emptyIcon?: ReactNode;
  onRowClick?: (item: T) => void;
  rowClassName?: (item: T, index: number) => string;
  striped?: boolean;
  hoverable?: boolean;
  className?: string;
}

export function Table<T>({
  columns,
  data,
  keyExtractor,
  isLoading = false,
  emptyMessage = '無資料',
  emptyIcon,
  onRowClick,
  rowClassName,
  striped = true,
  hoverable = true,
  className,
}: TableProps<T>) {
  const alignClasses = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  };

  if (isLoading) {
    return (
      <div className={cn('overflow-x-auto', className)}>
        <table className="min-w-full divide-y divide-[${colors.border.default}]" role="table">
          <thead>
            <tr className="bg-[${colors.bg.surfaceHover}]/50">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'px-4 py-3 text-left text-xs font-medium text-[${colors.text.muted}] uppercase tracking-wider border-b border-[${colors.border.default}]',
                    alignClasses[col.align || 'left'],
                    col.headerClassName
                  )}
                  style={{ width: col.width }}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[${colors.border.default}]">
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="animate-pulse">
                {columns.map((col) => (
                  <td key={col.key} className={cn('px-4 py-3', alignClasses[col.align || 'left'])}>
                    <div className="h-4 bg-gradient-to-r from-[${colors.bg.surfaceHover}] via-[${colors.bg.surfaceActive}] to-[${colors.bg.surfaceHover}] bg-[length:200%_100%] rounded animate-pulse" style={{ width: '60%' }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-12 md:py-16 text-center', className)}>
        {emptyIcon || (
          <svg className="w-12 h-12 md:w-16 md:h-16 mx-auto mb-4 opacity-50 text-[${colors.text.muted}]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
        <h3 className="text-lg font-medium text-[${colors.text.muted}] mb-2">{emptyMessage}</h3>
      </div>
    );
  }

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="min-w-full divide-y divide-[${colors.border.default}]" role="table">
        <thead>
          <tr className="bg-[${colors.bg.surfaceHover}]/50">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'px-4 py-3 text-left text-xs font-medium text-[${colors.text.muted}] uppercase tracking-wider border-b border-[${colors.border.default}]',
                  alignClasses[col.align || 'left'],
                  col.headerClassName
                )}
                style={{ width: col.width }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={cn('divide-y divide-[${colors.border.default}]', striped && 'bg-[${colors.bg.surface}]/30')}>
          {data.map((item, index) => (
            <tr
              key={keyExtractor(item)}
              className={cn(
                hoverable && 'hover:bg-[${colors.bg.surfaceHover}]/30 transition-colors duration-100',
                onRowClick && 'cursor-pointer',
                striped && index % 2 === 1 && 'bg-[${colors.bg.surface}]/20',
                rowClassName?.(item, index)
              )}
              onClick={() => onRowClick?.(item)}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    'px-4 py-3 text-sm text-[${colors.text.secondary}]',
                    alignClasses[col.align || 'left'],
                    col.className
                  )}
                >
                  {col.render ? col.render(item, index) : String((item as Record<string, unknown>)[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface TableContainerProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  action?: ReactNode;
}

export function TableContainer({ title, description, action, className, children, ...props }: TableContainerProps) {
  return (
    <div className={cn('bg-[${colors.bg.surface}]/70 border border-[${colors.border.default}] rounded-xl shadow-md', className)} {...props}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-[${colors.border.default}]">
          <div>
            {title && <h3 className="text-xl font-bold text-white">{title}</h3>}
            {description && <p className="mt-1 text-sm text-[${colors.text.muted}]">{description}</p>}
          </div>
          {action && <div className="flex-shrink-0 ml-4">{action}</div>}
        </div>
      )}
      <div className="overflow-x-auto">
        {children}
      </div>
    </div>
  );
}

export default Table;