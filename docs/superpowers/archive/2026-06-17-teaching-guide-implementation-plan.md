# PhamaCount 教學指引實施計畫

## 1. 實施目標
根據已批准的設計文件，實作一個互動式教學指引系統，以協助新手使用者快速上手 PhamaCount 藥局智能清點系統。

## 2. 實施範圍
- 教學管理核心 (TeachingCore)
- 教學入口按鈕 (TeachingButton)
- 教學彈窗容器 (TeachingModal)
- 教學內容資料結格式
- 六個主要教學模組的內容：
  1. 系統概覽
  2. 條碼掃描
  3. 匯入功能
  4. 拍照留存
  5. 異常處理
  6. 報告匯出

## 3. 實施階段與時間表

### 第一階段：核心功能實作 (預計 3-4 個工作日)
| 任務 | 描述 | 負責人 | 估計時間 |
|------|------|--------|----------|
| 8.1 | 建立教學狀態管理核心 (TeachingCore) | 後端/Frontend 工程師 | 0.5 天 |
| 8.2 | 實作基本的教學入口按鈕 (TeachingButton) | 前端工程師 | 0.5 天 |
| 8.3 | 實作教學彈窗容器與背景遮罩 (TeachingModal) | 前端工程師 | 1 天 |
| 8.4 | 建立基本的教學內容結構 (JSON 格式) | 全體工程師 | 0.5 天 |
| 8.5 | 實作頁面切換功能 (上一頁/下一頁) | 前端工程師 | 0.5 天 |
| 8.6 | 實作關閉機制 (關閉按鈕和遮罩點擊) | 前端工程師 | 0.5 天 |

### 第二階段：內容創建與優化 (預計 4-5 個工作日)
| 任務 | 描述 | 負責人 | 估計時間 |
|------|------|--------|----------|
| 9.1 | 編寫系統概覽教學內容 | 產品經理 + 工程師 | 0.5 天 |
| 9.2 | 編寫條碼掃描功能教學內容 | 產品經理 + 工程師 | 0.5 天 |
| 9.3 | 編寫匯入功能教學內容 | 產品經理 + 工程師 | 0.5 天 |
| 9.4 | 編寫拍照留存功能教學內容 | 產品經理 + 工程師 | 0.5 天 |
| 9.5 | 編寫異常處理教學內容 | 產品經理 + 工程師 | 0.5 天 |
| 9.6 | 編寫報告匯出教學內容 | 產品經理 + 工程師 | 0.5 天 |
| 9.7 | 優化動畫效果和過渡時間 | 前端工程師 | 1 天 |
| 9.8 | 適配不同螢幕尺寸的響應式設計 | 前端工程師 | 1 天 |

### 第三階段：測試與部署 (預計 2-3 個工作日)
| 任務 | 描述 | 負責人 | 估計時間 |
|------|------|--------|----------|
| 10.1 | 單元測試：教學狀態管理器 | 後端/Frontend 工程師 | 0.5 天 |
| 10.2 | 單元測試：教學按鈕組件 | 前端工程師 | 0.5 天 |
| 10.3 | 單元測試：教學彈窗組件 | 前端工程師 | 0.5 天 |
| 10.4 | 單元測試：教學內容渲染 | 前端工程師 | 0.5 天 |
| 10.5 | 整合測試：完整教學流程 | QA 工程師 | 1 天 |
| 10.6 | 整合測試：不同教學模組切換 | QA 工程師 | 0.5 天 |
| 10.7 | 整合測試：響應式斷點測試 | QA 工程師 | 0.5 天 |
| 10.8 | 使用者接受度測試 (UAT) | 產品經理 + 實際使用者 | 1 天 |
| 10.9 | 效能測量和優化 | 前端工程師 | 0.5 天 |
| 10.10 | 部署到測試環境 | DevOps 工程師 | 0.5 天 |
| 10.11 | 部署到生產環境 | DevOps 工程師 | 0.5 天 |

## 4. 技術實作細節

### 4.1 文件結構
```
src/
├── components/
│   └── teaching/
│       ├── TeachingCore.tsx
│       ├── TeachingButton.tsx
│       ├── TeachingModal.tsx
│       ├── TeachingContext.tsx
│       └── teaching-content/
│           ├── index.ts
│           ├── system-overview.json
│           ├── barcode-scan.json
│           ├── import-function.json
│           ├── photo-capture.json
│           ├── anomaly-handling.json
│           └── report-export.json
├── hooks/
│   └── useTeaching.ts
└── styles/
    └── teaching.module.css (如果需要額外樣式)
```

### 4.2 核心實作組件

