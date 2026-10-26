'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { Bell, LogOut, Settings, Search, Upload, Menu, X, User } from 'lucide-react';
import { Button } from '@/app/query/components/ui';
import { Input } from '@/app/query/components/ui';
import { FadeIn, SlideIn } from '@/app/query/components/ui/MotionWrapper';
import { cn } from '@/app/query/design-system';
import { UI_TEXT } from '@/app/query/constants/ui-text';

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
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleLogout = () => {
    router.push('/');
  };

  const handleExport = () => {
    alert('匯出功能開發中');
  };

  const handleSettings = () => {
    alert('設定功能開發中');
  };

  const handleSearch = () => {
    setSearchOpen(!searchOpen);
    if (!searchOpen) {
      setTimeout(() => {
        const input = document.getElementById('global-search-input');
        input?.focus();
      }, 100);
    }
  };

  return (
    <header className={cn(
      'flex items-center justify-between px-4 py-3 lg:px-6 lg:py-4',
      'bg-[${colors.bg.surface}]/50',
      'backdrop-blur-sm',
      'border-b border-[${colors.border.panel}]',
      'sticky top-0 z-20'
    )}>
      <div className="flex items-center gap-3 lg:gap-4">
        {/* Mobile menu button */}
        <Button
          variant="icon"
          size="icon"
          onClick={onMenuClick}
          aria-label="開啟篩選面板"
          className="lg:hidden"
        >
          <Menu className="w-5 h-5" />
        </Button>
        
        {/* Title */}
        <FadeIn y={10} delay={0.05}>
          <h1 className={cn('text-lg lg:text-xl font-bold truncate', 'text-[${colors.accent.primary}]')}>
            {UI_TEXT.appTitle}
          </h1>
        </FadeIn>
      </div>
      
      <div className="flex items-center gap-2 lg:gap-3">
        {/* Global Search - expandable on mobile */}
        <SlideIn direction="right" delay={0.1}>
          <div className={cn(
            'relative',
            'hidden sm:block lg:w-72 sm:w-56',
            searchOpen && 'lg:hidden fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'
          )}>
            {searchOpen && (
              <div 
                className="absolute inset-0" 
                onClick={() => setSearchOpen(false)}
                aria-hidden="true"
              />
            )}
            <div className={cn(
              'relative w-full',
              searchOpen && 'lg:w-72 max-w-[90vw] bg-[${colors.bg.surface}] rounded-xl shadow-xl border border-[${colors.border.panel}] p-2'
            )}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[${colors.text.muted}]" aria-hidden="true" />
                <Input
                  id="global-search-input"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜尋藥品、條碼、清單..."
                  variant="search"
                  className="min-h-[44px] pr-10"
                  autoFocus={searchOpen}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setSearchOpen(false);
                    if (e.key === 'Enter') {
                      alert(`搜尋: ${searchQuery}`);
                      setSearchOpen(false);
                    }
                  }}
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    onClick={() => setSearchQuery('')}
                    aria-label="清除搜尋"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
              {searchOpen ? (
                <div className="mt-2 px-1">
                  <p className="text-xs text-center text-[${colors.text.muted}]">
                    {UI_TEXT.searchHint}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </SlideIn>
        
        {/* Action Buttons */}
        <FadeIn y={10} delay={0.15}>
          <div className="flex items-center gap-1.5">
            <Button
              variant="icon"
              size="icon"
              onClick={handleExport}
              aria-label="匯出資料"
              className="min-w-[44px] min-h-[44px]"
            >
              <Upload className="w-5 h-5" />
              <span className="hidden lg:inline">匯出</span>
            </Button>
            
            <Button
              variant="icon"
              size="icon"
              onClick={handleSettings}
              aria-label="設定"
              className="min-w-[44px] min-h-[44px]"
            >
              <Settings className="w-5 h-5" />
              <span className="hidden lg:inline">設定</span>
            </Button>
            
            <Button
              variant="icon"
              size="icon"
              onClick={handleSearch}
              aria-label={searchOpen ? '關閉搜尋' : '開啟搜尋'}
              className="min-w-[44px] min-h-[44px] lg:hidden"
            >
              {searchOpen ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
            </Button>
            
            <Button
              variant="icon"
              size="icon"
              onClick={handleLogout}
              aria-label="登出"
              className="min-w-[44px] min-h-[44px]"
            >
              <LogOut className="w-5 h-5" />
              <span className="hidden lg:inline">登出</span>
            </Button>
            
            {/* User avatar/status */}
            <div className="flex items-center gap-2 lg:gap-3 min-w-[44px] ml-1">
              <div className="relative">
                <div className={cn(
                  'w-9 h-9 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center',
                  'font-bold text-sm',
                  'bg-[${colors.bg.surfaceHover}]',
                  'border border-[${colors.accent.primary}]',
                  'text-[${colors.accent.primary}]'
                )}>
                  {user.name?.charAt(0).toUpperCase() ?? 'U'}
                </div>
                {isOffline && (
                  <span className={cn(
                    'absolute -bottom-1 -right-1 w-3 h-3 rounded-full',
                    'bg-[${colors.accent.error}]',
                    'bg-[${colors.bg.primary}]'
                  )} aria-hidden="true" />
                )}
              </div>
              <div className="hidden lg:flex flex-col items-end">
                <span className="text-sm font-medium text-white truncate max-w-[120px]">
                  {user.name || '使用者'}
                </span>
                <span className="text-xs capitalize text-[${colors.text.muted}]">
                  {UI_TEXT.roleLabels[user.role ?? 'counter']}
                </span>
              </div>
            </div>
            
            {/* Offline indicator */}
            {isOffline && (
              <div className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-full min-h-[44px] lg:ml-2',
                'bg-[${colors.accent.error}]/15'
              )}>
                <Bell className="w-3.5 h-3.5 text-[${colors.accent.error}]" aria-hidden="true" />
                <span className="text-xs font-medium text-[${colors.accent.error}]">離線模式</span>
              </div>
            )}
          </div>
        </FadeIn>
      </div>
    </header>
  );
}