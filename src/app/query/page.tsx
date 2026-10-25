'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import QueryHeader from './components/QueryHeader';
import SearchPanel from './components/SearchPanel';
import { Tabs } from './components/Tabs';
import DrugSearchTab from './components/Tabs/DrugSearchTab';
import HistoryTab from './components/Tabs/HistoryTab';
import TrendTab from './components/Tabs/TrendTab';
import ReportTab from './components/Tabs/ReportTab';
import { useOfflineCache } from './hooks/useOfflineCache';
import { QueryFiltersProvider } from './context/QueryFiltersContext';
import { QueryErrorBoundary } from './components/QueryErrorBoundary';

export default function QueryPage() {
  const { user, loading } = useAuth();
  const [isOffline, setIsOffline] = useState(false);
  const { isCached, refreshCache } = useOfflineCache();

  // Detect online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Set initial state asynchronously to avoid synchronous setState in effect
    const setInitialState = () => setIsOffline(!navigator.onLine);
    requestAnimationFrame(setInitialState);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 當 loading 時顯示登入頁面，避免使用者狀態未同步時的錯誤
  if (loading) {
    return (
      <div className="min-h-[100vh] flex items-center justify-center bg-[#07142b]">
        <div className="text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-500">載入中...</p>
          </div>
          <p className="text-slate-400">正在驗證使用者身份，請稍候...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-[100vh] flex items-center justify-center bg-[#07142b]">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-4">請先登入</h2>
          <p className="text-slate-400">您需要登入才能使用查詢系統</p>
        </div>
      </div>
    );
  }

  return (
    <QueryFiltersProvider>
      <QueryErrorBoundary>
        <div className="min-h-[100vh] bg-[#07142b] text-white">
          {/* Offline indicator */}
          {isOffline && (
            <div className="fixed top-0 left-0 right-0 h-4 bg-[#ff4b5c]/90 flex items-center justify-center z-50">
              <span className="text-sm text-white">離線模式，顯示快取資料</span>
            </div>
          )}
          
          <div className="flex h-[100vh] overflow-hidden">
            {/* Mobile: collapsible search panel */}
            <SearchPanel className="hidden lg:block lg:w-64 border-r border-slate-800" />
            
            <div className="flex-1 flex flex-col overflow-hidden">
              <QueryHeader user={{ ...user, role: user.role as 'counter' | 'pharmacist' | 'manager' | undefined }} isOffline={isOffline} />
              
              <div className="flex-1 overflow-hidden">
                <Tabs>
                  <Tabs.TabList className="bg-slate-800/50 border-b border-slate-800">
                    <Tabs.Tab>藥品搜尋</Tabs.Tab>
                    <Tabs.Tab>歷史記錄</Tabs.Tab>
                    <Tabs.Tab>趨勢分析</Tabs.Tab>
                    <Tabs.Tab>報表儀表板</Tabs.Tab>
                  </Tabs.TabList>
                  
                  <Tabs.TabPanels>
                    <Tabs.TabPanel>
                         <DrugSearchTab />
                     </Tabs.TabPanel>
                    <Tabs.TabPanel>
                        <HistoryTab />
                    </Tabs.TabPanel>
                    <Tabs.TabPanel>
                        <TrendTab />
                    </Tabs.TabPanel>
                    <Tabs.TabPanel>
                        <ReportTab />
                    </Tabs.TabPanel>
                </Tabs.TabPanels>
              </Tabs>
              </div>
            </div>
            
            {/* Mobile: search panel as drawer */}
            <SearchPanel 
              className="lg:block lg:hidden w-64 bg-[#07142b]/90 border-l border-slate-800"
              isDrawer
            />
          </div>
        </div>
      </QueryErrorBoundary>
    </QueryFiltersProvider>
  );
}