#### TeachingContext.tsx
```typescript
import React, { createContext, useContext, useState, useEffect } from 'react';

export type TeachingModuleType = 
  | 'system-overview'
  | 'barcode-scan'
  | 'import-function'
  | 'photo-capture'
  | 'anomaly-handling'
  | 'report-export'
  | null;

interface TeachingState {
  isOpen: boolean;
  currentStep: number;
  totalSteps: number;
  teachingModule: TeachingModuleType;
}

interface TeachingContextType {
  state: TeachingState;
  openTeaching: (module: TeachingModuleType) => void;
  closeTeaching: () => void;
  nextStep: () => void;
  prevStep: () => void;
  setTeachingModule: (module: TeachingModuleType) => void;
}

const TeachingContext = createContext<TeachingContextType | null>(null);

export const TeachingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<TeachingState>({
    isOpen: false,
    currentStep: 0,
    totalSteps: 0,
    teachingModule: null,
  });

  const openTeaching = (module: TeachingModuleType) => {
    // 載入對應教學內容以獲取總步驟數
    const totalSteps = getTeachingTotalSteps(module);
    setState({ ...state, isOpen: true, currentStep: 0, totalSteps, teachingModule: module });
  };

  const closeTeaching = () => {
    setState({ ...state, isOpen: false, currentStep: 0, totalSteps: 0, teachingModule: null });
  };

  const nextStep = () => {
    if (state.currentStep < state.totalSteps - 1) {
      setState({ ...state, currentStep: state.currentStep + 1 });
    }
  };

  const prevStep = () => {
    if (state.currentStep > 0) {
      setState({ ...state, currentStep: state.currentStep - 1 });
    }
  };

  const setTeachingModule = (module: TeachingModuleType) => {
    const totalSteps = getTeachingTotalSteps(module);
    setState({ ...state, currentStep: 0, totalSteps, teachingModule: module });
  };

  // 模擬從JSON載入教學內容的函數
  const getTeachingTotalSteps = (module: TeachingModuleType): number => {
    // 實際實作中會從對應的JSON文件載入
    const stepCounts: Record<TeachingModuleType, number> = {
      'system-overview': 3,
      'barcode-scan': 5,
      'import-function': 4,
      'photo-capture': 3,
      'anomaly-handling': 4,
      'report-export': 3,
    };
    return stepCounts[module] || 0;
  };

  return (
    <TeachingContext.Provider value={{
      state,
      openTeaching,
      closeTeaching,
      nextStep,
      prevStep,
      setTeachingModule,
    }}>
      {children}
    </TeachingContext.Provider>
  );
};

export const useTeaching = () => {
  const context = useContext(TeachingContext);
  if (!context) {
    throw new Error('useTeaching must be used within a TeachingProvider');
  }
  return context;
};
```

#### TeachingButton.tsx
```typescript
import React from 'react';
import { Info } from 'lucide-react';
import { useTeaching } from '../hooks/useTeaching';

const TeachingButton: React.FC<{ module: TeachingModuleType; className?: string }> = ({ 
  module, 
  className = '' 
}) => {
  const { openTeaching } = useTeaching();

  return (
    <button
      onClick={() => openTeaching(module)}
      className={`fixed bottom-4 right-4 z-50 p-2 rounded-full bg-[#162a56] text-[#00f2fe] hover:bg-[#1e3a6a] hover:text-[#33fefe] transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#00f2fe] focus:ring-offset-2 focus:ring-offset-[#07142b] active:scale-95 shadow-[0_0_10px_rgba(0,242,254,0.3)] ${className}`}
      aria-label="顯示教學"
    >
      <Info className="h-4 w-4" />
    </button>
  );
};

export default TeachingButton;
```

#### TeachingModal.tsx
```typescript
import React from 'react';
import { X } from 'lucide-react';
import { useTeaching } from '../hooks/useTeaching';

