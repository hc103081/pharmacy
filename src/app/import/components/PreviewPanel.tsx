'use client';

import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle, XCircle, Info, RefreshCcw, Sparkles, Check } from 'lucide-react';
import { ParsedPdf, ParsedItem } from '@/lib/pdfParser';
import { PdfValidationResult, ItemValidation } from '@/lib/pdfValidator';

interface PreviewPanelProps {
  data: ParsedPdf;
  validation: PdfValidationResult;
  onConfirm: (items: ParsedItem[]) => void;
  onRetry: () => void;
  onGeminiFix: () => void;
  isLoading: boolean;
}

export default function PreviewPanel({
  data,
  validation,
  onConfirm,
  onRetry,
  onGeminiFix,
  isLoading,
}: PreviewPanelProps) {
  const [editedItems, setEditedItems] = useState<ParsedItem[]>(data.items);

  useEffect(() => {
    setEditedItems(data.items);
  }, [data]);

  const handleInputChange = (index: number, field: keyof ParsedItem, value: string | number) => {
    const newItems = [...editedItems];
    const item = { ...newItems[index] };
    
    if (field === 'quantity' || field === 'bonus_quantity') {
      item[field] = Number(value) || 0;
    } else {
      item[field] = value as any;
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

  return (
    <div className="tech-card p-4 lg:p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4">
      {/* 表頭資訊 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
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
              <span className="text-slate-200 font-bold">{data.items.length} / {data.order_metadata.total_items}</span>
            </div>
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

      {/* 項目列表 */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-slate-500 border-b border-slate-800">
              <th className="py-3 px-2 font-medium">序號</th>
              <th className="py-3 px-2 font-medium">條碼</th>
              <th className="py-3 px-2 font-medium">品名</th>
              <th className="py-3 px-2 font-medium text-right">數量</th>
              <th className="py-3 px-2 font-medium text-right">贈量</th>
              <th className="py-3 px-2 font-medium text-right">合併</th>
              <th className="py-3 px-2 font-medium text-center">狀態</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {editedItems.map((item, idx) => {
              const val = validation.itemValidations.find(v => v.line_number === item.line_number);
              const status = val?.status || 'pass';
              
              return (
                <tr key={idx} className={`group transition-colors ${status === 'error' ? 'bg-red-500/5' : status === 'warn' ? 'bg-yellow-500/5' : ''}`}>
                  <td className="py-3 px-2 text-slate-500 font-mono">{item.line_number}</td>
                  <td className="py-3 px-2">
                    <input 
                      value={item.barcode} 
                      onChange={(e) => handleInputChange(idx, 'barcode', e.target.value)}
                      className="bg-transparent border border-transparent hover:border-slate-700 focus:border-[#00f2fe] focus:bg-slate-950 outline-none px-1 rounded transition-all font-mono w-full"
                    />
                  </td>
                  <td className="py-3 px-2">
                    <input 
                      value={item.drug_name} 
                      onChange={(e) => handleInputChange(idx, 'drug_name', e.target.value)}
                      className="bg-transparent border border-transparent hover:border-slate-700 focus:border-[#00f2fe] focus:bg-slate-950 outline-none px-1 rounded transition-all w-full"
                    />
                  </td>
                  <td className="py-3 px-2 text-right">
                    <input 
                      type="number"
                      value={item.quantity} 
                      onChange={(e) => handleInputChange(idx, 'quantity', e.target.value)}
                      className="bg-transparent border border-transparent hover:border-slate-700 focus:border-[#00f2fe] focus:bg-slate-950 outline-none px-1 rounded transition-all text-right w-16"
                    />
                  </td>
                  <td className="py-3 px-2 text-right">
                    <input 
                      type="number"
                      value={item.bonus_quantity} 
                      onChange={(e) => handleInputChange(idx, 'bonus_quantity', e.target.value)}
                      className="bg-transparent border border-transparent hover:border-slate-700 focus:border-[#00f2fe] focus:bg-slate-950 outline-none px-1 rounded transition-all text-right w-16"
                    />
                  </td>
                  <td className="py-3 px-2 text-right font-bold text-slate-300">
                    {item.quantity + item.bonus_quantity}
                  </td>
                  <td className="py-3 px-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {getStatusIcon(status)}
                      {val?.messages.length ? (
                        <div className="group-hover:block hidden absolute z-10 bg-slate-900 border border-slate-700 p-2 rounded shadow-xl text-[10px] w-48 left-1/2 -translate-x-1/2 mt-1">
                          {val.messages.map((m, i) => <div key={i}>{m}</div>)}
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

      {/* 底部操作 */}
      <div className="flex flex-col sm:flex-row gap-3 pt-6">
        <button 
          onClick={onRetry}
          className="flex-1 py-3 px-4 rounded-xl border border-slate-700 text-slate-400 hover:bg-slate-800 transition-all flex items-center justify-center gap-2 text-sm font-bold"
        >
          <RefreshCcw className="w-4 h-4" />
          退回重試
        </button>
        <button 
          onClick={onGeminiFix}
          className="flex-1 py-3 px-4 rounded-xl border border-[#00f2fe]/30 text-[#00f2fe] hover:bg-[#00f2fe]/10 transition-all flex items-center justify-center gap-2 text-sm font-bold"
        >
          <Sparkles className="w-4 h-4" />
          Gemini 修正
        </button>
        <button 
          onClick={() => onConfirm(editedItems)}
          disabled={isLoading}
          className="flex-1 py-3 px-4 rounded-xl bg-[#00f2fe] text-slate-900 hover:shadow-[0_0_15px_rgba(0,242,254,0.5)] transition-all flex items-center justify-center gap-2 text-sm font-bold disabled:opacity-50"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          確認匯入
        </button>
      </div>
    </div>
  );
}

// 補上缺失的 Loader2
function Loader2({ className }: { className?: string }) {
  return <div className={`w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin ${className}`} />;
}
