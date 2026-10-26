'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { Bell, LogOut, Settings, Search, Plus, Upload, Sliders } from 'lucide-react';

interface QueryHeaderProps {
  user: {
    id: string;
    name?: string;
    email?: string;
    role?: 'counter' | 'pharmacist' | 'manager';
  };
  isOffline: boolean;
  onMenuClick?: () => void;
}

export default function QueryHeader({ user, isOffline, onMenuClick }: QueryHeaderProps) {
  const router = useRouter();
  const { user: authUser } = useAuth();

  const handleLogout = async () => {
    // TODO: Implement logout functionality
    router.push('/');
  };

  const handleSearch = () => {
    // TODO: Implement global search modal
    alert('Global search functionality coming soon');
  };

  const handleExport = () => {
    // TODO: Implement export modal
    alert('Export functionality coming soon');
  };

  const handleSettings = () => {
    // TODO: Implement settings modal
    alert('Settings functionality coming soon');
  };

  return (
    <header className="flex items-center justify-between px-4 py-3 bg-slate-800/50 border-b border-slate-800 lg:px-6 lg:py-4">
      <div className="flex items-center gap-3 lg:gap-4">
        {/* Mobile menu button */}
        <button
          onClick={onMenuClick}
          className="lg:hidden flex items-center justify-center w-10 h-10 min-w-[44px] min-h-[44px] bg-slate-800/50 border border-slate-700 rounded-xl text-slate-200 hover:bg-slate-800 active:scale-95 active:bg-slate-700 transition-all duration-100"
          aria-label="開啟篩選面板"
        >
          <Sliders className="w-5 h-5" />
        </button>
        
        <h1 className="text-lg lg:text-xl font-bold text-[#00f2fe] truncate">藥品查詢系統</h1>
      </div>
      
      <div className="flex items-center gap-2 lg:gap-4">
        {/* Search input - hidden on very small screens, expandable */}
        <div className="hidden sm:block lg:w-64 sm:w-48 relative">
          <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="搜尋藥品..."
            className="w-full pl-10 pr-4 py-2 min-h-[44px] bg-slate-800/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-[#00f2fe] focus:bg-slate-800 text-white text-sm"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={handleExport}
            className="flex items-center justify-center w-10 h-10 min-w-[44px] min-h-[44px] bg-slate-800/50 border border-slate-700 rounded-xl hover:bg-slate-800 active:scale-95 active:bg-slate-700 transition-all duration-100 text-slate-200"
            aria-label="匯出資料"
          >
            <Upload className="w-5 h-5" />
            <span className="hidden lg:inline">匯出</span>
          </button>
          
          <button 
            onClick={handleSettings}
            className="flex items-center justify-center w-10 h-10 min-w-[44px] min-h-[44px] bg-slate-800/50 border border-slate-700 rounded-xl hover:bg-slate-800 active:scale-95 active:bg-slate-700 transition-all duration-100 text-slate-200"
            aria-label="設定"
          >
            <Settings className="w-5 h-5" />
            <span className="hidden lg:inline">設定</span>
          </button>
          
          <button 
            onClick={handleLogout}
            className="flex items-center justify-center w-10 h-10 min-w-[44px] min-h-[44px] bg-slate-800/50 border border-slate-700 rounded-xl hover:bg-slate-800 active:scale-95 active:bg-slate-700 transition-all duration-100 text-slate-200"
            aria-label="登出"
          >
            <LogOut className="w-5 h-5" />
            <span className="hidden lg:inline">登出</span>
          </button>
          
          {/* User avatar/status */}
          <div className="flex items-center gap-2 lg:gap-3 min-w-[44px]">
            <div className="w-8 h-8 min-w-[44px] min-h-[44px] bg-slate-800/50 border-2 border-[#00f2fe] rounded-full flex items-center justify-center">
              {user.name?.charAt(0) ?? 'U'}
            </div>
            <div className="hidden lg:flex flex-col">
              <span className="text-sm font-medium">{user.name || '使用者'}</span>
              <span className="text-xs text-slate-400 capitalize">{user.role ?? 'counter'}</span>
            </div>
          </div>
          
          {/* Offline indicator */}
          {isOffline && (
            <div className="flex items-center gap-1 px-2 py-0.5 bg-[#ff4b5c]/20 rounded-full min-h-[44px]">
              <Bell className="w-3 h-3 text-[#ff4b5c]" />
              <span className="text-xs text-[#ff4b5c]">離線</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}