'use client';

import React, { useState, useRef, useCallback } from 'react';
import { UploadCloud, FileType, ImageIcon, X, FileText } from 'lucide-react';

export type UploadMode = 'pdf' | 'images' | 'both';

export interface UploadedPdfFile {
  file: File;
}

export interface UploadedImageFile {
  file: File;
  previewUrl: string;
}

interface DrugListUploaderProps {
  onPdfSelect: (file: File) => void;
  onImagesSelect: (files: File[]) => void;
  onImagesRemove: (index: number) => void;
  selectedImages: File[];
  isParsingPdf: boolean;
  mode?: UploadMode;
}

const DrugListUploader: React.FC<DrugListUploaderProps> = ({
  onPdfSelect,
  onImagesSelect,
  onImagesRemove,
  selectedImages,
  isParsingPdf,
  mode = 'both'
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragFiles, setDragFiles] = useState<{ pdfs: File[]; images: File[] }>({ pdfs: [], images: [] });
  const dragCounterRef = useRef(0);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const classifyFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const pdfs: File[] = [];
    const images: File[] = [];
    fileArray.forEach(f => {
      if (f.type === 'application/pdf') {
        pdfs.push(f);
      } else if (f.type.startsWith('image/')) {
        images.push(f);
      }
    });
    return { pdfs, images };
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isParsingPdf) {
      dragCounterRef.current += 1;
      if (dragCounterRef.current === 1) {
        setIsDragOver(true);
      }
      if (e.dataTransfer.files) {
        setDragFiles(classifyFiles(e.dataTransfer.files));
      }
    }
  }, [isParsingPdf, classifyFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragOver(false);
      setDragFiles({ pdfs: [], images: [] });
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragOver(false);
    setDragFiles({ pdfs: [], images: [] });
    if (e.dataTransfer.files && !isParsingPdf) {
      const { pdfs, images } = classifyFiles(e.dataTransfer.files);
      if (pdfs.length > 0) {
        onPdfSelect(pdfs[0]);
      }
      if (images.length > 0) {
        onImagesSelect(images);
      }
    }
  }, [isParsingPdf, classifyFiles, onPdfSelect, onImagesSelect]);

  const handlePdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      onPdfSelect(e.target.files[0]);
      e.target.value = '';
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onImagesSelect(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-3">
      <label className="block text-xs lg:text-sm font-medium text-slate-400">
        上傳藥品清單 (PDF) 與照片
      </label>

      {/* 主拖拉區塊 */}
      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative border-2 border-dashed rounded-2xl p-6 lg:p-8 text-center
          transition-all duration-300 cursor-pointer
          ${isDragOver
            ? 'border-[#00f2fe] bg-[#00f2fe]/5 shadow-[0_0_30px_rgba(0,242,254,0.25)]'
            : 'border-slate-700 bg-slate-900/30 hover:border-cyan-500/40 hover:bg-slate-900/50'
          }
          ${isParsingPdf ? 'opacity-50 pointer-events-none' : ''}
        `}
        onClick={() => {
          if (!isParsingPdf) imageInputRef.current?.click();
        }}
      >
        {/* 一般狀態內容 - 始終渲染以維持固定高度 */}
        <div className={`${isDragOver ? 'invisible' : ''}`}>
          <UploadCloud className="w-12 h-12 text-slate-500 mx-auto mb-4 group-hover:text-cyan-400 transition-colors" />
          <p className="text-slate-300 font-semibold text-base mb-2">
            拖拉 PDF 出貨單或掃描照片至此處
          </p>
          <p className="text-slate-500 text-sm mb-5">
            支援 PDF (.pdf) 與掃描照片 (.jpg, .png)
          </p>

          {/* 分隔線 */}
          <div className="flex items-center gap-3 mb-5 max-w-xs mx-auto">
            <div className="flex-1 h-px bg-slate-700" />
            <span className="text-slate-500 text-xs">或點擊選擇</span>
            <div className="flex-1 h-px bg-slate-700" />
          </div>

          {/* 按鈕區 */}
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                pdfInputRef.current?.click();
              }}
              disabled={isParsingPdf}
              className={`
                flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium
                transition-all duration-200 active:scale-95
                bg-slate-800 hover:bg-slate-700 text-slate-300
                border border-slate-600 hover:border-cyan-500/50
                ${isParsingPdf ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              <FileText className="w-4 h-4 text-red-400" />
              選擇 PDF
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                imageInputRef.current?.click();
              }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium
                transition-all duration-200 active:scale-95
                bg-slate-800 hover:bg-slate-700 text-slate-300
                border border-slate-600 hover:border-cyan-500/50"
            >
              <ImageIcon className="w-4 h-4 text-green-400" />
              選擇照片
            </button>
          </div>

          <p className="text-[11px] text-slate-600 mt-4">
            可同時上傳 PDF 出貨單（自動解析條碼與數量）與掃描照片（AI OCR 輔助辨識）
          </p>
        </div>

        {/* 拖曳中提示覆蓋層 */}
        {isDragOver && (
          <div className="absolute inset-0 rounded-2xl bg-[#00f2fe]/5 flex flex-col items-center justify-center z-10 pointer-events-none">
            <div className="animate-bounce">
              <UploadCloud className="w-14 h-14 text-[#00f2fe] mx-auto mb-3" />
            </div>
            <p className="text-[#00f2fe] text-lg font-bold">放開以上傳檔案</p>
            {dragFiles.pdfs.length > 0 && (
              <p className="text-cyan-300 text-sm mt-1">
                PDF: {dragFiles.pdfs[0].name}
              </p>
            )}
            {dragFiles.images.length > 0 && (
              <p className="text-cyan-300 text-sm mt-1">
                圖片: {dragFiles.images.length} 張
              </p>
            )}
          </div>
        )}

        {/* 隱藏的 Input */}
        <input
          ref={pdfInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={handlePdfChange}
          disabled={isParsingPdf}
        />
        <input
          ref={imageInputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={handleImageChange}
        />
      </div>

      {/* 已選取圖片的預覽區 */}
      {selectedImages.length > 0 && (
        <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-cyan-400" />
            <p className="text-xs text-slate-400">
              已選取 <span className="text-cyan-400 font-bold">{selectedImages.length}</span> 張照片
            </p>
          </div>
          <div className="grid grid-cols-4 lg:grid-cols-6 gap-2">
            {selectedImages.map((file, i) => (
              <div
                key={`img-${i}`}
                className="relative aspect-square rounded-lg overflow-hidden border border-slate-700 group hover:border-cyan-500/50 transition-colors"
              >
                <img
                  src={URL.createObjectURL(file)}
                  alt={`截圖 ${i + 1}`}
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onImagesRemove(i);
                  }}
                  className="absolute top-1 right-1 p-1 bg-red-500/90 hover:bg-red-600 text-white rounded-full
                    opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
                <div className="absolute bottom-0 left-0 right-0 p-0.5 bg-slate-900/80 text-[9px] text-slate-400 text-center truncate">
                  {file.name}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PDF 已選取的提示 */}
      {isParsingPdf && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 animate-in fade-in">
          <FileType className="w-4 h-4 text-cyan-400" />
          <span className="text-sm text-cyan-300">正在解析 PDF 中...</span>
        </div>
      )}
    </div>
  );
};

export default DrugListUploader;