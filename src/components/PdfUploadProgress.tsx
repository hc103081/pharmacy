import { useState, useEffect } from 'react';
import { estimatePdfProcessingTime } from '@/lib/pdfEstimator';

type Stage = 'upload' | 'parse' | 'infer' | 'done';

interface Props {
  /**
   * 上傳的 PDF 檔案
   */
  file: File;
  /**
   * 處理完成後的回呼
   */
  onComplete: (result: any) => void;
}

/**
 * PdfUploadProgress
 *
 * 依檔案大小與頁數快速估算總處理時間，並以分段進度條呈現三個階段：
 * 1. 上傳檔案
 * 2. 解析 PDF（OCR / 文字抽取）
 * 3. AI 推論
 *
 * UI 特色符合 AGENTS.md 中的設計規範：
 * - 深藍背景、neon 藍呼吸燈
 * - 進度條使用 `#00f2fe`
 * - 超過 30 秒顯示錯誤提示與重新上傳按鈕
 */
export default function PdfUploadProgress({ file, onComplete }: Props) {
  const [stage, setStage] = useState<Stage>('upload');
  const [elapsed, setElapsed] = useState(0);
  const [estimate, setEstimate] = useState(0);
  const [timerId, setTimerId] = useState<NodeJS.Timeout | null>(null);

  // ----- 估算總時間 ----------------------------------------------------
const computeEstimate = (): number => {
  return estimatePdfProcessingTime(file.size);
};
  // ----- 計時器 --------------------------------------------------------
  useEffect(() => {
    const est = computeEstimate();
    setEstimate(est);
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    setTimerId(id);
    return () => clearInterval(id);
  }, []);

  // ----- 模擬階段切換 ----------------------------------------------------
  useEffect(() => {
    const steps: Record<Stage, number> = {
      upload: Math.round(estimate * 0.2),
      parse: Math.round(estimate * 0.5),
      infer: Math.round(estimate * 0.8),
      done: estimate,
    };
    const checker = setInterval(() => {
      if (stage === 'done') return clearInterval(checker);
      if (elapsed >= steps[stage]) {
        setStage((prev) => {
          if (prev === 'upload') return 'parse';
          if (prev === 'parse') return 'infer';
          if (prev === 'infer') return 'done';
          return prev;
        });
      }
    }, 500);
    return () => clearInterval(checker);
  }, [stage, elapsed, estimate]);

  // ----- 完成處理 ------------------------------------------------------
  useEffect(() => {
    if (stage === 'done' && timerId) {
      clearInterval(timerId);
      // 此處可呼叫后端 API，暫以模擬結果回傳
      onComplete({ success: true, fileName: file.name });
    }
  }, [stage]);

  // ----- 取得進度條寬度 -----------------------------------------------
  const getProgressWidth = () => {
    const percent =
      stage === 'upload'
        ? (elapsed / estimate) * 20
        : stage === 'parse'
        ? (elapsed / estimate) * 50
        : stage === 'infer'
        ? (elapsed / estimate) * 80
        : 100;
    return `${Math.min(percent, 100)}%`;
  };

  return (
    <div className="w-full max-w-md mx-auto p-4 bg-[#162a56] rounded-xl shadow-lg text-white">
      <p className="mb-2">
        正在 {stage === 'upload' ? '上傳檔案' : stage === 'parse' ? '解析 PDF' : stage === 'infer' ? 'AI 推論' : '完成'} …
        （預估 {estimate} 秒，已過 {elapsed}s）
      </p>

      {/* 進度條 */}
      <div className="relative h-2 bg-gray-600 rounded-full overflow-hidden">
        <div
          className="absolute h-2 bg-[#00f2fe] transition-all duration-500"
          style={{ width: getProgressWidth() }}
        />
        {/* 呼吸燈：僅在 AI 推論階段顯示 */}
        {stage === 'infer' && (
          <div className="absolute inset-0 animate-pulse opacity-30 bg-[#00f2fe]" />
        )}
      </div>

      {/* 超時提示 */}
      {elapsed > 30 && stage !== 'done' && (
        <div className="mt-3 p-2 bg-red-600 rounded text-center">
          處理時間過長，請重新上傳或稍後再試。
          <button
            className="ml-2 px-3 py-1 bg-[#00f2fe] rounded-full active:scale-95"
            onClick={() => {
              // 重置狀態，讓使用者重新上傳
              setStage('upload');
              setElapsed(0);
            }}
          >
            重新上傳
          </button>
        </div>
      )}
    </div>
  );
}
