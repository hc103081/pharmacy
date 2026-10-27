'use client';

import React, { useEffect, useState, useRef } from 'react';
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
  const [stage, setStage] = useState<'idle' | 'sucking' | 'singularity' | 'emerging' | 'done'>('idle');
  const [badgeOpacity, setBadgeOpacity] = useState(1);
  const timersRef = useRef<NodeJS.Timeout[]>([]);

  // 播放輕量 Web Audio 合成音效
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
        osc.frequency.setValueAtTime(260, now);
        osc.frequency.exponentialRampToValueAtTime(45, now + 0.85);
        gain.gain.setValueAtTime(0.04, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.9);
      } else if (type === 'emerge') {
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          const t0 = now + i * 0.1;
          osc.frequency.setValueAtTime(freq, t0);
          gain.gain.setValueAtTime(0.001, t0);
          gain.gain.linearRampToValueAtTime(0.045, t0 + 0.2);
          gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.9);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(t0);
          osc.stop(t0 + 0.9);
        });
      }
    } catch {}
  };

  useEffect(() => {
    if (!isActive) {
      setStage('idle');
      return;
    }

    // 1. 啟動 GPU 硬體加速的旋轉吸入（0 CPU 佔用，原生 60~120fps）
    setStage('sucking');
    setBadgeOpacity(1);
    playSound('suck');

    // 0.85 秒吸入完畢 -> 進入奇點靜默 (約 500ms)
    const t1 = setTimeout(() => {
      setStage('singularity');

      const t2 = setTimeout(() => {
        // 進入完成徽章緩慢浮現
        setStage('emerging');
        playSound('emerge');

        // 徽章浮現後通知外部 UI 開始恢復透明度
        const t3 = setTimeout(() => {
          onStartFadeInUi();

          // 背景浮現完畢後，徽章淡出
          const t4 = setTimeout(() => {
            setBadgeOpacity(0);
            const t5 = setTimeout(() => {
              setStage('done');
              onComplete();
            }, 600);
            timersRef.current.push(t5);
          }, 950);
          timersRef.current.push(t4);
        }, 600);
        timersRef.current.push(t3);
      }, 500);
      timersRef.current.push(t2);
    }, 850);
    timersRef.current.push(t1);

    return () => {
      timersRef.current.forEach(t => clearTimeout(t));
      timersRef.current = [];
    };
  }, [isActive]);

  if (!isActive && stage === 'idle') return null;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none overflow-hidden select-none bg-[#07142b]/95 backdrop-blur-sm">
      
      {/* 階段 2：GPU 硬體加速黑洞旋轉吸入（採用純 CSS 3D Compositor Keyframes，零卡頓、絲滑流暢） */}
      {stage === 'sucking' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <style>{`
            @keyframes blackHoleSuck {
              0% {
                transform: scale(1) rotate(0deg);
                opacity: 1;
                filter: blur(0px);
              }
              40% {
                transform: scale(0.68) rotate(-180deg);
                opacity: 0.95;
                filter: blur(1px);
              }
              75% {
                transform: scale(0.22) rotate(-450deg);
                opacity: 0.6;
                filter: blur(3px);
              }
              100% {
                transform: scale(0.01) rotate(-720deg);
                opacity: 0;
                filter: blur(10px);
              }
            }
          `}</style>

          {/* 黑洞核心吸積光環 */}
          <div className="absolute w-48 h-48 rounded-full border-4 border-[#00f2fe]/60 animate-ping opacity-60 pointer-events-none" />
          <div className="absolute w-32 h-32 rounded-full border-2 border-dashed border-[#10b981] animate-spin pointer-events-none" style={{ animationDuration: '2s' }} />
          <div className="absolute w-16 h-16 rounded-full bg-black shadow-[0_0_40px_#00f2fe] pointer-events-none z-20" />

          {/* 畫面旋轉吸入層（GPU CSS keyframe 驅動） */}
          <div
            className="w-full h-full p-4 flex flex-col justify-center items-center pointer-events-none"
            style={{
              animation: 'blackHoleSuck 850ms cubic-bezier(0.55, 0.055, 0.675, 0.19) forwards',
              willChange: 'transform, opacity, filter',
            }}
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-w-xl w-full">
              {pageCards.map((c, i) => (
                <div key={c.id || i} className="h-20 rounded-xl bg-[#162a56] border border-[#10b981] p-2 flex flex-col justify-between shadow-lg">
                  <div className="flex justify-between text-[11px] font-mono text-white">
                    <span>第 {c.realPageNumber ?? c.initialIndex} 頁</span>
                    <span className="text-[#10b981] font-bold">✓</span>
                  </div>
                  <div className="text-xs font-bold text-[#00f2fe]">提取 {c.itemCount ?? 44} 項</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 階段 3：奇點靜默脈動光點 (0.5s) */}
      {stage === 'singularity' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-4 h-4 rounded-full bg-white shadow-[0_0_30px_#00f2fe] animate-pulse" />
        </div>
      )}

      {/* 階段 4：緩慢浮現之科技全息完成徽章 */}
      {(stage === 'emerging' || stage === 'done') && (
        <div
          className="absolute inset-0 flex items-center justify-center p-4 transition-opacity duration-600"
          style={{ opacity: badgeOpacity }}
        >
          <div className="relative p-5 sm:p-7 rounded-3xl bg-[#07142b]/95 backdrop-blur-2xl border-2 border-[#00f2fe] shadow-[0_0_45px_rgba(0,242,254,0.4)] flex flex-col items-center text-center animate-in zoom-in-75 duration-600 max-w-xs sm:max-w-sm w-full">
            {/* 旋轉外環 */}
            <div className="relative w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center mb-2.5">
              <div className="absolute inset-0 rounded-full border-2 border-dashed border-[#00f2fe] animate-spin" style={{ animationDuration: '7s' }} />
              <div className="absolute inset-1.5 rounded-full border border-emerald-400 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '4.5s' }} />
              <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-[#00f2fe]/40 via-[#162a56] to-emerald-500/40 border-2 border-[#00f2fe] flex items-center justify-center shadow-[0_0_25px_#00f2fe]">
                <svg className="w-6 h-6 sm:w-8 sm:h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>

            <div className="space-y-0.5">
              <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#00f2fe]/15 border border-[#00f2fe]/40 text-[#00f2fe] text-[10px] font-mono font-bold tracking-widest">
                ALL {totalPagesCount} PAGES MERGED
              </div>
              <h3 className="text-base sm:text-lg font-bold text-white mt-1">全頁辨識核驗完畢</h3>
              <p className="text-xs text-slate-300">
                已成功對齊匯總 <span className="text-[#00f2fe] font-mono font-bold">{totalItemsCount}</span> 項藥品品項
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
