'use client';

import { cn, colors } from '@/app/query/design-system';

export interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular' | 'card' | 'table-row';
  width?: string | number;
  height?: string | number;
  lines?: number;
}

const baseSkeleton = `
  animate-pulse
  bg-gradient-to-r
  from-[${colors.bg.surfaceHover}]
  via-[${colors.bg.surfaceActive}]
  to-[${colors.bg.surfaceHover}]
  bg-[length:200%_100%]
  rounded-lg
`;

export function Skeleton({ 
  className, 
  variant = 'rectangular', 
  width = '100%', 
  height, 
  lines = 1 
}: SkeletonProps) {
  if (variant === 'text') {
    return (
      <div className={cn('space-y-2', className)}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={cn(
              baseSkeleton,
              'h-4',
              i === lines - 1 && 'w-3/4',
              className
            )}
            style={{ width: i === lines - 1 ? '75%' : width }}
          />
        ))}
      </div>
    );
  }

  if (variant === 'circular') {
    return (
      <div
        className={cn(baseSkeleton, 'rounded-full', className)}
        style={{ width, height: height || width }}
      />
    );
  }

  if (variant === 'card') {
    return (
      <div className={cn('space-y-3', className)}>
        <div className={cn(baseSkeleton, 'h-32 w-full', 'rounded-xl')} />
        <div className={cn(baseSkeleton, 'h-4 w-1/2')} />
        <div className={cn(baseSkeleton, 'h-4 w-1/3')} />
        <div className={cn('flex gap-2', className)}>
          <div className={cn(baseSkeleton, 'h-8 w-20 rounded-full')} />
          <div className={cn(baseSkeleton, 'h-8 w-20 rounded-full')} />
        </div>
      </div>
    );
  }

  if (variant === 'table-row') {
    return (
      <tr className="animate-pulse">
        <td className="px-4 py-3">
          <div className={cn(baseSkeleton, 'h-4 w-3/4')} />
        </td>
        <td className="px-4 py-3">
          <div className={cn(baseSkeleton, 'h-4 w-1/2')} />
        </td>
        <td className="px-4 py-3">
          <div className={cn(baseSkeleton, 'h-4 w-1/3')} />
        </td>
        <td className="px-4 py-3">
          <div className={cn(baseSkeleton, 'h-4 w-1/4')} />
        </td>
      </tr>
    );
  }

  return (
    <div
      className={cn(baseSkeleton, className)}
      style={{ width, height: height || '1rem' }}
    />
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('bg-[${colors.bg.surface}]/70 border border-[${colors.border.default}] rounded-xl shadow-md p-4 md:p-6', className)}>
      <Skeleton variant="card" />
    </div>
  );
}

export function SkeletonTable({ rows = 5, columns = 4, className }: { rows?: number; columns?: number; className?: string }) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="min-w-full divide-y divide-[${colors.border.default}]" role="table">
        <thead>
          <tr className="bg-[${colors.bg.surfaceHover}]/50">
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i} className="px-4 py-3 text-left text-xs font-medium text-[${colors.text.muted}] uppercase tracking-wider border-b border-[${colors.border.default}]">
                <Skeleton variant="text" width="60%" height="0.75rem" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[${colors.border.default}]">
          {Array.from({ length: rows }).map((_, i) => (
            <tr key={i} className="animate-pulse">
              {Array.from({ length: columns }).map((_, j) => (
                <td key={j} className="px-4 py-3">
                  <Skeleton variant="text" width="70%" height="0.875rem" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SkeletonList({ items = 5, className }: { items?: number; className?: string }) {
  return (
    <div className={cn('space-y-4', className)}>
      {Array.from({ length: items }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export default Skeleton;