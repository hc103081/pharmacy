'use client';

import { useAuth } from './AuthProvider';
import { LogOut, User } from 'lucide-react';

export function UserMenu() {
  const { user, loading, signOut } = useAuth();

  if (loading || !user) return null;

  return (
    <div className="flex items-center justify-end gap-3 px-4 py-2 bg-[#162a56]/60 border-b border-blue-500/20">
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <User className="w-3.5 h-3.5" />
        <span className="truncate max-w-[160px]">{user.email}</span>
      </div>
      <button
        onClick={signOut}
        className="text-xs text-slate-500 hover:text-red-400 transition-colors flex items-center gap-1"
      >
        <LogOut className="w-3.5 h-3.5" />
        登出
      </button>
    </div>
  );
}