'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { CheckCircle2, AlertCircle, XCircle, RefreshCcw, Check, Eye, Filter, X, Languages } from 'lucide-react';
import { TeachingButton } from '@/components/teaching';
import { ParsedPdf, ParsedItem } from '@/lib/pdfParser';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { PdfValidationResult } from '@/lib/pdfValidator';

interface PreviewPanelProps {
  data: ParsedPdf;
  validation: PdfValidationResult;
  onConfirm: (items: ParsedItem[]) => void;
  onRetry: () => void;
  /** 翻譯選擇變更時回報完整項目清單，供上層持久化（sessionStorage） */
  onItemsChange?: (items: ParsedItem[]) => void;
  isLoading: boolean;
}

type FilterMode = 'all' | 'needs_review' | 'errors_only' | 'pending_translation';

export default function PreviewPanel({
  data,
  validation,
  onConfirm,
  onRetry,
  onItemsChange,
  isLoading,
}: PreviewPanelProps) {
  const [editedItems, setEditedItems] = useState<ParsedItem[]>(data.items);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  /** 多筆翻譯說明彈窗是否已顯示過 */
  const [introDismissed, setIntroDismissed] = useState(false);
  /** 目前開啟候選選擇視窗的項目 line_number */
  const [pickerLine, setPickerLine] = useState<number | null>(null);
  const [manualName, setManualName] = useState('');

  useEffect(() => {
    setTimeout(() => setEditedItems(data.items), 0);
  }, [data]);

  const handleInputChange = (index: number, field: keyof ParsedItem, value: string | number) => {
    const newItems = [...editedItems];
    const item = { ...newItems[index] };
    
    if (field === 'quantity' || field === 'warehouse_quantity') {
      (item as any)[field] = Number(value) || 0;
    } else if (field === 'storage_location' || field === 'category') {
      (item as any)[field] = value as string;
    } else {
      (item as any)[field] = value as string;
    }
    
    newItems[index] = item;
    setEditedItems(newItems);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pass': return <CheckCircle2 className="w-4 h-4 text-green-400" />;
      case 'warn': return <AlertCircle className="w-4 h-4 text-yellow-400" />;
      case 'error': return <XCircle className="w-4 h-4 text-red-400" />;
      default: return null;
    }
  };

  // 新增狀態訊息顯示狀態 (mobile click)
  const [openStatusLine, setOpenStatusLine] = useState<number | null>(null);

  // 判斷品名是否可能有 OCR 風險
  const hasDrugNameRisk = (item: ParsedItem): boolean => {
    const val = validation.itemValidations.find(v => v.line_number === item.line_number);
    // 如果 validator 標記了品名相關的 warn，則認為有風險
    return val?.status === 'warn' && val.messages.some(m => 
      ['含亂碼或問號', '品名全為數字', '品名過短', '品名異常過長', '非中文佔比過高'].includes(m)
    );
  };

  // 待選翻譯（多筆候選且尚未選擇）
  const pendingItems = useMemo(
    () => editedItems.filter(item => item.nhi_status === 'pending'),
    [editedItems]
  );
  const pendingCount = pendingItems.length;
  // 說明彈窗：存在待選翻譯且尚未關閉時顯示
  const showIntro = pendingCount > 0 && !introDismissed;
  const pickerItem = pickerLine != null ? editedItems.find(i => i.line_number === pickerLine) ?? null : null;

  const dismissIntro = () => {
    setIntroDismissed(true);
    setFilter('pending_translation');
  };

  /** 套用使用者選擇的翻譯（候選中文名，或保留原名／手動輸入） */
  const applyTranslation = (lineNumber: number, name: string, status: 'chosen' | 'kept') => {
    const finalName = name.trim();
    if (!finalName) return;
    const next = editedItems.map(i =>
      i.line_number === lineNumber ? { ...i, drug_name: finalName, nhi_status: status } : i
    );
    setEditedItems(next);
    onItemsChange?.(next);
    // 最後一筆待選完成後自動切回「全部」
    if (!next.some(i => i.nhi_status === 'pending')) setFilter('all');
    setPickerLine(null);
    setManualName('');
  };

  // 篩選邏輯
  const filteredItems = useMemo(() => {
    return editedItems.filter(item => {
      const val = validation.itemValidations.find(v => v.line_number === item.line_number);
      const status = val?.status || 'pass';
      const drugRisk = hasDrugNameRisk(item);

      if (filter === 'pending_translation') return item.nhi_status === 'pending';
      if (filter === 'errors_only') return status === 'error';
      if (filter === 'needs_review') return status === 'warn' || status === 'error' || drugRisk;
      return true;
    });
  }, [editedItems, filter, validation]);

  // 統計：需要人工確認的項目數
  const needsReviewCount = useMemo(() => {
    return editedItems.filter(item => {
      const val = validation.itemValidations.find(v => v.line_number === item.line_number);
      const status = val?.status || 'pass';
      return status === 'warn' || status === 'error' || hasDrugNameRisk(item);
    }).length;
  }, [editedItems, validation]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 表頭資訊 - 固定在頂部 */}
      <div className="flex-shrink-0 tech-card p-4 lg:p-6 rounded-b-none space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-[#00f2fe]" />
              解析結果校驗
            </h2>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-slate-500">出貨單號:</span>
                <span className="text-slate-200 font-mono">{data.order_metadata.order_number}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">交貨日期:</span>
                <span className="text-slate-200 font-mono">{data.order_metadata.delivery_date}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">提取項目:</span>
                <span className="text-slate-200 font-bold">
                  {data.items.length} / {data.order_metadata.total_items}
                  {(() => {
                    const mergedItems = data.items.filter(i => i.merged_count && i.merged_count > 1);
                    const totalMerged = mergedItems.reduce((sum, i) => sum + (i.merged_count || 1) - 1, 0);
                    return totalMerged > 0 ? ` (-${totalMerged})` : '';
                  })()}
                </span>
              </div>
              <button
                onClick={() => setViewMode(viewMode === 'table' ? 'card' : 'table')}
                className="px-3 py-1 rounded-full bg-slate-800 text-slate-200 hover:bg-slate-700 active:scale-95 transition-all text-sm"
              >
                {viewMode === 'table' ? '切換為表格' : '切換為卡片'}
              </button>
            </div>
          </div>
          
          <div className={`px-3 py-1 rounded-full text-xs font-bold border ${
            validation.overallStatus === 'pass' ? 'bg-green-500/10 border-green-500/30 text-green-400' :
            validation.overallStatus === 'warn' ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400' :
            'bg-red-500/10 border-red-500/30 text-red-400'
          }`}>
            {validation.overallStatus === 'pass' ? '檢查通過' : validation.overallStatus === 'warn' ? '有潛在問題' : '發現錯誤'}
          </div>
        </div>
        
        {/* 篩選工具列 */}
        {(needsReviewCount > 0 || pendingCount > 0) && (
          <div className="flex items-center gap-2 pt-2">
            <Eye className="w-4 h-4 text-slate-500" />
            <span className="text-xs text-slate-500">快速篩選：</span>
            <div className="flex gap-1.5">
              {([
                { key: 'all' as FilterMode, label: '全部', count: editedItems.length },
                ...(pendingCount > 0 ? [{ key: 'pending_translation' as FilterMode, label: '待選翻譯', count: pendingCount }] : []),
                { key: 'needs_review' as FilterMode, label: '需確認', count: needsReviewCount },
                { key: 'errors_only' as FilterMode, label: '僅錯誤', count: validation.summary.errorCount },
              ]).map((opt, index) => (
                <React.Fragment key={opt.key}>
                  <button
                    onClick={() => setFilter(opt.key)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all active:scale-95 ${
                      filter === opt.key
                        ? 'bg-[#00f2fe]/20 border border-[#00f2fe]/50 text-[#00f2fe]'
                        : 'bg-slate-800/50 border border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {opt.label} ({opt.count})
                  </button>
                  {opt.key === 'errors_only' && (
                    <TeachingButton module="pdf-preview" variant="inline" className="ml-1" />
                  )}
                  {/* 在按鈕之間添加間隔，除了最後一個按鈕 */}
                  {index < 3 && <span className="w-0.5" />}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 項目列表 - 中間可滾動區域 */}
      <div className="flex-1 min-h-0 overflow-y-auto tech-card p-4 lg:p-6 rounded-none border-t-0 border-b-0">
        {viewMode === 'table' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-[#162a56]">
                <tr className="text-slate-500 border-b border-slate-800">
                  <th className="py-3 px-2 font-medium">序號</th>
                  <th className="py-3 px-2 font-medium">儲位</th>
                  <th className="py-3 px-2 font-medium">類別</th>
                  <th className="py-3 px-2 font-medium">商品代碼（product_code）</th>
                  <th className="py-3 px-2 font-medium">國際條碼（barcode）</th>
                  <th className="py-3 px-2 font-medium">品名</th>
                  <th className="py-3 px-2 font-medium text-right">補貨量</th>
                  <th className="py-3 px-2 font-medium text-right" style={{color: '#ff9f0a'}}>倉庫存量</th>
                  <th className="py-3 px-2 font-medium text-center">同碼合併</th>
                  <th className="py-3 px-2 font-medium text-center">狀態</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {filteredItems.map((item) => {
                  const idx = editedItems.findIndex(e => e.line_number === item.line_number);
                  const val = validation.itemValidations.find(v => v.line_number === item.line_number);
                  const status = val?.status || 'pass';
                  const drugRisk = hasDrugNameRisk(item);
                  
                  return (
                    <tr key={item.line_number} className={`group transition-colors ${status === 'error' ? 'bg-red-500/5' : drugRisk ? 'bg-orange-500/5' : status === 'warn' ? 'bg-yellow-500/5' : ''}`}>
                      <td className="py-3 px-2 text-slate-400 font-mono">{item.line_number}</td>
                      <td className="py-3 px-2">
                        <input 
                          value={item.storage_location || ''} 
                          onChange={(e) => handleInputChange(idx, 'storage_location', e.target.value)}
                          className="bg-transparent text-slate-200 border border-transparent hover:border-slate-700 focus:border-[#00f2fe] focus:bg-slate-950 outline-none px-1 rounded transition-all font-mono w-12"
                        />
                      </td>
                      <td className="py-3 px-2">
                        <input 
                          value={item.category || ''} 
                          onChange={(e) => handleInputChange(idx, 'category', e.target.value)}
                          className="bg-transparent text-slate-200 border border-transparent hover:border-slate-700 focus:border-[#00f2fe] focus:bg-slate-950 outline-none px-1 rounded transition-all font-mono w-10"
                        />
                      </td>
                      <td className="py-3 px-2">
                        <input 
                          value={item.product_code || ''} 
                          onChange={(e) => handleInputChange(idx, 'product_code', e.target.value)}
                          className="bg-transparent text-slate-200 border border-transparent hover:border-slate-700 focus:border-[#00f2fe] focus:bg-slate-950 outline-none px-1 rounded transition-all font-mono w-full"
                        />
                      </td>
                      <td className="py-3 px-2">
                        {item.barcode && item.barcode !== item.product_code ? (
                          <span className="text-sm text-[#00f2fe]/70">{item.barcode}</span>
                        ) : null}
                      </td>
                      <td className="py-3 px-2">
                        <div className="relative">
                          <input 
                            value={item.drug_name} 
                            onChange={(e) => handleInputChange(idx, 'drug_name', e.target.value)}
                            className={`bg-transparent text-slate-200 border outline-none px-1 rounded transition-all w-full ${drugRisk ? 'border-orange-500/50 bg-orange-500/10 focus:border-[#00f2fe] focus:bg-slate-950' : 'border-transparent hover:border-slate-700 focus:border-[#00f2fe] focus:bg-slate-950'}`}
                          />
                          {drugRisk && (
                            <span className="absolute -top-1.5 -right-1 px-1 py-0.5 text-[8px] font-bold bg-orange-500/80 text-white rounded leading-none ring-1 ring-orange-400/50">OCR</span>
                          )}
                          {item.nhi_status === 'pending' && (
                            <button
                              type="button"
                              onClick={() => { setPickerLine(item.line_number); setManualName(''); }}
                              className="mt-1 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold bg-[#ff4b5c]/15 border border-[#ff4b5c]/60 text-[#ff4b5c] animate-pulse active:scale-95 transition-all"
                            >
                              <Languages className="w-3 h-3" />
                              {item.nhi_candidates?.length ?? 0} 條翻譯，點擊選擇
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <input 
                          type="number"
                          value={item.quantity} 
                          onChange={(e) => handleInputChange(idx, 'quantity', e.target.value)}
                          className="bg-transparent text-slate-200 border border-transparent hover:border-slate-700 focus:border-[#00f2fe] focus:bg-slate-950 outline-none px-1 rounded transition-all text-right w-16"
                        />
                      </td>
                      <td className="py-3 px-2 text-right">
                        {item.warehouse_quantity != null ? (
                          <span className="text-[#ff9f0a] font-bold">{item.warehouse_quantity}</span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-right">
                        {(item.merged_count && item.merged_count > 1) ? (
                          <span 
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-500/10 text-[#00f2fe] border border-cyan-500/30 cursor-help relative"
                            title={`合併了 ${item.merged_count} 筆相同條碼項目，數量已累加`}
                          >
                            {item.merged_count} 合1
                          </span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-center">
                        <div className="flex items-center justify-center gap-1 relative cursor-pointer" onClick={() => setOpenStatusLine(openStatusLine === item.line_number ? null : item.line_number)}>
                          {getStatusIcon(status)}
                          {val?.messages.length && openStatusLine === item.line_number ? (
                            <div className="absolute z-10 bg-slate-900 border border-slate-700 p-2 rounded shadow-xl text-[10px] w-48 left-1/2 -translate-x-1/2 mt-1 top-full">
                              {val.messages.map((m, i) => (
                                <div key={i} className="flex items-start gap-1">
                                  <span className="text-orange-400 mt-0.5">·</span>
                                  <span>{m}</span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {viewMode === 'card' && (
          <div className="space-y-[5px]">
            {filteredItems.map((item) => {
              const idx = editedItems.findIndex(e => e.line_number === item.line_number);
              const val = validation.itemValidations.find(v => v.line_number === item.line_number);
              const status = val?.status || 'pass';
              const drugRisk = hasDrugNameRisk(item);
              return (
                <div key={item.line_number} className={`flex items-start px-[10px] py-[10px] mx-[5px] bg-[#162a56] rounded-xl border-2 border-[#00f2fe] shadow-sm overflow-hidden ${status === 'error' ? 'bg-red-500/5' : drugRisk ? 'bg-orange-500/5' : status === 'warn' ? 'bg-yellow-500/5' : ''}`}>
                  <div className="flex w-full min-w-0">
                    <div className="flex flex-col w-1/3 shrink-0">
                      <div className="text-sm text-[#00f2fe] text-left">{item.line_number}</div>
                      <div className="text-xs text-slate-400 mt-1">國際條碼：{item.barcode || ''}</div>
                  {item.product_code && item.product_code !== item.barcode && (
                    <div className="text-xs text-[#00f2fe]/70 mt-1">商品代碼：{item.product_code}</div>
                  )}
                      {(item.merged_count && item.merged_count > 1) && (
                        <div className="mt-1">
                          <span 
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-500/10 text-[#00f2fe] border border-cyan-500/30 cursor-help relative"
                            title={`合併了 ${item.merged_count} 筆相同條碼項目，數量已累加`}
                          >
                            {item.merged_count} 合1
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex w-2/3 min-w-0 items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 text-right ml-[5px]">
                        <input
                          value={item.drug_name}
                          onChange={(e) => handleInputChange(idx, 'drug_name', e.target.value)}
                          className={`w-full bg-transparent text-slate-200 border-none focus:outline-none focus:ring-0 appearance-none truncate ${drugRisk ? 'border-orange-500/50' : ''}`}
                        />
                        {item.nhi_status === 'pending' && (
                          <button
                            type="button"
                            onClick={() => { setPickerLine(item.line_number); setManualName(''); }}
                            className="mt-1 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold bg-[#ff4b5c]/15 border border-[#ff4b5c]/60 text-[#ff4b5c] animate-pulse active:scale-95 transition-all"
                          >
                            <Languages className="w-3 h-3" />
                            {item.nhi_candidates?.length ?? 0} 條翻譯，點擊選擇
                          </button>
                        )}
                        <div className="flex items-center gap-1 mt-2 flex-nowrap">
                          <span className="text-slate-400 text-xs whitespace-nowrap">補貨量</span>
                          <input type="number" value={item.quantity} onChange={(e) => handleInputChange(idx, 'quantity', e.target.value)} className="w-14 bg-transparent text-slate-200 border-none focus:outline-none focus:ring-0 appearance-none" />
                          <span className="text-slate-400 text-xs whitespace-nowrap">倉庫</span>
                          <input type="number" value={item.warehouse_quantity != null ? item.warehouse_quantity : ''} onChange={(e) => handleInputChange(idx, 'warehouse_quantity', e.target.value)} className="w-10 bg-transparent text-[#ff9f0a] border-none focus:outline-none focus:ring-0 appearance-none" />
                          <span className="text-slate-400 text-xs whitespace-nowrap">儲位</span>
                          <input value={item.storage_location || ''} onChange={(e) => handleInputChange(idx, 'storage_location', e.target.value)} className="w-10 bg-transparent text-slate-200 border-none focus:outline-none focus:ring-0 appearance-none" />
                          <span className="text-slate-400 text-xs whitespace-nowrap">類別</span>
                          <input value={item.category || ''} onChange={(e) => handleInputChange(idx, 'category', e.target.value)} className="w-8 bg-transparent text-slate-200 border-none focus:outline-none focus:ring-0 appearance-none" />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center shrink-0 relative cursor-pointer" onClick={() => setOpenStatusLine(openStatusLine === item.line_number ? null : item.line_number)}>
                      {getStatusIcon(status)}
                      {val?.messages.length && openStatusLine === item.line_number ? (
                        <div className="absolute z-10 bg-slate-900 border border-slate-700 p-2 rounded shadow-xl text-[10px] w-48 left-1/2 -translate-x-1/2 mt-1 top-full">
                          {val.messages.map((m, i) => (
                            <div key={i} className="flex items-start gap-1">
                              <span className="text-orange-400 mt-0.5">·</span>
                              <span>{m}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredItems.length === 0 && (
              <div className="text-center py-10 text-slate-500">
                <Filter className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">目前篩選條件下沒有項目</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 底部操作 - 固定在底部 */}
      <div className="flex-shrink-0 tech-card p-4 lg:p-6 rounded-t-none border-t border-slate-800">
        {needsReviewCount > 0 && (
          <p className="text-[11px] text-orange-400 mb-3 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            有 {needsReviewCount} 項品名經 AI 辨識可能不精準（橘色標記），建議人工確認後再匯入
          </p>
        )}
        {pendingCount > 0 && (
          <p className="text-[11px] text-[#ff4b5c] mb-3 flex items-center gap-1.5">
            <Languages className="w-3.5 h-3.5" />
            尚有 {pendingCount} 項藥品有多條翻譯待選擇，全部選完才能確認匯入
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-3">
          <button 
            onClick={onRetry}
            className="flex-1 py-3 px-4 rounded-xl border border-slate-700 text-slate-400 hover:bg-slate-800 active:scale-95 transition-all flex items-center justify-center gap-2 text-sm font-bold"
          >
            <RefreshCcw className="w-4 h-4" />
            退回重試
          </button>
          <button 
            onClick={() => onConfirm(editedItems)}
            disabled={isLoading || pendingCount > 0}
            className="flex-1 py-3 px-4 rounded-xl bg-[#00f2fe] text-slate-900 hover:shadow-[0_0_15px_rgba(0,242,254,0.5)] active:scale-95 transition-all flex items-center justify-center gap-2 text-sm font-bold disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {pendingCount > 0 ? `尚有 ${pendingCount} 項待選翻譯` : '確認匯入'}
          </button>
        </div>
      </div>

      {/* 多筆翻譯說明彈窗 */}
      {showIntro && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#07142b]/90 backdrop-blur-md animate-in fade-in duration-300">
          <div className="tech-card w-full max-w-sm p-6 space-y-4 text-center border-[#ff4b5c]/50 shadow-[0_0_40px_rgba(255,75,92,0.2)] animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
            <div className="mx-auto w-14 h-14 rounded-full bg-[#ff4b5c]/15 border border-[#ff4b5c]/60 flex items-center justify-center animate-pulse">
              <Languages className="w-7 h-7 text-[#ff4b5c]" />
            </div>
            <h3 className="text-lg font-bold text-white">有 {pendingCount} 項藥品存在多條翻譯</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              這些藥品的品名在撿貨單上被截斷，健保對照表中有多筆相符結果。
              請點擊標示紅色的項目，選擇正確的翻譯。全部選完後才能進行下一步。
            </p>
            <button
              type="button"
              onClick={dismissIntro}
              className="w-full py-3 rounded-xl bg-[#00f2fe] text-slate-900 font-bold text-sm hover:shadow-[0_0_15px_rgba(0,242,254,0.5)] active:scale-95 transition-all"
            >
              開始選擇
            </button>
          </div>
        </div>
      )}

      {/* 候選翻譯選擇視窗 */}
      {pickerItem && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-[#07142b]/90 backdrop-blur-md animate-in fade-in duration-200">
          <div className="tech-card w-full max-w-lg max-h-[85dvh] flex flex-col border-[#00f2fe]/40 animate-in slide-in-from-bottom-4 zoom-in-95 duration-200">
            <div className="flex items-start justify-between gap-3 p-4 border-b border-slate-800">
              <div className="min-w-0">
                <p className="text-xs text-slate-500">第 {pickerItem.line_number} 項　商品代號 {pickerItem.product_code || pickerItem.barcode || '無'}</p>
                <p className="text-sm text-slate-200 mt-1 break-words">
                  <span className="text-slate-500">撿貨單品名：</span>{pickerItem.nhi_original_name || pickerItem.drug_name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setPickerLine(null); setManualName(''); }}
                className="shrink-0 p-1.5 rounded-full hover:bg-slate-800 active:scale-95 transition-all"
                aria-label="關閉"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2">
              {(pickerItem.nhi_candidates ?? []).map(c => (
                <button
                  key={c.drug_code}
                  type="button"
                  onClick={() => applyTranslation(pickerItem.line_number, c.chinese_name, 'chosen')}
                  className="w-full text-left p-3 rounded-xl bg-[#162a56] border border-slate-700 hover:border-[#00f2fe] hover:shadow-[0_0_15px_rgba(0,242,254,0.35)] active:scale-95 transition-all"
                >
                  <p className="text-sm font-bold text-white break-words">{c.chinese_name}</p>
                  <p className="text-xs text-slate-400 mt-1 break-words">{c.english_name}</p>
                  <p className="text-[10px] text-slate-500 mt-1 font-mono">
                    {c.drug_code}　匹配度 {Math.round(c.score * 100)}%
                  </p>
                </button>
              ))}
            </div>

            <div className="p-4 border-t border-slate-800 space-y-2">
              <p className="text-xs text-slate-500">以上皆非：保留原始品名或手動輸入</p>
              <input
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder={pickerItem.nhi_original_name || pickerItem.drug_name}
                className="tech-input w-full text-sm"
              />
              <button
                type="button"
                onClick={() => applyTranslation(pickerItem.line_number, manualName.trim() || pickerItem.nhi_original_name || pickerItem.drug_name, 'kept')}
                className="w-full py-2.5 rounded-xl border border-slate-600 text-slate-200 hover:bg-slate-800 active:scale-95 transition-all text-sm font-bold"
              >
                {manualName.trim() ? '使用手動輸入的品名' : '保留原始品名'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 補上缺失的 Loader2
function Loader2({ className }: { className?: string }) {
  return <div className={`w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin ${className}`} />;
}








