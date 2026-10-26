'use client';

import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn, variants, colors } from '@/app/query/design-system';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  variant?: 'default' | 'search' | 'date';
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      hint,
      leftIcon,
      rightIcon,
      variant = 'default',
      className,
      id,
      disabled,
      required,
      ...props
    },
    ref
  ) => {
    const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;
    const errorId = error ? `${inputId}-error` : undefined;
    const hintId = hint ? `${inputId}-hint` : undefined;
    const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

    // Select variant class from design system
    const variantClass = variants.input[variant] || variants.input.default;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-[${colors.text.secondary}] mb-1"
          >
            {label}
            {required && <span className="text-[${colors.accent.error}] ml-1" aria-hidden="true">*</span>}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[${colors.text.muted}] pointer-events-none">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            required={required}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={describedBy}
            className={cn(
              variantClass,
              leftIcon ? 'pl-10' : undefined,
              rightIcon ? 'pr-10' : undefined,
              error ? 'border-[${colors.accent.error}] focus:ring-[${colors.accent.error}] focus:border-[${colors.accent.error}]' : undefined,
              className
            )}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[${colors.text.muted}] pointer-events-none">
              {rightIcon}
            </div>
          )}
          {error && (
            <div
              id={errorId}
              className="absolute -bottom-5 left-0 text-xs text-[${colors.accent.error}]"
              role="alert"
            >
              {error}
            </div>
          )}
        </div>
        {hint && !error && (
          <p id={hintId} className="mt-1 text-xs text-[${colors.text.muted}]">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      error,
      hint,
      className,
      id,
      disabled,
      required,
      ...props
    },
    ref
  ) => {
    const textareaId = id || `textarea-${Math.random().toString(36).substr(2, 9)}`;
    const errorId = error ? `${textareaId}-error` : undefined;
    const hintId = hint ? `${textareaId}-hint` : undefined;
    const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-sm font-medium text-[${colors.text.secondary}] mb-1"
          >
            {label}
            {required && <span className="text-[${colors.accent.error}] ml-1" aria-hidden="true">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          disabled={disabled}
          required={required}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={describedBy}
          className={cn(
            `
              w-full px-4 py-3 min-h-[100px]
              bg-[${colors.bg.input}] border border-[${colors.border.input}]
              rounded-xl text-white placeholder-[${colors.text.inputPlaceholder}]
              resize-y transition-all duration-200 ease-out
              focus:outline-none focus:border-[${colors.accent.primary}] focus:ring-2 focus:ring-[${colors.accent.primary}]/30 focus:${variants.input.default.includes('shadow') ? '' : 'shadow-[0_0_15px_rgba(0,242,254,0.35)]'}
              disabled:bg-[${colors.bg.secondary}] disabled:border-[${colors.border.input}] disabled:text-[${colors.text.disabled}] disabled:cursor-not-allowed
            `,
            error && 'border-[${colors.accent.error}] focus:ring-[${colors.accent.error}] focus:border-[${colors.accent.error}]',
            className
          )}
          {...props}
        />
        {error && (
          <p id={errorId} className="mt-1 text-xs text-[${colors.accent.error}]" role="alert">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={hintId} className="mt-1 text-xs text-[${colors.text.muted}]">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

export default Input;