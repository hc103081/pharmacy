'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import type { DrugItem } from '@/types';

interface EditDrugModalProps {
  isOpen: boolean;
  drug: DrugItem | null;
  onClose: () => void;
  onSave: (updates: {
    name?: string;
    barcode?: string;
    product_code?: string | null;
    expected_quantity?: number;
    warehouse_quantity?: number | null;
    storage_location?: string;
    category?: string;
  }) => Promise<void>;
  isLoading?: boolean;
}

export default function EditDrugModal({
  isOpen,
  drug,
  onClose,
  onSave,
  isLoading = false,
}: EditDrugModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // 表單狀態
  const [formData, setFormData] = React.useState({
    name: '',
    barcode: '',
    product_code: '',
    expected_quantity: '',
    warehouse_quantity: '',
    storage_location: '',
    category: '',
  });

  const [errors, setErrors] = React.useState<Record<string, string>>({});

  // 開啟時填入資料、記錄 focus、鎖定 body scroll
  useEffect(() => {
    if (isOpen && drug) {
      previousActiveElement.current = document.activeElement as HTMLElement;
      setFormData({
        name: drug.name,
        barcode: drug.barcode,
        product_code: drug.product_code || '',
        expected_quantity: String(drug.expected_quantity),
        warehouse_quantity: drug.warehouse_quantity !== null ? String(drug.warehouse_quantity) : '',
        storage_location: drug.storage_location || '',
        category: drug.category || '',
      });
      setErrors({});
      document.body.style.overflow = 'hidden';
      // 延遲 focus 避免動畫衝突
      setTimeout(() => modalRef.current?.querySelector('input')?.focus(), 100);
    } else {
      document.body.style.overflow = '';
      previousActiveElement.current?.focus();
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, drug]);

  // ESC 關閉
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  // 輸入處理
  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  // 數字輸入處理 (只允許數字)
  const handleNumberChange = (field: string, value: string) => {
    const numericValue = value.replace(/[^0-9]/g, '');
    handleChange(field, numericValue);
  };

  // 驗證
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = '藥品名稱不可為空';
    if (!formData.barcode.trim()) newErrors.barcode = '條碼不可為空';
    if (formData.expected_quantity !== '' && (isNaN(Number(formData.expected_quantity)) || Number(formData.expected_quantity) < 0)) {
      newErrors.expected_quantity = '預期數量必須為非負整數';
    }
    if (formData.warehouse_quantity !== '' && (isNaN(Number(formData.warehouse_quantity)) || Number(formData.warehouse_quantity) < 0)) {
      newErrors.warehouse_quantity = '倉庫數量必須為非負整數';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // 提交
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || !drug) return;

    const updates = {
      name: formData.name.trim(),
      barcode: formData.barcode.trim(),
      product_code: formData.product_code.trim() || null,
      expected_quantity: formData.expected_quantity ? Number(formData.expected_quantity) : undefined,
      warehouse_quantity: formData.warehouse_quantity ? Number(formData.warehouse_quantity) : null,
      storage_location: formData.storage_location.trim() || undefined,
      category: formData.category.trim() || undefined,
    };

    await onSave(updates);
  };

  if (!isOpen || !drug) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-drug-title"
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-md mx-4 bg-[#162a56] border border-[#00f2fe]/30 rounded-2xl shadow-[0_0_30px_rgba(0,242,254,0.15)] overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#00f2fe]/20">
          <h2 id="edit-drug-title" className="text-lg font-bold text-white flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-[#00f2fe]/10 border border-[#00f2fe]/30 flex items-center justify-center">
              <svg className="w-5 h-5 text-[#00f2fe]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </span>
            編輯藥品資料
          </h2>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-all disabled:opacity-50 active:scale-95"
            aria-label="關閉"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form id="edit-drug-form" onSubmit={handleSubmit} className="p-4 space-y-4 min-w-0 max-w-[520px] mx-auto">
          {/* 藥品名稱 */}
          <div>
            <label htmlFor="edit-name" className="block text-xs font-bold text-slate-400 mb-1.5">藥品名稱 *</label>
            <input
              id="edit-name"
              type="text"
              value={formData.name}
              onChange={e => handleChange('name', e.target.value)}
              className={`w-full px-3 py-2.5 bg-slate-900 border rounded-xl text-white placeholder-slate-600 transition-all
                focus:outline-none focus:border-[#00f2fe] focus:ring-2 focus:ring-[#00f2fe]/20
                ${errors.name ? 'border-[#ff4b5c] focus:border-[#ff4b5c] focus:ring-[#ff4b5c]/20' : 'border-slate-700'}
              `}
              placeholder="輸入藥品名稱"
              disabled={isLoading}
              autoComplete="off"
            />
            {errors.name && <p className="mt-1 text-xs text-[#ff4b5c]">{errors.name}</p>}
          </div>

          {/* 條碼與商品代碼 */}
          <div className="flex gap-6 max-w-[480px] mx-auto items-start">
            <div className="w-2/5 pr-3 border-r border-slate-700/50 min-w-0">
              <label htmlFor="edit-barcode" className="block text-xs font-bold text-slate-400 mb-1.5">條碼 *</label>
              <input
                id="edit-barcode"
                type="text"
                value={formData.barcode}
                onChange={e => handleChange('barcode', e.target.value)}
                className={`w-full px-3 py-2.5 bg-slate-900 border rounded-xl text-white placeholder-slate-600 transition-all
                  focus:outline-none focus:border-[#00f2fe] focus:ring-2 focus:ring-[#00f2fe]/20
                  ${errors.barcode ? 'border-[#ff4b5c] focus:border-[#ff4b5c] focus:ring-[#ff4b5c]/20' : 'border-slate-700'}
                `}
                placeholder="輸入條碼"
                disabled={isLoading}
                autoComplete="off"
              />
              {errors.barcode && <p className="mt-1 text-xs text-[#ff4b5c]">{errors.barcode}</p>}
            </div>
            {/* 分隔空間 */}
            <div className="w-8" aria-hidden="true" />
            <div className="w-3/5 pl-3 min-w-0">
              <label htmlFor="edit-product_code" className="block text-xs font-bold text-slate-400 mb-1.5">商品代碼</label>
              <input
                id="edit-product_code"
                type="text"
                value={formData.product_code}
                onChange={e => handleChange('product_code', e.target.value)}
                className={`w-full px-3 py-2.5 bg-slate-900 border rounded-xl text-white placeholder-slate-600 transition-all
                  focus:outline-none focus:border-[#00f2fe] focus:ring-2 focus:ring-[#00f2fe]/20 border-slate-700
                `}
                placeholder="輸入商品代碼"
                disabled={isLoading}
                autoComplete="off"
              />
            </div>
          </div>

          {/* 數量欄位 */}
          <div className="flex gap-6 max-w-[480px] mx-auto items-start">
            <div className="w-2/5 pr-3 border-r border-slate-700/50 min-w-0">
              <label htmlFor="edit-expected_quantity" className="block text-xs font-bold text-slate-400 mb-1.5">預期數量 *</label>
              <input
                id="edit-expected_quantity"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={formData.expected_quantity}
                onChange={e => handleNumberChange('expected_quantity', e.target.value)}
                className={`w-full px-3 py-2.5 bg-slate-900 border rounded-xl text-white placeholder-slate-600 transition-all
                  focus:outline-none focus:border-[#00f2fe] focus:ring-2 focus:ring-[#00f2fe]/20
                  ${errors.expected_quantity ? 'border-[#ff4b5c] focus:border-[#ff4b5c] focus:ring-[#ff4b5c]/20' : 'border-slate-700'}
                `}
                placeholder="0"
                disabled={isLoading}
              />
              {errors.expected_quantity && <p className="mt-1 text-xs text-[#ff4b5c]">{errors.expected_quantity}</p>}
            </div>
            {/* 分隔空間 */}
            <div className="w-8" aria-hidden="true" />
            <div className="w-3/5 pl-3 min-w-0">
              <label htmlFor="edit-warehouse_quantity" className="block text-xs font-bold text-slate-400 mb-1.5">倉庫數量</label>
              <input
                id="edit-warehouse_quantity"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={formData.warehouse_quantity}
                onChange={e => handleNumberChange('warehouse_quantity', e.target.value)}
                className={`w-full px-3 py-2.5 bg-slate-900 border rounded-xl text-white placeholder-slate-600 transition-all
                  focus:outline-none focus:border-[#00f2fe] focus:ring-2 focus:ring-[#00f2fe]/20 border-slate-700
                `}
                placeholder="選填"
                disabled={isLoading}
              />
              {errors.warehouse_quantity && <p className="mt-1 text-xs text-[#ff4b5c]">{errors.warehouse_quantity}</p>}
            </div>
          </div>

          {/* 儲位與類別 */}
          <div className="flex gap-6 max-w-[480px] mx-auto items-start">
            <div className="w-2/5 pr-3 border-r border-slate-700/50 min-w-0">
              <label htmlFor="edit-storage_location" className="block text-xs font-bold text-slate-400 mb-1.5">儲位</label>
              <input
                id="edit-storage_location"
                type="text"
                value={formData.storage_location}
                onChange={e => handleChange('storage_location', e.target.value)}
                className={`w-full px-3 py-2.5 bg-slate-900 border rounded-xl text-white placeholder-slate-600 transition-all
                  focus:outline-none focus:border-[#00f2fe] focus:ring-2 focus:ring-[#00f2fe]/20 border-slate-700
                `}
                placeholder="如 F3"
                disabled={isLoading}
                autoComplete="off"
                maxLength={10}
              />
            </div>
            {/* 分隔空間 */}
            <div className="w-8" aria-hidden="true" />
            <div className="w-3/5 pl-3 min-w-0">
              <label htmlFor="edit-category" className="block text-xs font-bold text-slate-400 mb-1.5">類別</label>
              <input
                id="edit-category"
                type="text"
                value={formData.category}
                onChange={e => handleChange('category', e.target.value)}
                className={`w-full px-3 py-2.5 bg-slate-900 border rounded-xl text-white placeholder-slate-600 transition-all
                  focus:outline-none focus:border-[#00f2fe] focus:ring-2 focus:ring-[#00f2fe]/20 border-slate-700
                `}
                placeholder="如 4"
                disabled={isLoading}
                autoComplete="off"
                maxLength={10}
              />
            </div>
          </div>

          {/* 項次資訊 (唯讀顯示) */}
          <div className="pt-2 border-t border-slate-800/50">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>頁碼: {drug.page_number}</span>
              <span>項次: {(drug.item_order - 1) % 44 + 1}</span>
            </div>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="flex border-t border-[#00f2fe]/20 p-3 gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all active:scale-95 bg-slate-800 text-slate-300 border border-slate-600 hover:bg-slate-700 hover:border-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="w-4 h-4" />
            取消
          </button>
          <button
            type="submit"
            form="edit-drug-form"
            disabled={isLoading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all active:scale-95 bg-[#00f2fe] text-slate-900 shadow-[0_0_10px_rgba(0,242,254,0.4)] hover:bg-[#00f2fe]/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                儲存中...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                儲存變更
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}