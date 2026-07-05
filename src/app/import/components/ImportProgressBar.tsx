'use client';

import React from 'react';
import { Loader2, Cpu, ScanLine, Upload, FileType } from 'lucide-react';
import { PdfProgressStep } from '@/lib/pdfParser';

const STEP_ICONS = {
  converting: <FileType className="w-5 h-5 text-cyan-400" />,
  merging: <ScanLine className="w-5 h-5 text-cyan-400" />,
  uploading: <Upload className="w-5 h-5 text-cyan-400" />,
  header: <Cpu className="w-5 h-5 text-[#00f2fe]" />,
  batch: <Cpu className="w-5 h-5 text-[#00f2fe] animate-pulse" />,
  done: <Loader2 className="w-4 h-4 text-green-400" />,
};

const PDF_STEP_LABELS: Record<string, string> = {
  converting: '轉圖',
  merging: '合併',
  uploading: '上傳',
  header: '表頭',
  batch: '辨識',
};

const PDF_STEPS = ['converting', 'merging', 'uploading', 'header', 'batch'] as const;

interface ImportProgressBarProps {
  progress: PdfProgressStep | null;
}

export function ImportProgressBar({ progress }: ImportProgressBarProps) {
  if (!progress) return null;

  return (
    <div className="tech-card p-4 lg:p-5 space-y-4 border-cyan-500/30 animate-in fade-in slide-in-from-bottom-2 relative overflow-hidden animate-scanline">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#00f2fe]/60 to-transparent" />
      <div className="flex items-center gap-3 relative z-10">
        <div className={`relative ${progress.step === 'batch' ? 'animate-pulse-glow' : ''} rounded-lg p-1.5`}>
          {STEP_ICONS[progress.step]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white truncate">{progress.label}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {progress.step === 'converting' && '將 PDF 頁面渲染為高清圖片'}
            {progress.step === 'merging' && '每 3 頁合併為一張，減少 API 呼叫次數'}
            {progress.step === 'uploading' && '上傳至雲端儲存空間'}
            {progress.step === 'header' && 'Gemini AI 正在辨識出貨單號與日期'}
            {progress.step === 'batch' && 'Gemini AI 正在辨識藥品條碼、品名與數量'}
            {progress.step === 'done' && '所有步驟完成'}
          </p>
        </div>
        <span className="text-[#00f2fe] font-mono text-lg font-bold tabular-nums">{progress.percent}%</span>
      </div>
      <div className="relative h-2.5 bg-slate-800/80 rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-500 to-[#00f2fe] rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progress.percent}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-6 h-4 bg-white/30 blur-sm rounded-full transition-all duration-500 ease-out"
          style={{ left: `calc(${progress.percent}% - 12px)` }}
        />
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent animate-particle-flow" />
        </div>
        {progress.step === 'batch' && (
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
        )}
      </div>
      <div className="flex items-center gap-0 relative z-10">
        {PDF_STEPS.map((s, i) => {
          const stepOrder = [...PDF_STEPS, 'done'];
          const currentIdx = stepOrder.indexOf(progress.step);
          const thisIdx = stepOrder.indexOf(s);
          const isCompleted = thisIdx < currentIdx || progress.step === 'done';
          const isCurrent = progress.step === s;
          return (
            <React.Fragment key={s}>
              <div className="flex flex-col items-center gap-1.5 flex-1">
                <div className={`w-3 h-3 rounded-full transition-all duration-500 flex items-center justify-center ${
                  isCompleted ? 'bg-[#00f2fe] shadow-[0_0_8px_rgba(0,242,254,0.6)]' :
                  isCurrent ? 'bg-[#00f2fe] animate-pulse-glow' :
                  'bg-slate-700'
                }`}>
                  {isCompleted && (
                    <svg className="w-2 h-2 text-slate-900 animate-check-pop" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span className={`text-[9px] leading-tight text-center transition-colors duration-300 ${
                  isCompleted ? 'text-[#00f2fe]' :
                  isCurrent ? 'text-slate-300' :
                  'text-slate-600'
                }`}>
                  {PDF_STEP_LABELS[s] || s}
                </span>
              </div>
              {i < PDF_STEPS.length - 1 && (
                <div className={`h-px flex-1 -mt-4 transition-colors duration-300 ${
                  isCompleted ? 'bg-[#00f2fe]/60 animate-line-glow' :
                  isCurrent ? 'bg-slate-600' :
                  'bg-slate-800'
                }`}>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}