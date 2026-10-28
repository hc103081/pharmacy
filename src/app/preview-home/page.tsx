'use client';

import { useState } from 'react';
import Link from 'next/link';
import { 
  PackageSearch, 
  FileUp, 
  ClipboardCheck, 
  Clock, 
  CheckCircle2, 
  Barcode, 
  FileText, 
  Play, 
  ChevronRight, 
  LayoutDashboard,
  Smartphone,
  Laptop
} from 'lucide-react';

export default function PreviewHomePage() {
  const [version, setVersion] = useState<'A' | 'B' | 'C'>('A');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');

  return (
    <div className="min-h-screen bg-[#030a17] text-slate-200 p-4 md:p-6 flex flex-col items-center">
      {/* 頂部切換工具列 */}
      <div className="max-w-5xl w-full bg-[#07142b]/90 border border-slate-800 rounded-2xl p-4 mb-6 backdrop-blur-md shadow-2xl flex flex-wrap items-center justify-between gap-4 sticky top-3 z-50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#162a56] border border-[#00f2fe]/40 flex items-center justify-center text-[#00f2fe]">
            <LayoutDashboard className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white flex items-center gap-2">
              首頁 UI 改版提案預覽
              <span className="text-[10px] bg-[#00f2fe]/10 text-[#00f2fe] border border-[#00f2fe]/30 px-2 py-0.5 rounded-full">
                即時 React 預覽
              </span>
            </h1>
            <p className="text-[11px] text-slate-400">點擊切換方案與螢幕視角</p>
          </div>
        </div>

        {/* 方案切換按鈕 */}
        <div className="flex items-center gap-1.5 bg-[#030a17] p-1.5 rounded-xl border border-slate-800">
          <button 
            onClick={() => setVersion('A')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              version === 'A' ? 'bg-[#00f2fe] text-slate-950 shadow-[0_0_12px_rgba(0,242,254,0.4)]' : 'text-slate-400 hover:text-white'
            }`}
          >
            方案 A：工作台戰情版（推薦）
          </button>
          <button 
            onClick={() => setVersion('B')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              version === 'B' ? 'bg-[#00f2fe] text-slate-950 shadow-[0_0_12px_rgba(0,242,254,0.4)]' : 'text-slate-400 hover:text-white'
            }`}
          >
            方案 B：極光極簡版
          </button>
          <button 
            onClick={() => setVersion('C')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              version === 'C' ? 'bg-[#00f2fe] text-slate-950 shadow-[0_0_12px_rgba(0,242,254,0.4)]' : 'text-slate-400 hover:text-white'
            }`}
          >
            方案 C：雙模分流版
          </button>
        </div>

        {/* 視角切換 */}
        <div className="flex items-center gap-1.5 bg-[#030a17] p-1.5 rounded-xl border border-slate-800">
          <button 
            onClick={() => setDevice('desktop')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              device === 'desktop' ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Laptop className="w-3.5 h-3.5" /> 電腦版
          </button>
          <button 
            onClick={() => setDevice('mobile')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              device === 'mobile' ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" /> 手機版
          </button>
        </div>
      </div>

      {/* 方案說明條 */}
      <div className="max-w-5xl w-full bg-[#162a56]/60 border border-blue-500/20 rounded-xl p-3.5 mb-6 text-xs text-slate-300">
        {version === 'A' && (
          <p><strong className="text-[#00f2fe]">方案 A 核心特點：</strong>解決首頁空曠痛點，提供藥局「即時數據指標（待核對清單、今日達成率）」＋「主行動卡片升級」＋「最近作業中清單與微型進度條」，支援一鍵點擊『繼續盤點』直接跳入清點介面。</p>
        )}
        {version === 'B' && (
          <p><strong className="text-[#00f2fe]">方案 B 核心特點：</strong>延續雙卡片入口，強化極光光暈與呼吸邊框，搭配中央待續單數微徽章與下方快速條碼單號直達列，適合喜愛極簡純粹風格的使用者。</p>
        )}
        {version === 'C' && (
          <p><strong className="text-[#00f2fe]">方案 C 核心特點：</strong>分流設計。電腦端以左右雙翼呈現（左側管理核對、右側直接拖曳 Excel 上傳）；手機端轉為大拇指友善的現場盤點大按鈕。</p>
        )}
      </div>

      {/* 預覽容器視窗 */}
      <div 
        className="w-full transition-all duration-300 bg-[#07142b] border border-slate-800 rounded-3xl overflow-hidden shadow-2xl"
        style={{ maxWidth: device === 'mobile' ? '390px' : '1000px' }}
      >
        {version === 'A' && <VersionAView isMobile={device === 'mobile'} />}
        {version === 'B' && <VersionBView isMobile={device === 'mobile'} />}
        {version === 'C' && <VersionCView isMobile={device === 'mobile'} />}
      </div>
    </div>
  );
}

// ==========================================
// 方案 A View（已移除抽象統計，加入藥局實用工具）
// ==========================================
function VersionAView({ isMobile }: { isMobile: boolean }) {
  // 紙本 44 項換算器狀態
  const [calcMode, setCalcMode] = useState<'pageToItem' | 'itemToPage'>('pageToItem');
  const [inputPage, setInputPage] = useState<number>(1);
  const [inputRow, setInputRow] = useState<number>(1);
  const [inputTotalItem, setInputTotalItem] = useState<number>(45);

  const calculatedTotalItem = (Math.max(1, inputPage) - 1) * 44 + Math.max(1, Math.min(44, inputRow));
  const calculatedPage = Math.ceil(Math.max(1, inputTotalItem) / 44);
  const calculatedRow = ((Math.max(1, inputTotalItem) - 1) % 44) + 1;

  return (
    <div className="min-h-[620px] flex flex-col bg-[#07142b]">
      {/* 頂部全寬導航 */}
      <header className="border-b border-slate-800/80 px-4 py-3 flex items-center justify-between bg-[#07142b]/95 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#162a56] border border-[#00f2fe]/40 flex items-center justify-center text-[#00f2fe]">
            <PackageSearch className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-black text-white leading-tight">Phama<span className="text-[#00f2fe]">Count</span> Web</div>
            <div className="text-[10px] text-slate-400">藥局智能清點系統</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isMobile && (
            <span className="text-xs text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              雲端儲存就緒
            </span>
          )}
          <div className="text-xs bg-[#162a56] border border-blue-500/30 px-3 py-1 rounded-lg text-slate-300">
            hc103081@...
          </div>
        </div>
      </header>

      {/* 主體區 */}
      <div className={`p-4 md:p-6 space-y-4 md:space-y-5 ${!isMobile ? 'max-w-4xl mx-auto w-full' : ''}`}>
        
        {/* 全域快捷條碼反查列（新加實用功能：掃條碼立查所屬單號） */}
        <div className="bg-[#162a56]/70 border border-blue-500/30 rounded-2xl p-3 shadow-[0_0_15px_rgba(0,242,254,0.1)] flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-[#00f2fe] flex-shrink-0">
            <Barcode className="w-4 h-4" />
          </div>
          <input 
            type="text" 
            placeholder="全庫條碼 / 藥名快速反查（例如刷條碼確認進貨單號）..."
            className="bg-transparent text-xs text-white placeholder-slate-500 flex-1 outline-none px-1"
          />
          <button className="bg-[#00f2fe] text-slate-950 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1 active:scale-95 transition-all flex-shrink-0">
            查詢
          </button>
        </div>

        {/* 雙卡片區（主要行動入口） */}
        <div className={`grid ${isMobile ? 'grid-cols-1 gap-3' : 'grid-cols-2 gap-5'}`}>
          <div className="bg-[#162a56]/80 border border-blue-500/30 hover:border-[#00f2fe]/60 rounded-2xl p-5 transition-all cursor-pointer group shadow-[0_0_15px_rgba(0,242,254,0.15)]">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-[#00f2fe] group-hover:bg-[#00f2fe] group-hover:text-slate-950 transition-all flex-shrink-0">
                <FileUp className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-white group-hover:text-[#00f2fe] transition-colors">匯入新清單</h3>
                  <ChevronRight className="w-4 h-4 text-slate-500 group-hover:translate-x-1 transition-transform" />
                </div>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">上傳藥品清冊（Excel/PDF），系統自動以每頁 44 項換算紙本分頁</p>
                <span className="inline-block text-[10px] bg-blue-900/40 text-blue-300 border border-blue-700/50 px-2 py-0.5 rounded-md mt-3">
                  支援智慧欄位比對
                </span>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-[#162a56]/90 to-[#0e2147]/90 border border-[#00f2fe]/40 hover:border-[#00f2fe] rounded-2xl p-5 transition-all cursor-pointer group shadow-[0_0_20px_rgba(0,242,254,0.2)]">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[#00f2fe]/20 border border-[#00f2fe]/50 flex items-center justify-center text-[#00f2fe] group-hover:bg-[#00f2fe] group-hover:text-slate-950 transition-all flex-shrink-0">
                <ClipboardCheck className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-white group-hover:text-[#00f2fe] transition-colors">清單管理與清點</h3>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                    3 份待續
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">檢視分類目錄、條碼鏡頭掃描、數量動態比對與實體分頁直達</p>
                <div className="flex gap-2 mt-3">
                  <span className="text-[10px] bg-[#00f2fe]/10 text-[#00f2fe] border border-[#00f2fe]/30 px-2 py-0.5 rounded-md">鏡頭掃描</span>
                  <span className="text-[10px] bg-blue-900/40 text-blue-300 border border-blue-700/50 px-2 py-0.5 rounded-md">44 項直達</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 最近作業中的清單（Resume Section - 一鍵接續作業） */}
        <div className="bg-[#162a56]/60 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
              <Clock className="w-3.5 h-3.5 text-amber-400" /> 最近作業中的清單
            </h4>
            <span className="text-[11px] text-[#00f2fe] hover:underline cursor-pointer">查看全部清單 &rarr;</span>
          </div>

          <div className="space-y-2.5">
            <div className={`bg-[#0b1b38] border border-blue-500/20 rounded-xl p-3 flex ${isMobile ? 'flex-col gap-2' : 'items-center justify-between'}`}>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">2026-10-28 裕利常溫進貨單</span>
                  <span className="text-[10px] bg-blue-900/40 text-blue-300 border border-blue-700/50 px-1.5 py-0.2 rounded">裕利</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">已核對 32 / 44 項 (72%) • 實體第 1 頁</div>
              </div>
              <div className={`flex items-center gap-3 ${isMobile ? 'justify-between pt-1 border-t border-slate-800' : ''}`}>
                <div className="w-20 bg-slate-900 h-1.5 rounded-full overflow-hidden border border-slate-700">
                  <div className="bg-[#00f2fe] h-full" style={{ width: '72%' }}></div>
                </div>
                <button className="bg-[#00f2fe] hover:bg-cyan-400 text-slate-950 font-bold px-3 py-1 rounded-lg text-xs flex items-center gap-1.5 shadow-[0_0_10px_rgba(0,242,254,0.3)]">
                  <Play className="w-3 h-3 fill-slate-950" /> 繼續盤點
                </button>
              </div>
            </div>

            <div className={`bg-[#0b1b38] border border-blue-500/20 rounded-xl p-3 flex ${isMobile ? 'flex-col gap-2' : 'items-center justify-between'}`}>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">2026-10-28 冷藏生物製劑</span>
                  <span className="text-[10px] bg-indigo-900/40 text-indigo-300 border border-indigo-700/50 px-1.5 py-0.2 rounded">冷藏</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">已核對 8 / 18 項 (44%)</div>
              </div>
              <div className={`flex items-center gap-3 ${isMobile ? 'justify-between pt-1 border-t border-slate-800' : ''}`}>
                <div className="w-20 bg-slate-900 h-1.5 rounded-full overflow-hidden border border-slate-700">
                  <div className="bg-[#00f2fe] h-full" style={{ width: '44%' }}></div>
                </div>
                <button className="bg-slate-800 text-slate-200 border border-slate-700 px-3 py-1 rounded-lg text-xs">
                  進入核對
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 雙翼實用工具區：常用分類膠囊 ＋ 紙本 44 項對位換算器 */}
        <div className={`grid ${isMobile ? 'grid-cols-1 gap-3' : 'grid-cols-2 gap-4'}`}>
          
          {/* 工具 1：常用藥廠與分類快速通道 */}
          <div className="bg-[#162a56]/50 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
            <div>
              <div className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5">
                <span className="text-[#00f2fe]">📂</span> 常用廠商與分類直達
              </div>
              <p className="text-[11px] text-slate-400 mb-3">一鍵直達特定資料夾，免去層層翻找：</p>
              <div className="flex flex-wrap gap-1.5">
                {['裕利藥業', '久裕企業', '大聯大物流', '冷藏品 2~8°C', '高價管制藥', '待覆核異常'].map((tag) => (
                  <button key={tag} className="text-xs bg-[#0b1b38] hover:bg-[#162a56] hover:border-[#00f2fe] border border-blue-500/30 text-slate-300 hover:text-white px-2.5 py-1 rounded-lg transition-all">
                    {tag}
                  </button>
                ))}
              </div>
            </div>
            <div className="text-[10px] text-slate-500 mt-3 pt-2 border-t border-slate-800/80">
              提示：可於清單管理中為資料夾釘選捷徑
            </div>
          </div>

          {/* 工具 2：實體紙本 44 項雙向對位換算器 */}
          <div className="bg-[#162a56]/50 border border-blue-500/20 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-[#00f2fe]" /> 紙本 44 項雙向換算器
              </div>
              <button 
                onClick={() => setCalcMode(m => m === 'pageToItem' ? 'itemToPage' : 'pageToItem')}
                className="text-[10px] text-[#00f2fe] bg-blue-900/30 border border-blue-500/30 px-2 py-0.5 rounded"
              >
                切換模式
              </button>
            </div>

            {calcMode === 'pageToItem' ? (
              <div className="space-y-2">
                <div className="text-[11px] text-slate-400">輸入紙本「頁次」與「行號」，換算系統總項次：</div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400">第</span>
                  <input 
                    type="number" 
                    min={1} 
                    value={inputPage} 
                    onChange={e => setInputPage(Number(e.target.value))} 
                    className="w-12 bg-slate-950 border border-slate-700 text-center text-white rounded p-1"
                  />
                  <span className="text-slate-400">頁 第</span>
                  <input 
                    type="number" 
                    min={1} 
                    max={44} 
                    value={inputRow} 
                    onChange={e => setInputRow(Number(e.target.value))} 
                    className="w-12 bg-slate-950 border border-slate-700 text-center text-white rounded p-1"
                  />
                  <span className="text-slate-400">項 ➔</span>
                  <span className="font-bold text-[#00f2fe] text-sm bg-slate-950 px-2 py-1 rounded border border-blue-500/30">
                    全單第 {calculatedTotalItem} 項
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-[11px] text-slate-400">輸入系統「總項次」，換算紙本對應頁數與行號：</div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400">全單第</span>
                  <input 
                    type="number" 
                    min={1} 
                    value={inputTotalItem} 
                    onChange={e => setInputTotalItem(Number(e.target.value))} 
                    className="w-16 bg-slate-950 border border-slate-700 text-center text-white rounded p-1"
                  />
                  <span className="text-slate-400">項 ➔</span>
                  <span className="font-bold text-[#00f2fe] text-xs bg-slate-950 px-2 py-1 rounded border border-blue-500/30">
                    第 {calculatedPage} 頁 第 {calculatedRow} 項
                  </span>
                </div>
              </div>
            )}
            <div className="text-[10px] text-slate-500 mt-2">
              規則：固定每頁 44 筆，與實體進貨單完全同步
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}

