'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from './AuthProvider';
import { LogOut, User, ChevronDown } from 'lucide-react';
import LogoutConfirmDialog from './LogoutConfirmDialog';

export function UserMenu() {
  const { user, loading, signOut } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Debug: log menu open state changes
  useEffect(() => {
    console.log('UserMenu isMenuOpen =', isMenuOpen);
  }, [isMenuOpen]);

  // Close menu when clicking outside the whole component
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  if (loading || !user) return null;

  const handleLogoutConfirm = async () => {
    console.log('Logout confirm clicked');
    setIsConfirmOpen(false);
    await signOut();
  };

  return (
    // Fixed header at top, covering full width
    <div
      ref={wrapperRef}
      className="fixed top-0 left-0 right-0 flex items-center justify-end px-4 py-2 bg-[#162a56]/60 border-b border-blue-500/20 backdrop-blur-md z-[999] pointer-events-auto"
    >
      {/* Trigger Area */}
      <div
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        className="flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-xl hover:bg-blue-500/10 transition-all active:scale-95 group"
      >
        <div className="flex items-center gap-2 text-xs text-slate-400 group-hover:text-[#00f2fe] transition-colors">
          <User className="w-4 h-4" />
          <span className="truncate max-w-[120px] sm:max-w-[160px] font-medium">
            {user.email}
          </span>
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-200 ${isMenuOpen ? 'rotate-180' : ''}`}
        />
      </div>

      {/* Dropdown Menu */}
      {isMenuOpen && (
        <div className="absolute right-0 top-full mt-2 w-56 z-[1000] animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="tech-card border border-blue-500/30 shadow-[0_0_15px_rgba(0,242,254,0.1)] overflow-hidden backdrop-blur-xl">
            <div className="px-4 py-3 border-b border-blue-500/10 bg-blue-500/5">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">使用者帳戶</p>
              <p className="text-xs text-slate-200 truncate mt-0.5">{user.email}</p>
            </div>
            <div className="p-1">
              <button
                onClick={() => {
                  console.log('Logout button clicked');
                  setIsConfirmOpen(true);
                  setIsMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all group"
              >
                <LogOut className="w-4 h-4 group-hover:scale-110 transition-transform" />
                登出系統
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logout Confirmation Dialog */}
      <LogoutConfirmDialog
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleLogoutConfirm}
      />
    </div>
  );
}
