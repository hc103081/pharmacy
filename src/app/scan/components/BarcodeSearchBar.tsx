'use client';

import React from 'react';
import { Search, X } from 'lucide-react';

interface BarcodeSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  hasMatch: boolean;
  isLocked: boolean;
}

export default function BarcodeSearchBar({
  value,
  onChange,
  onClear,
  hasMatch,
  isLocked,
}: BarcodeSearchBarProps) {
  return (
    <div className="relative">
      <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
        <Search className="w-5 h-5 text-slate-500" />
      </div>
      <input
        type="text"
        id="search-barcode"
        name="barcode"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="掃描或輸入條碼..."
        disabled={isLocked}
        className={`tech-input w-full box-border pl-9 md:pl-10 pr-12 text-base md:text-lg font-mono ${
          hasMatch ? 'border-[#00f2fe] ring-1 ring-inset ring-[#00f2fe]/50' : ''
        } ${isLocked ? 'bg-slate-900/50 opacity-50 cursor-not-allowed' : ''}`}
        autoFocus
      />
      {value && (
        <button
          onClick={onClear}
          className="absolute inset-y-0 right-3 flex items-center text-slate-500 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}