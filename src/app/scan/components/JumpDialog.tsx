'use client';

import React from 'react';
import { ArrowRightLeft } from 'lucide-react';
import type { JumpTarget } from '@/types';

interface JumpDialogProps {
  jumpTarget: JumpTarget;
  currentPage: number;
  onStay: () => void;
  onJump: (target: JumpTarget) => void;
}

export default function JumpDialog({ jumpTarget, onStay, onJump }: JumpDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="tech-card p-6 max-w-sm w-full space-y-4 animate-in zoom-in duration-200">
        <div className="flex items-center gap-3 text-[#00f2fe]">
          <ArrowRightLeft className="w-6 h-6" />
          <h3 className="font-bold text-lg">發現藥品在其他分頁</h3>
        </div>
        <p className="text-slate-400 text-sm leading-relaxed">
          藥品{' '}
          <span className="text-white font-bold">「{jumpTarget.name}」</span> 位於{' '}
          <span className="text-[#00f2fe] font-bold">第 {jumpTarget.page} 頁</span>。
        </p>
        <div className="flex gap-3 pt-2">
          <button
            onClick={onStay}
            className="flex-1 py-2 bg-slate-800 text-slate-400 rounded-xl font-medium hover:bg-slate-700 transition-colors"
          >
            留在本頁
          </button>
          <button
            onClick={() => onJump(jumpTarget)}
            className="flex-1 py-2 bg-[#00f2fe] text-slate-900 rounded-xl font-bold hover:brightness-110 transition-all"
          >
            跳轉至該頁
          </button>
        </div>
      </div>
    </div>
  );
}