const TeachingModal: React.FC = () => {
  const { state, closeTeaching, nextStep, prevStep } = useTeaching();

  if (!state.isOpen || !state.teachingModule) {
    return null;
  }

  // 這裡應該從對應的JSON文件載入當前步驟的內容
  // 為了簡化，這裡使用模擬數據
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

// 模擬函數 - 實際實作中應該從JSON文件載入
const getTeachingTitle = (module: TeachingModuleType | null): string => {
  const titles: Record<TeachingModuleType, string> = {
    'system-overview': '系統概覽',
    'barcode-scan': '條碼掃描功能',
    'import-function': '匯入功能',
    'photo-capture': '拍照留存功能',
    'anomaly-handling': '異常處理',
    'report-export': '報告匯出',
  };
  return titles[module as TeachingModuleType] || '';
};

const getTeachingContent = (module: TeachingModuleType | null, step: number): { 
  title: string; 
  description: string; 
  example?: string 
} => {
  // 這裡應該從對應的JSON文件載入具體內容
  // 為了演示，返回模擬數據
  return {
    title: `步驟 ${step + 1}`,
    description: `這是${getTeachingTitle(module)}的步驟 ${step + 1}的詳細說明內容。在實際實作中，這個內容會從對應的JSON文件中載入。`,
    example: `例如：這裡可以顯示具體的操作範例或截圖說明`
  };
};

export default TeachingModal;
```

### 4.3 使用方式
在需要顯示教學按鈕的地方：
```typescript
import TeachingButton from '@/components/teaching/TeachingButton';

function ScanPage() {
  return (
    <div>
      {/* 頁面內容 */}
      <div className="...">
        {/* 掃描頁面主要內容 */}
      </div>
      
      {/* 教學按鈕 - 放在右下角或特定功能區域 */}
      <TeachingButton module="barcode-scan" className="mb-2" />
    </div>
  );
}
```

在應用程序根部件包裝TeachingProvider：
```typescript
import { TeachingProvider } from '@/components/teaching/TeachingContext';

function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <TeachingProvider>
      {children}
    </TeachingProvider>
  );
}
```

## 5. 測試策略

### 5.1 單元測試
- **TeachingContext**: 測試狀態管理、開啟/關閉教學、步驟切換
- **TeachingButton**: 測試點擊事件傳遞和狀態更新
- **TeachingModal**: 測試開啟/關閉條件、內容渲染、導覽功能
- **教學內容載入**: 測試不同教學模組的內容正確載入

### 5.2 整合測試
- 完整教學流程測試：從點擊按鈕到完成所有步驟再關閉
- 跳步測試：驗證不能跳過步驟直接到最後一步
- 邊界測試：第一步時上一步按鈕禁用，最後一步時下一步按鈕禁用

### 5.3 使用者接受度測試 (UAT)
- 新手使用者測試：觀察使用教學功能後完成特定任務的時間
- 效能測量：教學彈窗開啟延遲 (< 300ms)、頁面切換流暢度 (60fps)
- 滿意度調查：收集使用者對教學內容清晰度、實用性和設計的評分

## 6. 部署與發布

### 6.1 開發環境
- 本地開發：`npm run dev`
- 預覽 URL：http://localhost:3000

### 6.2 測試環境
- 自動部署到 Vercel 預覽環境
- 每個 PR 自動生成預覽 URL

### 6.3 生產環境
- 主分支 (main) 自動部署到 Vercel 生產環境
- 生產 URL：https://phamacount.vercel.app (實際域名請參照專案設定)

### 6.4 監控與回滾
- 部署後監控關鍵指標：頁面載入時間、錯誤率
- 如有問題，可通過 Vercel 即時回滾到之前版本

## 7. 風險與緩解措施

| 風險 | 影響程度 | 緩解措施 |
|------|----------|----------|
| 教學彈窗影響主要功能操作 | 中 | 確保關閉機制可靠，提供點擊遮罩關閉選項 |
| 響應式設計在特定設備上顯示異常 | 中 | 在多種實機和模擬器上進行測試 |
| 教學內容過長導致閱讀疲勞 | 低 | 保持每步驟內容簡浮，建議不超過150字 |
| 動畫效果在低端設備上卡頓 | 低 | 提供減少動畫的選項（尊重系統偏好） |
| 未來教學內容更新困難 | 低 | 使用JSON結構化存儲，簡化內容更新流程 |

## 8. 里程碑與交付物

### 里程碑 1：核心功能完成 (第 3-4 天)
- 教學狀態管理核心運作正常
- 教學入口按鈕和彈窗基本功能完成
- 能夠開啟關閉教學彈窗
- 基本的頁面切換功能完成

### 里程碑 2：內容完成與優化 (第 7-8 天)
- 所有六個教學模組的內容創建完成
- 動畫效果流暢且符合設計規範
- 響應式設計在各種設備上顯示良好
- 基本的單元測試通過

### 里程碑 3：測試與部署 (第 9-10 天)
- 整合測試和 UAT 完成
- 效能達標（開啟延遲 < 300ms，頁面切換 60fps）
- 成功部署到測試環境和生產環境
- 使用者滿意度達到預期目標（滿意度 ≥ 4/5）

## 9. 成本估算

### 人力成本
- 前端工程師：5 人天
- 產品經理：2 人天（內容編寫與審核）
- QA 工程師：2 人天
- DevOps 工程師：1 人天
- **總計：約 10 人天**

### 其他成本
- 無額外第三方庫授權費用
- 無額外雲端服務費用（使用現有 Vercel 和 Supabase 配額）

## 10. 後續維護與優化建議

### 短期內 (1-2 個月內)
- 收集使用者反饋並優化教學內容
- 修復發現的任何 bug
- 優化效能和載入時間

### 中期 (3-6 個月內)
- 加入教學進度追蹤功能 (localStorage)
- 加入「不再顯示」選項
- 多語言支援準備（將教學內容抽離為可翻譯的格式）

### 長期 (6 個月以上)
- 互動式引導功能：不僅是靜態教學，還能引導使用者實際操作
- 視頻教學支援：在教學內容中嵌入短影片示範
- AI 助教：結合現有的 Google Generative AI 提供智能答疑

## 11. 結論

本實施計畫詳細規劃了 PhamaCount 教學指引功能的開發過程。通過採用自行實作的方式，我們可以：
1. 完美符合專案現有的 UI/UX 設計規範
2. 不增加額外的第三方庫依賴，保持專案輕量
3. 完全控制教學內容和行為，方便未來維護和擴展
4. 按照清晰的階段和里程碑進行開發，確保品質和進度

計畫總預計需要 10 人天，分為三個階段進行，預計兩週內可完成開發、測試並部署到生產環境。