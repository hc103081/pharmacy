'use client';

import React from 'react';
import { AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';
import type { ErrorDrugItem } from '../types';

interface ErrorDrawerProps {
  isOpen: boolean;
  errorDrugs: ErrorDrugItem[];
  onClose: () => void;
  onJumpToDrug: (drug: ErrorDrugItem) => void;
}

export default function ErrorDrawer({ isOpen, errorDrugs, onClose, onJumpToDrug }: ErrorDrawerProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-80 h-full bg-[#162a56] border-l border-blue-500/20 shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col">
        <div className="p-4 border-b border-blue-500/20 flex items-center justify-between">
          <div className="flex items-center gap-2 text-red-400">
            <AlertCircle className="w-5 h-5" />
            <h3 className="font-bold">異常項目清單</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {errorDrugs.length === 0 ? (
            <div className="text-center py-20 text-slate-500 space-y-2">
              <CheckCircle2 className="w-10 h-10 mx-auto opacity-20" />
              <p className="text-sm">目前沒有數量異常項目</p>
            </div>
          ) : (
            Object.entries(
              errorDrugs.reduce(
                (acc, d) => {
                  if (!acc[d.page_number]) acc[d.page_number] = [];
                  acc[d.page_number].push(d);
                  return acc;
                },
                {} as Record<number, ErrorDrugItem[]>
              )
            )
              .sort((a, b) => Number(a[0]) - Number(b[0]))
              .map(([page, items]) => (
                <div key={page} className="space-y-2">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-1">
                    第 {page} 頁
                  </div>
                  <div className="space-y-1">
                    {items.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          onJumpToDrug(item);
                          onClose();
                        }}
                        className="w-full text-left p-2 rounded-lg bg-slate-950/50 border border-slate-800 hover:border-red-500/50 transition-all group active:scale-95"
                      >
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-medium text-slate-300 truncate group-hover:text-red-400 transition-colors">
                            {item.name}
                          </span>
                          <span className="text-[10px] font-mono text-red-500 bg-red-500/10 px-1 rounded">
                            {item.actual_quantity}/{item.expected_quantity}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
}