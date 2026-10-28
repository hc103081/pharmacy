'use client';

import React, { useState } from 'react';
import {
  Check,
  AlertTriangle,
  Camera,
  Search,
  Edit3,
  MapPin,
  Barcode,
  CheckCircle2,
  XCircle,
  Sliders,
} from 'lucide-react';

export default function PreviewCardPage() {
  const [selectedVer, setSelectedVer] = useState<'A' | 'B' | 'C'>('A');

  return (
    <div className="min-h-screen bg-[#07142b] text-slate-100 p-4 sm:p-8 font-sans antialiased">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="border-b border-slate-800 pb-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-[#00f2fe]/20 text-[#00f2fe] border border-[#00f2fe]/40">
              UI / UX Redesign Showcase
            </span>
            <span className="text-xs text-slate-400 font-mono">
              藥品清點卡片（DrugCard）美化設計提案
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-wide">
            藥品卡片 3 版美化方案即時預覽
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            徹底解決「儲位孤立、品名條碼撞色、操作按鈕死黑單調」之視覺痛點。
          </p>
        </header>

        {/* 3 Versions Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ======================================================== */}
          {/* 版本 A：精緻科技膠囊款 (Tech Capsule) - 建議首選         */}
          {/* ======================================================== */}
          <div className="space-y-3 flex flex-col">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#00f2fe] text-[#07142b] font-bold text-xs flex items-center justify-center">
                  A
                </span>
                <h2 className="text-base font-bold text-white">版本 A：精緻科技膠囊款</h2>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-medium">
                推薦首選 ⭐
              </span>
            </div>
            <p className="text-xs text-slate-400 min-h-[36px]">
              儲位收納入琥珀金微光標籤、品名純白高對比、條碼等寬晶片徽章、正確/有誤雙微光按鈕。
            </p>

            {/* 卡片實體 A */}
            <div className="flex-1 rounded-2xl bg-[#162a56]/80 backdrop-blur-md border border-[#00f2fe] shadow-[0_0_20px_rgba(0,242,254,0.18)] p-4 flex flex-col justify-between gap-3 relative transition-all duration-200 hover:border-[#00f2fe] hover:shadow-[0_0_25px_rgba(0,242,254,0.25)]">
              
              {/* 上半部 */}
              <div className="flex items-start justify-between gap-3">
                {/* 序號徽章 */}
                <div className="w-9 h-9 rounded-xl bg-[#0a1936] border border-[#1e3468] flex items-center justify-center text-[#00f2fe] font-mono font-bold text-sm shrink-0 shadow-inner">
                  01
                </div>

                {/* 藥品主體資訊 */}
                <div className="flex-1 min-w-0 space-y-1">
                  {/* 儲位與版面標籤 */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 text-[11px] font-medium border border-amber-500/30 flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      <span>儲位 5</span>
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">P.1 #1</span>
                  </div>

                  {/* 藥品名稱 (純白粗體) */}
                  <h3 className="text-base font-bold text-white tracking-wide truncate">
                    羅氏逸智血糖試紙
                  </h3>

                  {/* 條碼晶片徽章 + 工具鍵 */}
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-[#00f2fe]/10 text-[#00f2fe] border border-[#00f2fe]/30 tracking-wider shadow-sm flex items-center gap-1">
                      <Barcode className="w-3.5 h-3.5" />
                      4015630067022
                    </span>

                    <button
                      type="button"
                      className="p-1 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-[#00f2fe] border border-slate-700/80 transition-colors"
                      title="查詢此品項歷史"
                    >
                      <Search className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      className="p-1 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-[#00f2fe] border border-slate-700/80 transition-colors"
                      title="編輯品項資料"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* 右側拍照按鈕 */}
                <button
                  type="button"
                  className="w-12 h-12 rounded-xl bg-[#0a1936] border border-[#1e3468] hover:border-[#00f2fe]/60 flex flex-col items-center justify-center text-slate-400 hover:text-[#00f2fe] transition-all shrink-0 group active:scale-95 shadow-inner"
                >
                  <Camera className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  <span className="text-[9px] text-slate-500 group-hover:text-[#00f2fe] mt-0.5 font-medium">
                    拍照
                  </span>
                </button>
              </div>

              {/* 下半部：操作按鈕區 (獨立雙色微光按鈕) */}
              <div className="pt-2 border-t border-slate-800/80 grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  className="py-2.5 px-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/25 active:bg-emerald-500 active:text-slate-900 text-emerald-400 border border-emerald-500/30 hover:border-emerald-400/80 font-bold text-sm flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>正確</span>
                </button>
                <button
                  type="button"
                  className="py-2.5 px-3 rounded-xl bg-[#ff4b5c]/10 hover:bg-[#ff4b5c]/25 active:bg-[#ff4b5c] active:text-white text-[#ff4b5c] border border-[#ff4b5c]/30 hover:border-[#ff4b5c]/80 font-bold text-sm flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95"
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span>有誤</span>
                </button>
              </div>

            </div>
          </div>

          {/* ======================================================== */}
          {/* 版本 B：極簡藥師人體工學款 (Pharmacist Ergonomics)        */}
          {/* ======================================================== */}
          <div className="space-y-3 flex flex-col">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-slate-700 text-white font-bold text-xs flex items-center justify-center">
                  B
                </span>
                <h2 className="text-base font-bold text-white">版本 B：藥師極速人體工學款</h2>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 font-medium">
                高速作業 ⚡
              </span>
            </div>
            <p className="text-xs text-slate-400 min-h-[36px]">
              7:3 權重配置，極光藍全寬主按鈕，放大右手拇指盲按命中率。
            </p>

            {/* 卡片實體 B */}
            <div className="flex-1 rounded-2xl bg-[#0c1d3d] border-2 border-[#233d7a] shadow-xl p-4 flex flex-col justify-between gap-3 relative transition-all duration-200 hover:border-[#00f2fe]/70">
              
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-xs font-bold border border-slate-700">
                      #01
                    </span>
                    <span className="px-2 py-0.5 rounded bg-amber-400/20 text-amber-300 font-bold text-xs">
                      儲位 5
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-white tracking-wide truncate">
                    羅氏逸智血糖試紙
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-[#00f2fe] font-semibold">
                      4015630067022
                    </span>
                    <button type="button" className="text-slate-400 hover:text-white">
                      <Search className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" className="text-slate-400 hover:text-white">
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  className="p-3 rounded-xl bg-slate-800/90 text-slate-300 hover:text-[#00f2fe] border border-slate-700 active:scale-95"
                >
                  <Camera className="w-5 h-5" />
                </button>
              </div>

              {/* 7:3 權重按鈕 */}
              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  className="flex-[3] h-11 rounded-xl bg-[#00f2fe] text-[#07142b] font-bold text-sm flex items-center justify-center gap-2 shadow-[0_0_12px_rgba(0,242,254,0.35)] hover:bg-[#00f2fe]/90 active:scale-95 transition-all"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>數量吻合 (正確)</span>
                </button>
                <button
                  type="button"
                  className="flex-[1.2] h-11 rounded-xl bg-slate-800 text-[#ff4b5c] border border-[#ff4b5c]/40 hover:bg-[#ff4b5c]/10 active:scale-95 font-bold text-sm flex items-center justify-center gap-1 transition-all"
                >
                  <XCircle className="w-4 h-4" />
                  <span>有誤</span>
                </button>
              </div>

            </div>
          </div>

          {/* ======================================================== */}
          {/* 版本 C：數據儀表板旗艦款 (Dashboard Pro)                  */}
          {/* ======================================================== */}
          <div className="space-y-3 flex flex-col">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-slate-700 text-white font-bold text-xs flex items-center justify-center">
                  C
                </span>
                <h2 className="text-base font-bold text-white">版本 C：數據儀表板旗艦款</h2>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30 font-medium">
                資訊最全 📊
              </span>
            </div>
            <p className="text-xs text-slate-400 min-h-[36px]">
              內建應收與庫存數據雙宮格、緊湊切分滑塊控制列，數據最透明。
            </p>

            {/* 卡片實體 C */}
            <div className="flex-1 rounded-2xl bg-[#162a56]/70 backdrop-blur-md border border-[#233d7a] p-4 flex flex-col justify-between gap-3 relative shadow-xl">
              
              <div className="flex items-start justify-between gap-2.5">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <span className="font-mono text-[#00f2fe] font-bold">#01</span>
                    <span>•</span>
                    <span className="text-amber-300 font-medium">儲位 5</span>
                  </div>
                  <h3 className="text-base font-bold text-white truncate">羅氏逸智血糖試紙</h3>
                  <p className="font-mono text-xs text-slate-400 truncate">4015630067022</p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button type="button" className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white" title="編輯">
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white" title="拍照">
                    <Camera className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* 雙宮格 */}
              <div className="grid grid-cols-2 gap-2 p-2 rounded-xl bg-[#0a1936]/80 border border-[#1e3468]">
                <div className="text-center">
                  <div className="text-[10px] text-slate-400">紙本應收</div>
                  <div className="font-mono text-base font-bold text-white">50</div>
                </div>
                <div className="text-center border-l border-slate-800">
                  <div className="text-[10px] text-slate-400">倉庫存量</div>
                  <div className="font-mono text-base font-bold text-[#00f2fe]">0</div>
                </div>
              </div>

              {/* 切分控制條 */}
              <div className="p-1 rounded-xl bg-[#0a1936] border border-[#1e3468] grid grid-cols-2 gap-1">
                <button
                  type="button"
                  className="py-2 rounded-lg text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800/80 active:bg-[#00f2fe] active:text-slate-900 transition-all flex items-center justify-center gap-1"
                >
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>正確</span>
                </button>
                <button
                  type="button"
                  className="py-2 rounded-lg text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800/80 active:bg-[#ff4b5c] active:text-white transition-all flex items-center justify-center gap-1"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-[#ff4b5c]" />
                  <span>有誤</span>
                </button>
              </div>

            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
