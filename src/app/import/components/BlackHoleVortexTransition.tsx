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

    // 1. 啟動多體差速螺旋吸入（各卡片獨立螺旋軌跡，零卡頓 GPU 硬體加速）
    setStage('sucking');
    setBadgeOpacity(1);
    playSound('suck');

    // 吸入歷程約 1.05 秒 -> 進入奇點靜默 (約 450ms)
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
      }, 450);
      timersRef.current.push(t2);
    }, 1050);
    timersRef.current.push(t1);

    return () => {
      timersRef.current.forEach(t => clearTimeout(t));
      timersRef.current = [];
    };
  }, [isActive]);

  if (!isActive && stage === 'idle') return null;

  // 動態計算各卡片在視窗中心的網格起始坐標偏移，打破單一平面塊狀
  const displayCards = pageCards.length > 0 ? pageCards : [
    { id: '1', initialIndex: 1, itemCount: 44, realPageNumber: 1, url: '', percent: 100, status: 'success' as const, model: 'Gemini 3.1' }
  ];
  const cols = displayCards.length <= 1 ? 1 : 2;
  const totalRows = Math.ceil(displayCards.length / cols);

  // 生成 16 顆向心螺旋吸引的星塵光子粒子
  const vortexParticles = Array.from({ length: 16 }).map((_, i) => {
    const angle = (i * (360 / 16)) * (Math.PI / 180);
    const dist = 140 + (i % 4) * 35;
    return {
      id: i,
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      delay: (i * 45) % 400,
      duration: 650 + (i % 3) * 120,
      color: i % 2 === 0 ? '#00f2fe' : '#10b981',
      size: i % 3 === 0 ? 4 : 3,
    };
  });

  return (
    <div className="fixed inset-0 z-50 pointer-events-none overflow-hidden select-none bg-[#07142b]/95 backdrop-blur-sm">
      
      {/* 階段 2：各卡片獨立軌跡的黑洞差速螺旋吸入（多體物理撕扯，絕非整塊縮放） */}
      {stage === 'sucking' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <style>{`
            @keyframes cardVortexOrbit {
              0% {
                transform: translate(var(--start-x), var(--start-y)) rotate(0deg) scale(1);
                opacity: 1;
                filter: blur(0px);
              }
              35% {
                transform: translate(calc(var(--start-x) * 0.75), calc(var(--start-y) * 0.75)) rotate(-150deg) scale(0.8) skewX(-12deg);
                opacity: 0.95;
                filter: blur(0.5px);
              }
              70% {
                transform: translate(calc(var(--start-x) * 0.3), calc(var(--start-y) * 0.3)) rotate(-420deg) scale(0.4) skewX(-20deg);
                opacity: 0.8;
                filter: blur(2px);
              }
              100% {
                transform: translate(0px, 0px) rotate(-720deg) scale(0.01) skewX(-30deg);
                opacity: 0;
                filter: blur(8px);
              }
            }

            @keyframes particleSpiralIn {
              0% {
                transform: translate(var(--p-x), var(--p-y)) rotate(0deg) scale(1);
                opacity: 0.9;
              }
              60% {
                transform: translate(calc(var(--p-x) * 0.35), calc(var(--p-y) * 0.35)) rotate(-300deg) scale(0.8);
                opacity: 0.7;
              }
              100% {
                transform: translate(0px, 0px) rotate(-640deg) scale(0.1);
                opacity: 0;
              }
            }

            @keyframes accretionDiskRotate {
              0% { transform: rotate(0deg) scale(1); }
              50% { transform: rotate(180deg) scale(1.08); }
              100% { transform: rotate(360deg) scale(1); }
            }
          `}</style>

          {/* 黑洞核心吸積光環（多層差速漩渦能量環） */}
          <div
            className="absolute w-64 h-64 rounded-full border border-[#00f2fe]/40 pointer-events-none"
            style={{
              background: 'radial-gradient(circle, rgba(0,242,254,0.15) 0%, rgba(16,185,129,0.08) 45%, transparent 70%)',
              animation: 'accretionDiskRotate 3s linear infinite',
            }}
          />
          <div
            className="absolute w-44 h-44 rounded-full border-2 border-dashed border-[#10b981]/70 pointer-events-none"
            style={{
              animation: 'accretionDiskRotate 1.8s linear infinite reverse',
            }}
          />
          <div className="absolute w-24 h-24 rounded-full border-2 border-[#00f2fe] animate-ping opacity-50 pointer-events-none" />
          
          {/* 黑洞視界奇點核心 */}
          <div className="absolute w-14 h-14 rounded-full bg-black shadow-[0_0_35px_#00f2fe] border border-[#00f2fe]/60 pointer-events-none z-30" />

          {/* 16 顆獨立螺旋向心粒子流 */}
          {vortexParticles.map((p) => (
            <div
              key={p.id}
              className="absolute rounded-full pointer-events-none z-20"
              style={{
                width: `${p.size}px`,
                height: `${p.size}px`,
                backgroundColor: p.color,
                boxShadow: `0 0 10px ${p.color}`,
                '--p-x': `${p.x}px`,
                '--p-y': `${p.y}px`,
                animation: `particleSpiralIn ${p.duration}ms cubic-bezier(0.5, 0, 0.7, 0.2) ${p.delay}ms forwards`,
              } as React.CSSProperties}
            />
          ))}

          {/* 各卡片實體：各自獨立脫離網格，按專屬螺旋軌道與延遲被黑洞撕扯吸入 */}
          {displayCards.map((c, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            // 計算以中心為基準的相對坐標偏移
            const startX = (col - (cols - 1) / 2) * 145;
            const startY = (row - (totalRows - 1) / 2) * 88;
            const delay = i * 55; // 卡片交錯時間差，營造先後被吸入的立體漩渦感

            return (
              <div
                key={c.id || i}
                className="absolute w-32 sm:w-36 h-20 rounded-xl bg-[#162a56]/95 border border-[#10b981] p-2 flex flex-col justify-between shadow-[0_0_15px_rgba(0,242,254,0.3)] pointer-events-none z-20"
                style={{
                  '--start-x': `${startX}px`,
                  '--start-y': `${startY}px`,
                  animation: `cardVortexOrbit 880ms cubic-bezier(0.55, 0.055, 0.675, 0.19) ${delay}ms forwards`,
                  willChange: 'transform, opacity, filter',
                } as React.CSSProperties}
              >
                <div className="flex justify-between items-center text-[10px] font-mono text-white">
                  <span className="bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-700">
                    P.{c.realPageNumber ?? c.initialIndex}
                  </span>
                  <span className="text-[#10b981] font-bold">✓ DONE</span>
                </div>
                <div className="text-[11px] font-bold text-[#00f2fe] truncate">
                  提取 {c.itemCount ?? 44} 項藥品
                </div>
                <div className="h-1 bg-slate-900 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-emerald-500 to-[#00f2fe] w-full" />
                </div>
              </div>
            );
          })}
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
