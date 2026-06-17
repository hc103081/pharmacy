'use client';

import React from 'react';
import { Info } from 'lucide-react';
import { useTeaching } from './TeachingContext';
import type { TeachingModuleType } from './TeachingContext';

type TeachingButtonVariant = 'fixed-bottom-right' | 'inline';

const variantStyles: Record<TeachingButtonVariant, string> = {
  'fixed-bottom-right':
    'fixed bottom-4 right-4 z-50 p-2 rounded-full bg-[#162a56] text-[#00f2fe] hover:bg-[#1e3a6a] hover:text-[#33fefe] transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#00f2fe] focus:ring-offset-2 focus:ring-offset-[#07142b] active:scale-95 shadow-[0_0_10px_rgba(0,242,254,0.3)]',
  'inline':
    'inline-flex items-center justify-center p-1 rounded-full bg-[#162a56] text-[#00f2fe] hover:bg-[#1e3a6a] hover:text-[#33fefe] transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#00f2fe] focus:ring-offset-2 focus:ring-offset-[#07142b] active:scale-95 shadow-[0_0_8px_rgba(0,242,254,0.2)]',
};

const TeachingButton: React.FC<{
  module: TeachingModuleType;
  variant?: TeachingButtonVariant;
  className?: string;
}> = ({
  module,
  variant = 'fixed-bottom-right',
  className = '',
}) => {
  const { openTeaching } = useTeaching();

  return (
    <button
      onClick={() => openTeaching(module)}
      className={`${variantStyles[variant]} ${className}`}
      aria-label="顯示教學"
    >
      <Info className={variant === 'inline' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
    </button>
  );
};

export default TeachingButton;
export { TeachingButton };
