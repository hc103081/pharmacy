'use client';

import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn, variants } from '@/app/query/design-system';

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'bordered';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  className?: string;
}

const paddingClasses = {
  none: '',
  sm: 'p-3 md:p-4',
  md: 'p-4 md:p-6',
  lg: 'p-6 md:p-8',
};

export const Panel = forwardRef<HTMLDivElement, PanelProps>(
  (
    {
      variant = 'default',
      padding = 'md',
      className,
      children,
      ...props
    },
    ref
  ) => {
    // Select variant class from design system
    const variantClass = variants.panel[variant] || variants.panel.default;
    
    return (
      <div
        ref={ref}
        className={cn(
          variantClass,
          paddingClasses[padding],
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Panel.displayName = 'Panel';

export interface PanelHeaderProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  badge?: ReactNode;
}

export function PanelHeader({ title, description, icon, action, badge, className, ...props }: PanelHeaderProps) {
  return (
    <div className={cn(variants.panel.header, className)} {...props}>
      <div className="flex items-start gap-3 flex-1 min-w-0">
        {icon && (
          <div className="flex-shrink-0 w-10 h-10 bg-[${colors.bg.surfaceHover}] rounded-lg flex items-center justify-center text-[${colors.accent.primary}]">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-bold text-white truncate">{title}</h3>
            {badge && (
              <span className="flex-shrink-0">{badge}</span>
            )}
          </div>
          {description && (
            <p className="mt-1 text-sm text-[${colors.text.muted}]">{description}</p>
          )}
        </div>
      </div>
      {action && (
        <div className="flex-shrink-0 ml-4">
          {action}
        </div>
      )}
    </div>
  );
}

export type PanelContentProps = HTMLAttributes<HTMLDivElement>;

export function PanelContent({ className, children, ...props }: PanelContentProps) {
  return (
    <div className={cn(variants.panel.content, className)} {...props}>
      {children}
    </div>
  );
}

export type PanelFooterProps = HTMLAttributes<HTMLDivElement>;

export function PanelFooter({ className, children, ...props }: PanelFooterProps) {
  return (
    <div className={cn('flex items-center gap-3 px-6 py-4 border-t border-[${colors.border.panel}]', className)} {...props}>
      {children}
    </div>
  );
}

export interface SectionProps extends HTMLAttributes<HTMLElement> {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Section({ title, description, action, className, children, ...props }: SectionProps) {
  return (
    <section className={cn('space-y-6', className)} {...props}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            {title && <h2 className="text-xl md:text-2xl font-bold text-white">{title}</h2>}
            {description && <p className="mt-1 text-sm text-[${colors.text.muted}]">{description}</p>}
          </div>
          {action && <div className="flex-shrink-0">{action}</div>}
        </header>
      )}
      <div>{children}</div>
    </section>
  );
}

export default Panel;