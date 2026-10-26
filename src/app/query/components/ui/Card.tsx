'use client';

import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn, variants } from '@/app/query/design-system';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'interactive' | 'elevated' | 'inner';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
}

const paddingClasses = {
  none: '',
  sm: 'p-3 md:p-4',
  md: 'p-4 md:p-6',
  lg: 'p-6 md:p-8',
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      variant = 'default',
      padding = 'md',
      hover = false,
      className,
      children,
      ...props
    },
    ref
  ) => {
    // Select variant class from design system
    const variantClass = variants.card[variant] || variants.card.default;
    
    return (
      <div
        ref={ref}
        className={cn(
          variantClass,
          paddingClasses[padding],
          hover && variant !== 'elevated' && 'hover:border-[${colors.accent.primary}]/50 hover:shadow-[${colors.glow.primary}]',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

export interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function CardHeader({ title, description, action, className, ...props }: CardHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4 px-6 py-4 border-b border-[${colors.border.panel}]', className)} {...props}>
      <div className="flex-1 min-w-0">
        <h3 className="text-xl font-bold text-white truncate">{title}</h3>
        {description && (
          <p className="mt-1 text-sm text-[${colors.text.muted}]">{description}</p>
        )}
      </div>
      {action && (
        <div className="flex-shrink-0 ml-4">
          {action}
        </div>
      )}
    </div>
  );
}

export interface CardContentProps extends HTMLAttributes<HTMLDivElement> {}

export function CardContent({ className, children, ...props }: CardContentProps) {
  return (
    <div className={cn('p-4 md:p-6', className)} {...props}>
      {children}
    </div>
  );
}

export interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {}

export function CardFooter({ className, children, ...props }: CardFooterProps) {
  return (
    <div className={cn('flex items-center gap-3 px-6 py-4 border-t border-[${colors.border.panel}]', className)} {...props}>
      {children}
    </div>
  );
}

export default Card;