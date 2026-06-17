'use client';

import React from 'react';
import { X } from 'lucide-react';
import { useTeaching } from './TeachingContext';
import { getTeachingContent, getTeachingTitle } from './teaching-content-loader';
import type { TeachingModuleType } from './TeachingContext';

const TeachingModal: React.FC = () => {
  const { state, closeTeaching, nextStep, prevStep } = useTeaching();

  if (!state.isOpen || !state.teachingModule) {
    return null;
  }

  // 載入對應的教學內容
  const currentContent = getTeachingContent(state.teachingModule, state.currentStep);

  // 處理描述文字以保留原始換行並添加語義換行
  let processedDescription = currentContent.description;
  if (processedDescription) {
    // 處理數字加括號的模式（如 "1) "、"2) " 等）
    processedDescription = processedDescription.replace(/(\d+\)\s)/g, '\n$1');
    // 處理數字加點的模式（如 "1. "、"2. " 等）
    processedDescription = processedDescription.replace(/(\d+\.\s)/g, '\n$1');
    
    // 移除開頭可能多餘的換行
    processedDescription = processedDescription.replace(/^\n+/, '');
  }

  // 計算進度條寬度百分比（加強防禦性程式設計）
  let progressWidth = 0;
  if (state.totalSteps > 0 && state.currentStep >= 0) {
    // 計算當前進度：(當前步驟索引 + 1) / 總步驟數 * 100
    const progressRatio = (state.currentStep + 1) / state.totalSteps;
    progressWidth = Math.round(progressRatio * 100);
    // 確保在 0-100 範圍內（處理浮點數誤差和邊界條件）
    progressWidth = Math.max(0, Math.min(100, progressWidth));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div 
        onClick={closeTeaching}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
      />
      
      {/* 教學內容容器 */}
      <div className="relative w-[90%] max-w-[500px] max-h-[80vh] bg-[#162a56]/[0.9] backdrop-blur-md rounded-2xl shadow-2xl border border-[#00f2fe]/[0.2] overflow-hidden">
        {/* 頭部：標題和關閉按鈕 */}
        <div className="flex justify-between items-start p-4 border-b border-[#00f2fe]/[0.1]">
          <h2 className="text-[#00f2fe] font-semibold text-lg">{getTeachingTitle(state.teachingModule)}</h2>
          <button 
            onClick={closeTeaching}
            className="p-1 rounded hover:bg-[#00f2fe]/[0.2] transition-colors duration-200"
            aria-label="關閉教學"
          >
            <X className="h-4 w-4 text-[#ff4b5c]" />
          </button>
        </div>
        
        {/* 進度條 */}
        <div className="flex-1 h-1.5 bg-[#00f2fe]/[0.1] rounded overflow-hidden mx-4">
          <div 
            className="h-full bg-[#00f2fe] transition-all duration-300"
            style={{ width: `${progressWidth}%` }}
          ></div>
        </div>
        
        {/* 內容區域 */}
        <div className="p-6 space-y-5 overflow-y-auto">
          <div className="text-[#e2e8f0] text-base leading-[1.7]">
            {currentContent.title && (
              <h3 className="text-[#00f2fe] font-semibold text-lg mb-4">{currentContent.title}</h3>
            )}
            <p className="text-base leading-[1.6] mb-4 whitespace-pre-wrap break-all w-full">{processedDescription}</p>
            {currentContent.example && (
              <div className="mt-6 p-4 bg-[#00f2fe]/[0.1] rounded-lg border border-[#00f2fe]/[0.2]">
                <p className="text-sm text-[#00f2fe]/[0.9] font-mono whitespace-pre-wrap">{currentContent.example}</p>
              </div>
            )}
          </div>
        </div>
        
        {/* 底部：導覽控制 */}
        <div className="flex items-center justify-center p-4 border-t border-[#00f2fe]/[0.1]">
          <div className="flex items-center space-x-2">
            <button 
              onClick={prevStep}
              disabled={state.currentStep === 0}
              className={`px-4 py-2 rounded text-sm ${state.currentStep === 0 ? 'opacity-50 cursor-not-allowed' : 'text-[#00f2fe] hover:bg-[#00f2fe]/[0.2]'}`}
            >
              上一步
            </button>
            <span className="text-[#cbd5e1] text-sm font-medium">
              {state.currentStep + 1} / {state.totalSteps}
            </span>
            <button 
              onClick={nextStep}
              disabled={state.currentStep >= state.totalSteps - 1}
              className={`px-4 py-2 rounded text-sm ${state.currentStep >= state.totalSteps - 1 ? 'opacity-50 cursor-not-allowed' : 'text-[#00f2fe] hover:bg-[#00f2fe]/[0.2]'}`}
            >
              下一步
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeachingModal;
export { TeachingModal };