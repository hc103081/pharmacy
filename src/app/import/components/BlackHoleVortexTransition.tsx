'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { PageCardState } from '../page';

interface BlackHoleVortexTransitionProps {
  isActive: boolean;
  pageCards: PageCardState[];
  totalItemsCount: number;
  totalPagesCount: number;
  onStartFadeInUi: () => void;
  onComplete: () => void;
}

export function BlackHoleVortexTransition({
  isActive,
  pageCards,
  totalItemsCount,
  totalPagesCount,
  onStartFadeInUi,
  onComplete,
}: BlackHoleVortexTransitionProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [stage, setStage] = useState<'idle' | 'sucking' | 'singularity' | 'emerging' | 'fading_out'>('idle');
  const [badgeOpacity, setBadgeOpacity] = useState(1);
  const rafRef = useRef<number | null>(null);
  const timersRef = useRef<NodeJS.Timeout[]>([]);

  // 播放黑洞下潛與綻放音效
  const playSound = (type: 'suck' | 'emerge') => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      if (type === 'suck') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(45, now + 1.05);
        gain.gain.setValueAtTime(0.045, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 1.1);
      } else if (type === 'emerge') {
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          const t0 = now + i * 0.11;
          osc.frequency.setValueAtTime(freq, t0);
          gain.gain.setValueAtTime(0.001, t0);
          gain.gain.linearRampToValueAtTime(0.05, t0 + 0.22);
          gain.gain.exponentialRampToValueAtTime(0.001, t0 + 1.0);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(t0);
          osc.stop(t0 + 1.0);
        });
      }
    } catch {}
  };

  // 繪製當前卡片網格快照到離屏 Canvas
  const captureSnapshot = (w: number, h: number): HTMLCanvasElement => {
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const ctx = off.getContext('2d')!;

    // 背景
    ctx.fillStyle = '#07142b';
    ctx.fillRect(0, 0, w, h);

    const isMobile = w < 640;
    const cols = isMobile ? 2 : Math.min(3, pageCards.length || 3);
    const rows = Math.ceil(pageCards.length / cols) || 2;
    const padX = isMobile ? 12 : 24;
    const startY = isMobile ? 40 : 64;
    const gap = isMobile ? 8 : 12;
    const cw = (w - padX * 2 - gap * (cols - 1)) / cols;
    const ch = isMobile ? 96 : 140;

    // 標題裝飾
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${isMobile ? 13 : 18}px sans-serif`;
    ctx.fillText('匯入藥品清單', padX, isMobile ? 24 : 40);

    ctx.fillStyle = '#00f2fe';
    ctx.font = `bold ${isMobile ? 11 : 13}px sans-serif`;
    ctx.fillText(`多頁非同步辨識 (${pageCards.length} / ${pageCards.length} 完成)`, padX, isMobile ? 36 : 58);

    pageCards.forEach((card, idx) => {
      const c = idx % cols;
      const r = Math.floor(idx / cols);
      const x = padX + c * (cw + gap);
      const y = startY + r * (ch + gap);

      // 卡片底色與邊框
      ctx.fillStyle = '#162a56';
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(x, y, cw, ch, isMobile ? 8 : 12);
      ctx.fill();
      ctx.stroke();

      // 頁碼標籤
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(x + 8, y + 8, isMobile ? 48 : 60, isMobile ? 18 : 22);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = `bold ${isMobile ? 11 : 12}px monospace`;
      const pLabel = card.realPageNumber ? `第 ${card.realPageNumber} 頁` : `編號 #${card.initialIndex}`;
      ctx.fillText(pLabel, x + 12, y + (isMobile ? 21 : 24));

      // 完成標記
      ctx.fillStyle = 'rgba(16, 185, 129, 0.25)';
      ctx.fillRect(x + cw - (isMobile ? 46 : 56), y + 8, isMobile ? 38 : 46, isMobile ? 18 : 22);
      ctx.fillStyle = '#6ee7b7';
      ctx.font = `bold ${isMobile ? 11 : 12}px sans-serif`;
      ctx.fillText('✓ 完成', x + cw - (isMobile ? 42 : 50), y + (isMobile ? 21 : 24));

      // 模型標籤
      ctx.fillStyle = '#00f2fe';
      ctx.font = `${isMobile ? 10 : 11}px monospace`;
      ctx.fillText('gemini-3.1-flash-lite', x + 8, y + ch * (isMobile ? 0.52 : 0.56));

      // 提取項數
      ctx.fillStyle = '#6ee7b7';
      ctx.font = `bold ${isMobile ? 12 : 14}px sans-serif`;
      ctx.fillText(`成功提取 ${card.itemCount ?? 44} 項`, x + 8, y + ch * (isMobile ? 0.74 : 0.76));

      // 底部完成進度
      ctx.fillStyle = '#34d399';
      ctx.font = `${isMobile ? 10 : 11}px monospace`;
      ctx.fillText('辨識完成', x + 8, y + ch - (isMobile ? 8 : 10));
      ctx.fillText('100%', x + cw - (isMobile ? 32 : 38), y + ch - (isMobile ? 8 : 10));
    });

    return off;
  };

  useEffect(() => {
    if (!isActive) {
      setStage('idle');
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d')!;
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.hypot(cx, cy);
    const rings = 52; // 方案 M 專屬 52 層同心圓環

    // 1. 取得快照
    const snapshot = captureSnapshot(w, h);

    // 2. 啟動黑洞下潛吸入
    setStage('sucking');
    setBadgeOpacity(1);
    playSound('suck');

    let frame = 0;
    const maxFrames = 64; // 約 1.05 秒吸入

    const stepSucking = () => {
      frame++;
      const p = Math.min(1, frame / maxFrames);

      ctx.clearRect(0, 0, w, h);

      const easeIn = Math.pow(p, 1.85);
      const globalScale = Math.max(0.01, 1 - easeIn);
      const maxRotations = Math.PI * 4.6; // 旋轉約 2.3 圈

      // 黑洞吸積盤光暈
      const bhGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, 110 * (1 - p * 0.45));
      bhGrad.addColorStop(0, '#000000');
      bhGrad.addColorStop(0.28, 'rgba(0, 242, 254, 0.75)');
      bhGrad.addColorStop(1, 'rgba(7, 20, 43, 0)');
      ctx.fillStyle = bhGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, 120, 0, Math.PI * 2);
      ctx.fill();

      // 52 層同心圓環差速漩渦繪製
      for (let i = rings - 1; i >= 0; i--) {
        const rRatio = i / rings;
        const innerR = (i / rings) * maxR * globalScale;
        const outerR = ((i + 1.18) / rings) * maxR * globalScale;

        const twistAngle = easeIn * maxRotations * Math.pow(1 - rRatio * 0.75, 2.1);

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
        if (innerR > 0) {
          ctx.arc(cx, cy, innerR, 0, Math.PI * 2, true);
        }
        ctx.clip();

        ctx.translate(cx, cy);
        ctx.rotate(twistAngle);
        ctx.scale(globalScale, globalScale);
        ctx.globalAlpha = Math.min(1, (1 - p) * 1.35);
        ctx.drawImage(snapshot, -cx, -cy);
        ctx.restore();
      }

      // 中心黑洞黑核
      ctx.beginPath();
      ctx.arc(cx, cy, 8 + Math.sin(p * Math.PI) * 12, 0, Math.PI * 2);
      ctx.fillStyle = '#000000';
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#00f2fe';
      ctx.fill();

      if (frame < maxFrames) {
        rafRef.current = requestAnimationFrame(stepSucking);
      } else {
        ctx.clearRect(0, 0, w, h);

        // 3. 奇點靜默蓄力間隔 (約 550ms)
        setStage('singularity');

        const t1 = setTimeout(() => {
          // 4. 完成徽章緩慢浮現
          setStage('emerging');
          playSound('emerge');

          const t2 = setTimeout(() => {
            // 5. 通知外部 UI 背景開始恢復透明度 (1 秒平滑過渡)
            onStartFadeInUi();

            // 6. 背景完全浮現後，前景徽章淡出
            const t3 = setTimeout(() => {
              setBadgeOpacity(0);
              const t4 = setTimeout(() => {
                setStage('idle');
                onComplete();
              }, 700);
              timersRef.current.push(t4);
            }, 1100);
            timersRef.current.push(t3);
          }, 700);
          timersRef.current.push(t2);
        }, 550);
        timersRef.current.push(t1);
      }
    };

    rafRef.current = requestAnimationFrame(stepSucking);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      timersRef.current.forEach(t => clearTimeout(t));
      timersRef.current = [];
    };
  }, [isActive]);

  if (!isActive && stage === 'idle') return null;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none overflow-hidden select-none">
      {/* 黑洞漩渦 Canvas 畫布 */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* 階段 3：奇點靜默脈動光點 */}
      {stage === 'singularity' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-4 h-4 rounded-full bg-white shadow-[0_0_25px_#00f2fe] animate-pulse" />
        </div>
      )}

      {/* 階段 4：緩慢浮現之科技全息完成徽章 */}
      {(stage === 'emerging' || stage === 'fading_out') && (
        <div
          className="absolute inset-0 flex items-center justify-center p-4 transition-opacity duration-700"
          style={{ opacity: badgeOpacity }}
        >
          <div className="relative p-6 sm:p-8 rounded-3xl bg-[#07142b]/90 backdrop-blur-2xl border-2 border-[#00f2fe] shadow-[0_0_50px_rgba(0,242,254,0.45)] flex flex-col items-center text-center animate-in zoom-in-75 duration-700 max-w-sm w-full">
            {/* 旋轉外環 */}
            <div className="relative w-20 h-20 sm:w-24 sm:h-24 flex items-center justify-center mb-3">
              <div className="absolute inset-0 rounded-full border-2 border-dashed border-[#00f2fe] animate-spin" style={{ animationDuration: '8s' }} />
              <div className="absolute inset-2 rounded-full border border-emerald-400 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '5s' }} />
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-[#00f2fe]/40 via-[#162a56] to-emerald-500/40 border-2 border-[#00f2fe] flex items-center justify-center shadow-[0_0_30px_#00f2fe]">
                <svg className="w-8 h-8 sm:w-9 sm:h-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>

            <div className="space-y-1">
              <div className="inline-flex items-center gap-1 px-3 py-0.5 rounded-full bg-[#00f2fe]/15 border border-[#00f2fe]/40 text-[#00f2fe] text-xs font-mono font-bold tracking-widest">
                ALL {totalPagesCount} PAGES MERGED
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-white mt-1">全頁辨識核驗完畢</h3>
              <p className="text-xs text-slate-300">
                已成功對齊匯總 <span className="text-[#00f2fe] font-mono font-bold text-sm">{totalItemsCount}</span> 項藥品品項
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
