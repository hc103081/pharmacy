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
        
        {/* 內容區域 */}
        <div className="p-6 space-y-4 overflow-y-auto flex-grow">
          <div className="text-[#e2e8f0] text-base leading-relaxed">
            {currentContent.title && (
              <h3 className="text-[#00f2fe] font-medium mb-2">{currentContent.title}</h3>
            )}
            <p>{currentContent.description}</p>
            {currentContent.example && (
              <div className="mt-4 p-3 bg-[#00f2fe]/[0.1] rounded border border-[#00f2fe]/[0.2]">
                <p className="text-xs text-[#00f2fe]/[0.8] font-mono">{currentContent.example}</p>
              </div>
            )}
          </div>
        </div>
        
        {/* 底部：導覽控制 */}
        <div className="flex items-center justify-between p-4 border-t border-[#00f2fe]/[0.1]">
          <div className="flex items-center space-x-2">
            <button 
              onClick={prevStep}
              disabled={state.currentStep === 0}
              className={`px-3 py-1.5 rounded text-sm ${state.currentStep === 0 ? 'opacity-50 cursor-not-allowed' : 'text-[#00f2fe] hover:bg-[#00f2fe]/[0.2]'}`}
            >
              上一步
            </button>
            <span className="text-[#cbd5e1] text-sm">
              {state.currentStep + 1} / {state.totalSteps}
            </span>
            <button 
              onClick={nextStep}
              disabled={state.currentStep >= state.totalSteps - 1}
              className={`px-3 py-1.5 rounded text-sm ${state.currentStep >= state.totalSteps - 1 ? 'opacity-50 cursor-not-allowed' : 'text-[#00f2fe] hover:bg-[#00f2fe]/[0.2]'}`}
            >
              下一步
            </button>
          </div>
          
          {/* 進度條 (可選) */}
          <div className="flex-1 h-1.5 bg-[#00f2fe]/[0.1] rounded overflow-hidden mx-4">
            <div 
              className={`h-full bg-[#00f2fe] transition-all duration-300 w-[${((state.currentStep + 1) / state.totalSteps) * 100}%]`}
            ></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeachingModal;
export { TeachingModal };