// ==========================================
// 方案 B View
// ==========================================
function VersionBView({ isMobile }: { isMobile: boolean }) {
  return (
    <div className="min-h-[580px] flex flex-col justify-between bg-[#07142b] p-6 text-center">
      <div className="space-y-6">
        <div>
          <div className="w-12 h-12 rounded-2xl bg-[#162a56] border border-[#00f2fe]/40 text-[#00f2fe] mx-auto flex items-center justify-center shadow-[0_0_20px_rgba(0,242,254,0.3)] mb-3">
            <PackageSearch className="w-6 h-6" />
          </div>
          <h2 className="text-2xl md:text-3xl font-black text-white">
            Phama<span className="text-[#00f2fe]">Count</span> Web
          </h2>
          <p className="text-xs text-slate-400 mt-1">每頁 44 項紙本高精準數位化核對</p>
        </div>

        <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2 max-w-xl mx-auto'} gap-4`}>
          <div className="bg-[#162a56]/80 border border-blue-500/30 hover:border-[#00f2fe] rounded-2xl p-6 flex flex-col items-center justify-between min-h-[180px] cursor-pointer">
            <FileUp className="w-8 h-8 text-[#00f2fe] mb-2" />
            <div className="text-base font-bold text-white">匯入清單</div>
            <div className="text-xs text-slate-400">上傳紙本清冊檔案自動生成分頁</div>
            <div className="text-[11px] text-[#00f2fe] border-t border-slate-800 pt-2 w-full mt-3">拖曳或點選上傳 &rarr;</div>
          </div>

          <div className="bg-[#162a56]/80 border border-[#00f2fe]/50 hover:border-[#00f2fe] rounded-2xl p-6 flex flex-col items-center justify-between min-h-[180px] cursor-pointer shadow-[0_0_20px_rgba(0,242,254,0.2)]">
            <ClipboardCheck className="w-8 h-8 text-[#00f2fe] mb-2" />
            <div className="text-base font-bold text-white">開始清點</div>
            <div className="text-xs text-slate-400">進入分類目錄核對條碼與實拍</div>
            <div className="text-[11px] text-[#00f2fe] font-bold border-t border-slate-800 pt-2 w-full mt-3">3 份清單待續 &rarr;</div>
          </div>
        </div>

        <div className="max-w-md mx-auto bg-slate-900/60 border border-slate-800 rounded-xl p-2.5 flex items-center gap-2">
          <input type="text" placeholder="快速搜尋單號或條碼直達..." className="bg-transparent text-xs text-white placeholder-slate-500 flex-1 outline-none px-2" />
          <button className="bg-[#162a56] text-[#00f2fe] border border-blue-500/30 text-xs px-3 py-1 rounded-lg">前往</button>
        </div>
      </div>

      <div className="text-xs text-slate-500">© 2026 PhamaCount Web</div>
    </div>
  );
}

