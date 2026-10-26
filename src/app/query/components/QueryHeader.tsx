'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { Bell, LogOut, Sun, Moon, Settings, Search, Plus, Upload } from 'lucide-react';

interface QueryHeaderProps {
  user: {
    id: string;
    name?: string;
    email?: string;
    role?: 'counter' | 'pharmacist' | 'manager';
  };
  isOffline: boolean;
}

export default function QueryHeader({ user, isOffline }: QueryHeaderProps) {
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
    <div className="flex items-center justify-between px-6 py-4 bg-slate-800/50 border-b border-slate-800">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-bold text-[#00f2fe]">藥品查詢系統</h1>
        <div className="flex items-center gap-2 text-sm">
          <div className="flex items-center gap-1">
            <Sun className="w-4 h-4" />
            <span className="text-slate-300">淡色模式</span>
          </div>
          <div className="flex items-center gap-1">
            <Moon className="w-4 h-4" />
            <span className="text-slate-300">深色模式</span>
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        <div className="relative">
          <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="搜尋藥品..."
            className="pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-[#00f2fe] focus:bg-slate-800 text-white"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={handleExport}
            className="flex items-center gap-1 px-3 py-1.5 bg-slate-800/50 border border-slate-700 rounded-xl hover:bg-slate-800 active:scale-95 active:bg-slate-700 transition-all duration-100 text-sm text-slate-200"
          >
            <Upload className="w-4 h-4" />
            <span>匯出</span>
          </button>
          
          <button 
            onClick={handleSettings}
            className="flex items-center gap-1 px-3 py-1.5 bg-slate-800/50 border border-slate-700 rounded-xl hover:bg-slate-800 active:scale-95 active:bg-slate-700 transition-all duration-100 text-sm text-slate-200"
          >
            <Settings className="w-4 h-4" />
            <span>設定</span>
          </button>
          
          <button 
            onClick={handleLogout}
            className="flex items-center gap-1 px-3 py-1.5 bg-slate-800/50 border border-slate-700 rounded-xl hover:bg-slate-800 active:scale-95 active:bg-slate-700 transition-all duration-100 text-sm text-slate-200"
          >
            <LogOut className="w-4 h-4" />
            <span>登出</span>
          </button>
          
          {/* User avatar/status */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-slate-800/50 border-2 border-[#00f2fe] rounded-full flex items-center justify-center">
              {user.name?.charAt(0) ?? 'U'}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium">{user.name || '使用者'}</span>
              <span className="text-xs text-slate-400 capitalize">{user.role ?? 'counter'}</span>
            </div>
          </div>
          
          {/* Offline indicator */}
          {isOffline && (
            <div className="flex items-center gap-1 px-2 py-0.5 bg-[#ff4b5c]/20 rounded-full">
              <Bell className="w-3 h-3 text-[#ff4b5c]" />
              <span className="text-xs text-[#ff4b5c]">離線</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}