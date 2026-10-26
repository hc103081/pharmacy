'use client';

import { cn } from '@/app/query/design-system';
import { Skeleton } from './Skeleton';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  variant?: 'default' | 'search' | 'error' | 'offline';
}

const variantStyles = {
  default: 'text-center py-12 md:py-16',
  search: 'text-center py-12 md:py-16',
  error: 'text-center py-8',
  offline: 'text-center py-8',
};

const variantIconStyles = {
  default: 'w-12 h-12 md:w-16 md:h-16 mx-auto mb-4 opacity-50 text-[${colors.text.muted}]',
  search: 'w-12 h-12 md:w-16 md:h-16 mx-auto mb-4 opacity-50 text-[${colors.text.muted}]',
  error: 'w-10 h-10 mx-auto mb-3 text-[${colors.accent.error}]',
  offline: 'w-10 h-10 mx-auto mb-3 text-[${colors.accent.warning}]',
};

const variantTitleStyles = {
  default: 'text-lg font-medium text-[${colors.text.muted}] mb-2',
  search: 'text-lg font-medium text-[${colors.text.muted}] mb-2',
  error: 'text-base font-medium text-[${colors.accent.error}] mb-2',
  offline: 'text-base font-medium text-[${colors.accent.warning}] mb-2',
};

const variantDescStyles = {
  default: 'text-sm text-[${colors.text.muted}] max-w-xs mx-auto',
  search: 'text-sm text-[${colors.text.muted}] max-w-xs mx-auto',
  error: 'text-sm text-[${colors.text.muted}] max-w-xs mx-auto',
  offline: 'text-sm text-[${colors.text.muted}] max-w-xs mx-auto',
};

export function EmptyState({ 
  icon, 
  title, 
  description, 
  action, 
  className, 
  variant = 'default' 
}: EmptyStateProps) {
  const defaultIcons: Record<string, React.ReactNode> = {
    default: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    search: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
    error: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    offline: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  };

  return (
    <div className={cn(variantStyles[variant], className)}>
      <div className={cn(variantIconStyles[variant])}>
        {icon || defaultIcons[variant]}
      </div>
      <h3 className={cn(variantTitleStyles[variant])}>{title}</h3>
      {description && (
        <p className={cn(variantDescStyles[variant])}>{description}</p>
      )}
      {action && (
        <div className="mt-6 flex items-center justify-center gap-3">
          {action}
        </div>
      )}
    </div>
  );
}

export interface EmptyStateCardProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyStateCard({ icon, title, description, action, className }: EmptyStateCardProps) {
  return (
    <div className={cn('bg-[${colors.bg.surface}]/70 border border-[${colors.border.default}] rounded-xl shadow-md', className)}>
      <EmptyState icon={icon} title={title} description={description} action={action} />
    </div>
  );
}

export function LoadingState({ 
  message = '載入中...', 
  className 
}: { 
  message?: string; 
  className?: string; 
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 md:py-16 text-center', className)}>
      <div className="w-10 h-10 border-3 border-[${colors.accent.primary}] border-t-transparent rounded-full animate-spin mb-4" aria-hidden="true" />
      <p className="text-[${colors.text.muted}]">{message}</p>
    </div>
  );
}

export function ErrorState({ 
  message = '發生錯誤', 
  onRetry, 
  className 
}: { 
  message?: string; 
  onRetry?: () => void; 
  className?: string; 
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-8 text-center gap-4', className)}>
      <div className="flex items-center gap-3 p-4 bg-[${colors.accent.error}]/20 rounded-lg border border-[${colors.accent.error}]/50">
        <svg className="w-5 h-5 text-[${colors.accent.error}]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div>
          <h3 className="font-medium text-[${colors.accent.error}]">載入失敗</h3>
          <p className="text-sm text-[${colors.text.muted}]">{message}</p>
        </div>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-[${colors.accent.primary}]/20 border border-[${colors.accent.primary}] text-[${colors.accent.primary}] rounded-lg hover:bg-[${colors.accent.primary}]/30 transition-colors text-sm font-medium"
        >
          重試
        </button>
      )}
    </div>
  );
}

export default EmptyState;