'use client';

import { useState } from 'react';
import DrugSearchTab from './Tabs/DrugSearchTab';
import TrendTab from './Tabs/TrendTab';
import HeatmapTab from './Tabs/HeatmapTab';
import ExportTab from './Tabs/ExportTab';

export default function QueryTabs() {
  const [activeTab, setActiveTab] = useState<'search' | 'trend' | 'heatmap' | 'export'>('search');

  return (
    <div className="flex h-full flex-col">
      {/* 頁籤 */}
      <div className="flex h-12 bg-slate-900/50 backdrop-blur-md border-b border-slate-600/50">
        <button 
          onClick={() => setActiveTab('search')}
          className={`flex-1 flex items-center justify-center text-sm font-medium 
                     ${activeTab === 'search' ? 'text-[#00f2fe] border-b-2 border-[#00f2fe]' : 'text-slate-400 hover:text-slate-300'}`}
        >
          藥品搜尋
        </button>
        <button 
          onClick={() => setActiveTab('trend')}
          className={`flex-1 flex items-center justify-center text-sm font-medium 
                     ${activeTab === 'trend' ? 'text-[#00f2fe] border-b-2 border-[#00f2fe]' : 'text-slate-400 hover:text-slate-300'}`}
        >
          趨勢分析
        </button>
        <button 
          onClick={() => setActiveTab('heatmap')}
          className={`flex-1 flex items-center justify-center text-sm font-medium 
                     ${activeTab === 'heatmap' ? 'text-[#00f2fe] border-b-2 border-[#00f2fe]' : 'text-slate-400 hover:text-slate-300'}`}
        >
          熱力圖分析
        </button>
        <button 
          onClick={() => setActiveTab('export')}
          className={`flex-1 flex items-center justify-center text-sm font-medium 
                     ${activeTab === 'export' ? 'text-[#00f2fe] border-b-2 border-[#00f2fe]' : 'text-slate-400 hover:text-slate-300'}`}
        >
          導出報表
        </button>
      </div>
      
      {/* 內容區域 */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'search' && <DrugSearchTab />}
        {activeTab === 'trend' && <TrendTab />}
        {activeTab === 'heatmap' && <HeatmapTab />}
        {activeTab === 'export' && <ExportTab />}
      </div>
    </div>
  );
}