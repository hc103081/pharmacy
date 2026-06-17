'use client';

import { Suspense } from 'react';
import ScanContent from './ScanContent';

export default function ScanPage() {
  return (
    <>
      <Suspense fallback={
        <div className="fixed inset-0 flex items-center justify-center bg-[#07142b]">
          <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-500">載入清點面板...</p>
          </div>
        </div>
      }>
        <ScanContent />
      </Suspense>
    </>
  );
}