'use client';

import React from 'react';
import { Info } from 'lucide-react';
import { useTeaching } from './TeachingContext';
import type { TeachingModuleType } from './TeachingContext';

const TeachingButton: React.FC<{ module: TeachingModuleType; className?: string }> = ({ 
  module, 
  className = '' 
}) => {
  const { openTeaching } = useTeaching();

  return (
    <button
      onClick={() => openTeaching(module)}
      className={`fixed bottom-4 right-4 z-50 p-2 rounded-full bg-[#162a56] text-[#00f2fe] hover:bg-[#1e3a6a] hover:text-[#33fefe] transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#00f2fe] focus:ring-offset-2 focus:ring-offset-[#07142b] active:scale-95 shadow-[0_0_10px_rgba(0,242,254,0.3)] ${className}`}
      aria-label="顯示教學"
    >
      <Info className="h-4 w-4" />
    </button>
  );
};

export default TeachingButton;
export { TeachingButton };