// ==========================================
// 方案 C View
// ==========================================
function VersionCView({ isMobile }: { isMobile: boolean }) {
  if (isMobile) {
    return (
      <div className="min-h-[580px] flex flex-col justify-between bg-[#07142b] p-4">
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="font-bold text-white">Phama<span className="text-[#00f2fe]">Count</span></span>
            <span className="text-[11px] text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-2 py-0.5 rounded-full">現場作業模式</span>
          </div>

          <div className="bg-gradient-to-r from-blue-900/80 to-[#162a56] border-2 border-[#00f2fe] rounded-2xl p-4 shadow-[0_0_20px_rgba(0,242,254,0.25)]">
            <div className="text-[10px] text-[#00f2fe] font-bold uppercase">一鍵接續作業</div>
            <h3 className="text-base font-bold text-white mt-1">裕利常溫進貨單 10/28</h3>
            <p className="text-xs text-slate-300 mt-1">目前進度：第 1 頁 • 已核對 32 / 44 項</p>
            <button className="w-full mt-3.5 bg-[#00f2fe] text-slate-950 font-black py-2.5 rounded-xl text-sm flex items-center justify-center gap-2">
              <Barcode className="w-4 h-4" /> 開啟相機掃描核對
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#162a56]/60 border border-slate-800 p-3.5 rounded-xl">
              <div className="text-xs font-bold text-white">所有清單清冊</div>
              <div className="text-[10px] text-slate-400 mt-0.5">分類資料夾與歷史</div>
            </div>
            <div className="bg-[#162a56]/60 border border-slate-800 p-3.5 rounded-xl">
              <div className="text-xs font-bold text-white">上傳紙本名冊</div>
              <div className="text-[10px] text-slate-400 mt-0.5">匯入新進貨單</div>
            </div>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-2.5 rounded-2xl flex justify-around text-xs text-slate-400">
          <span className="text-[#00f2fe] font-bold">首頁</span>
          <span>清單</span>
          <span>報表</span>
          <span>設定</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[580px] p-6 bg-[#07142b]">
      <div className="grid grid-cols-12 gap-5 max-w-4xl mx-auto">
        <div className="col-span-7 bg-[#162a56]/70 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between min-h-[360px]">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-bold text-white">進行中清點作業</span>
              <span className="text-xs text-[#00f2fe]">管理所有目錄 &rarr;</span>
            </div>
            <div className="space-y-2.5">
              <div className="p-3 bg-[#0d1e40] border border-blue-500/30 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-white">2026-10-28 裕利常溫進貨單</div>
                  <div className="text-[11px] text-slate-400">已核對 32 項 (72%)</div>
                </div>
                <button className="bg-[#00f2fe] text-slate-950 font-bold px-3 py-1 rounded-lg text-xs">前往清點</button>
              </div>
              <div className="p-3 bg-[#0d1e40] border border-blue-500/30 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-white">2026-10-28 冷藏生物製劑</div>
                  <div className="text-[11px] text-slate-400">已核對 8 項 (44%)</div>
                </div>
                <button className="bg-slate-800 text-slate-200 border border-slate-700 px-3 py-1 rounded-lg text-xs">前往清點</button>
              </div>
            </div>
          </div>
          <div className="text-xs text-emerald-400 border-t border-slate-800 pt-3">
            ● 紙本 44 項自動對位已就緒
          </div>
        </div>

        <div className="col-span-5 bg-[#162a56]/40 border border-dashed border-blue-500/40 rounded-2xl p-5 flex flex-col items-center justify-center text-center">
          <FileUp className="w-10 h-10 text-[#00f2fe] mb-2" />
          <div className="text-sm font-bold text-white">拖曳清冊至此或點擊上傳</div>
          <p className="text-xs text-slate-400 mt-1 max-w-[200px]">支援 Excel 與 PDF，自動識別單號與 44 項分頁</p>
          <button className="mt-4 bg-[#162a56] border border-blue-500/30 text-blue-300 px-3 py-1 rounded-lg text-xs">選擇檔案</button>
        </div>
      </div>
    </div>
  );
}
