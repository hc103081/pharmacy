'use client';

import React, { useState, useEffect } from 'react';
import { Folder, ChevronRight, ChevronDown, FolderPlus, Home, Loader2, Check } from 'lucide-react';
import { ManifestFolder } from '@/types';
import { getFolderTree } from '@/app/actions/manifests/folders';

interface MoveToFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  manifestIds: string[];
  currentFolderId: string | null;
  onConfirmMove: (targetFolderId: string | null) => Promise<void>;
}

export function MoveToFolderModal({
  isOpen,
  onClose,
  manifestIds,
  currentFolderId,
  onConfirmMove,
}: MoveToFolderModalProps) {
  const [allFolders, setAllFolders] = useState<ManifestFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(currentFolderId);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // 載入完整資料夾樹
  useEffect(() => {
    if (!isOpen) return;
    async function loadTree() {
      setLoading(true);
      const res = await getFolderTree();
      if (res.success && res.folders) {
        setAllFolders(res.folders);
        // 預設展開第一層資料夾
        const roots = new Set(res.folders.filter(f => !f.parent_id).map(f => f.id));
        setExpandedIds(roots);
      }
      setLoading(false);
    }
    loadTree();
    setSelectedFolderId(currentFolderId);
  }, [isOpen, currentFolderId]);

  if (!isOpen) return null;

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(expandedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpandedIds(next);
  };

  const handleConfirm = async () => {
    setMoving(true);
    try {
      await onConfirmMove(selectedFolderId);
      onClose();
    } finally {
      setMoving(false);
    }
  };

  // 構建階層樹渲染
  const renderTreeNodes = (parentId: string | null, depth: number = 0) => {
    const children = allFolders.filter(f => f.parent_id === parentId);
    if (children.length === 0) return null;

    return (
      <div className="flex flex-col gap-1">
        {children.map((folder) => {
          const isSelected = selectedFolderId === folder.id;
          const isExpanded = expandedIds.has(folder.id);
          const hasChildren = allFolders.some(f => f.parent_id === folder.id);

          return (
            <div key={folder.id} className="flex flex-col">
              <div
                onClick={() => setSelectedFolderId(folder.id)}
                style={{ paddingLeft: `${16 + depth * 20}px` }}
                className={`flex items-center justify-between py-2.5 pr-3 rounded-xl cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-[#00f2fe]/20 text-[#00f2fe] border border-[#00f2fe]/40 shadow-[0_0_12px_rgba(0,242,254,0.15)]'
                    : 'hover:bg-slate-800/60 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {/* 展開/折疊箭頭 */}
                  {hasChildren ? (
                    <button
                      onClick={(e) => toggleExpand(folder.id, e)}
                      className="p-1 rounded hover:bg-slate-700/50 text-slate-400 hover:text-slate-200"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-[#00f2fe]" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>
                  ) : (
                    <div className="w-5" />
                  )}

                  <Folder className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-[#00f2fe]' : 'text-slate-400'}`} />
                  <span className="text-sm font-medium truncate">{folder.name}</span>
                </div>

                {isSelected && (
                  <Check className="w-4 h-4 text-[#00f2fe] flex-shrink-0" />
                )}
              </div>

              {/* 子節點遞迴 */}
              {hasChildren && isExpanded && (
                <div className="mt-0.5">
                  {renderTreeNodes(folder.id, depth + 1)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-[#0d1d3a] border border-slate-700/80 rounded-2xl p-5 shadow-2xl flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-base font-semibold text-white">移動清單</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              已選取 <span className="text-[#00f2fe] font-medium">{manifestIds.length}</span> 份清單
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={moving}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Folder List Tree */}
        <div className="flex-1 overflow-y-auto py-3 my-2 no-scrollbar min-h-[220px]">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400 text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#00f2fe]" />
              <span>載入資料夾結構中...</span>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {/* Option: 移至未分類（根目錄） */}
              <div
                onClick={() => setSelectedFolderId(null)}
                className={`flex items-center justify-between py-2.5 px-3 rounded-xl cursor-pointer transition-all ${
                  selectedFolderId === null
                    ? 'bg-[#00f2fe]/20 text-[#00f2fe] border border-[#00f2fe]/40 shadow-[0_0_12px_rgba(0,242,254,0.15)]'
                    : 'hover:bg-slate-800/60 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Home className="w-4 h-4" />
                  <span className="text-sm font-medium">根目錄（移出資料夾 / 未分類）</span>
                </div>
                {selectedFolderId === null && <Check className="w-4 h-4 text-[#00f2fe]" />}
              </div>

              {/* 樹狀資料夾列表 */}
              {renderTreeNodes(null, 0)}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
          <button
            onClick={onClose}
            disabled={moving}
            className="px-4 py-2 rounded-xl text-xs sm:text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={moving || loading}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-[#00f2fe] hover:bg-[#00d0db] text-slate-950 transition-all shadow-[0_0_15px_rgba(0,242,254,0.3)] active:scale-95 disabled:opacity-50"
          >
            {moving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>移動中...</span>
              </>
            ) : (
              <span>確認移動</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
