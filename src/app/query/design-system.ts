/**
 * PhamaCount Query System - Design System Tokens
 * 
 * 統一的設計語言，確保所有組件視覺一致性
 * 基於 AGENTS.md 規範：High-Contrast Dark Tech (高對比深色科技感)
 */

// ============================================
// Color Tokens - 精確對應 AGENTS.md 規範
// ============================================
export const colors = {
  // Backgrounds - 背景層級
  bg: {
    primary: '#07142b',           // Main Background (全局底色)
    secondary: '#0a1936',         // Inner / Nested Surface (卡片內部數據格、次要區塊)
    surface: '#162a56',           // Card / Panel Surface (卡片與側欄)
    surfaceHover: '#1e3a5f',      // 懸停狀態
    surfaceActive: '#1f3a75',     // 按鈕按下/激活狀態
    overlay: 'rgba(0, 0, 0, 0.5)',
    input: '#0c1d3d',             // Input 背景 (AGENTS.md 規範)
  },
  
  // Borders - 邊框
  border: {
    default: '#1e293b',           // slate-800
    hover: '#334155',             // slate-700
    focus: '#00f2fe',             // 極光藍 Focus
    error: '#ff4b5c',             // 霓虹紅
    success: '#22c55e',           // 綠色
    panel: '#233d7a',             // Panel/Card 邊框 (AGENTS.md 規範)
    input: '#233d7a',             // Input 邊框 (AGENTS.md 規範)
    buttonSecondary: '#2a478c',   // 次要按鈕邊框
    inner: '#1e3468',             // 內部區塊邊框
  },
  
  // Text - 文字層級
  text: {
    primary: '#ffffff',           // 主標題/品名/關鍵數值
    secondary: '#cbd5e1',         // 次要資訊/標籤 (slate-300)
    muted: '#94a3b8',             // 輔助說明/時間戳記 (slate-400)
    disabled: '#64748b',          // 禁用文字 (slate-500)
    inverse: '#07142b',           // 反向文字 (用於極光藍實心按鈕上)
    inputPlaceholder: '#94a3b8',  // Input placeholder (slate-400)
  },
  
  // Accent / Semantic - 強調色
  accent: {
    primary: '#00f2fe',           // 極光藍 - 主要強調色
    primaryHover: '#00d4e0',
    primaryActive: '#00b8c4',
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ff4b5c',             // 霓虹紅 - 差異/錯誤
    info: '#3b82f6',
  },
  
  // Status chips - 狀態標籤
  status: {
    active: { bg: 'rgba(0, 242, 254, 0.15)', text: '#00f2fe', border: 'rgba(0, 242, 254, 0.3)' },
    completed: { bg: 'rgba(34, 197, 94, 0.15)', text: '#22c55e', border: 'rgba(34, 197, 94, 0.3)' },
    pending: { bg: 'rgba(100, 116, 139, 0.15)', text: '#94a3b8', border: 'rgba(100, 116, 139, 0.3)' },
    error: { bg: 'rgba(255, 75, 92, 0.15)', text: '#ff4b5c', border: 'rgba(255, 75, 92, 0.3)' },
    skipped: { bg: 'rgba(100, 116, 139, 0.15)', text: '#64748b', border: 'rgba(100, 116, 139, 0.3)' },
    archived: { bg: 'rgba(100, 116, 139, 0.15)', text: '#64748b', border: 'rgba(100, 116, 139, 0.3)' },
    discrepancy: {
      positive: { bg: 'rgba(255, 75, 92, 0.15)', text: '#ff4b5c', border: 'rgba(255, 75, 92, 0.3)' },
      negative: { bg: 'rgba(0, 242, 254, 0.15)', text: '#00f2fe', border: 'rgba(0, 242, 254, 0.3)' },
      zero: { bg: 'rgba(100, 116, 139, 0.15)', text: '#64748b', border: 'rgba(100, 116, 139, 0.3)' },
    },
  },
  
  // Glow effects - 發光效果
  glow: {
    primary: '0 0 15px rgba(0, 242, 254, 0.5)',
    primarySubtle: '0 0 8px rgba(0, 242, 254, 0.3)',
    focus: '0 0 15px rgba(0, 242, 254, 0.35)',     // Input focus (AGENTS.md 規範)
    error: '0 0 15px rgba(255, 75, 92, 0.5)',
  },
} as const;

// ============================================
// Typography Tokens
// ============================================
export const typography = {
  fontFamily: {
    sans: 'var(--font-geist-sans), system-ui, sans-serif',
    mono: 'var(--font-geist-mono), ui-monospace, monospace',
  },
  
  scale: {
    display: 'text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight',
    h1: 'text-2xl md:text-3xl font-bold tracking-tight',
    h2: 'text-xl md:text-2xl font-semibold tracking-tight',
    h3: 'text-lg md:text-xl font-semibold',
    h4: 'text-base md:text-lg font-medium',
    body: 'text-base leading-relaxed',
    bodySm: 'text-sm leading-normal',
    caption: 'text-xs leading-normal',
    label: 'text-sm font-medium',
    labelSm: 'text-xs font-medium',
    code: 'font-mono text-sm',
    codeLg: 'font-mono text-base',
    button: 'text-sm font-medium',
    buttonLg: 'text-base font-medium',
  },
  
  leading: {
    tight: 'leading-tight',
    snug: 'leading-snug',
    normal: 'leading-normal',
    relaxed: 'leading-relaxed',
    loose: 'leading-loose',
  },
} as const;

// ============================================
// Spacing Tokens
// ============================================
export const spacing = {
  section: 'py-16 md:py-24',
  sectionSm: 'py-8 md:py-12',
  container: 'max-w-7xl mx-auto px-4 md:px-6 lg:px-8',
  card: 'p-4 md:p-6',
  cardSm: 'p-3 md:p-4',
  gap: 'gap-4 md:gap-6',
  gapSm: 'gap-2 md:gap-3',
  gapLg: 'gap-6 md:gap-8',
  stack: 'space-y-4 md:space-y-6',
  stackSm: 'space-y-2 md:space-y-3',
  inline: 'gap-2 md:gap-3',
} as const;

// ============================================
// Border Radius Tokens
// ============================================
export const radius = {
  none: 'rounded-none',
  sm: 'rounded',           // 4px
  md: 'rounded-md',        // 6px
  lg: 'rounded-lg',        // 8px - 輸入框、按鈕
  xl: 'rounded-xl',        // 12px - 卡片
  '2xl': 'rounded-2xl',    // 16px - 面板、模態框
  '3xl': 'rounded-3xl',    // 24px - 大型容器
  full: 'rounded-full',    // 圓形/藥丸
} as const;

// ============================================
// Shadow / Elevation Tokens
// ============================================
export const shadows = {
  none: 'shadow-none',
  xs: 'shadow-xs',
  sm: 'shadow-sm',
  md: 'shadow-md',
  lg: 'shadow-lg',
  xl: 'shadow-xl',
  '2xl': 'shadow-2xl',
  inner: 'shadow-inner',
  glow: 'shadow-[0_0_15px_rgba(0,242,254,0.5)]',
  glowSubtle: 'shadow-[0_0_8px_rgba(0,242,254,0.3)]',
  focusInput: 'shadow-[0_0_15px_rgba(0,242,254,0.35)]',  // Input focus glow
} as const;

// ============================================
// Transition / Motion Tokens
// ============================================
export const motion = {
  duration: {
    instant: 'duration-75',
    fast: 'duration-100',
    normal: 'duration-200',
    slow: 'duration-300',
    slower: 'duration-500',
  },
  easing: {
    linear: 'ease-linear',
    in: 'ease-in',
    out: 'ease-out',
    inOut: 'ease-in-out',
    spring: 'cubic-bezier(0.16, 1, 0.3, 1)',
  },
  stagger: {
    base: '50ms',
    item: (index: number) => `delay-[${index * 50}ms]`,
  },
} as const;

// ============================================
// Z-Index Scale
// ============================================
export const zIndex = {
  base: 0,
  dropdown: 10,
  sticky: 20,
  drawer: 30,
  overlay: 40,
  modal: 50,
  popover: 60,
  toast: 70,
  tooltip: 80,
} as const;

// ============================================
// Breakpoints
// ============================================
export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

// ============================================
// Component Variants - 精確對應 AGENTS.md 規範
// ============================================
export const variants = {
  // Card variants
  card: {
    default: `
      bg-[${colors.bg.surface}]/70 
      backdrop-blur-md
      border border-[${colors.border.panel}] 
      ${radius.xl} 
      ${shadows.md}
      transition-all ${motion.duration.normal} ${motion.easing.out}
      hover:border-[${colors.border.hover}] hover:${shadows.lg}
    `,
    interactive: `
      bg-[${colors.bg.surface}]/70 
      backdrop-blur-md
      border border-[${colors.border.panel}] 
      ${radius.xl} 
      ${shadows.md}
      transition-all ${motion.duration.normal} ${motion.easing.out}
      hover:border-[${colors.accent.primary}]/50 hover:${shadows.glowSubtle}
      cursor-pointer
    `,
    elevated: `
      bg-[${colors.bg.surface}]/80 
      backdrop-blur-md
      border border-[${colors.border.panel}] 
      ${radius['2xl']} 
      ${shadows.xl}
    `,
    inner: `
      bg-[${colors.bg.secondary}]/80
      border border-[${colors.border.inner}]
      ${radius.lg}
    `,
  },
  
  // Button variants - 精確對應 AGENTS.md 規範
  button: {
    // Primary: 半透明發光風格 (推薦) - bg-[#00f2fe]/20 text-[#00f2fe] border border-[#00f2fe]
    primary: `
      bg-[${colors.accent.primary}]/20
      border border-[${colors.accent.primary}]
      text-[${colors.accent.primary}]
      ${radius.lg}
      ${shadows.none}
      transition-all ${motion.duration.fast} ${motion.easing.out}
      hover:bg-[${colors.accent.primary}]/30
      active:scale-95 active:bg-[${colors.accent.primary}]/40
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[${colors.accent.primary}] focus-visible:ring-offset-2 focus-visible:ring-offset-[${colors.bg.primary}]
      disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100
    `,
    // Primary Solid: 實心極光藍 - 文字必須深色 (AGENTS.md 鐵律)
    primarySolid: `
      bg-[${colors.accent.primary}]
      text-[${colors.text.inverse}] font-bold
      ${radius.lg}
      transition-all ${motion.duration.fast} ${motion.easing.out}
      hover:bg-[${colors.accent.primaryHover}]
      active:scale-95 active:bg-[${colors.accent.primaryActive}]
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[${colors.accent.primary}] focus-visible:ring-offset-2 focus-visible:ring-offset-[${colors.bg.primary}]
      disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100
    `,
    // Secondary: 深藍底灰字 - bg-[#162a56] text-slate-200 border border-[#2a478c]
    secondary: `
      bg-[${colors.bg.surface}]
      border border-[${colors.border.buttonSecondary}]
      text-[${colors.text.secondary}]
      ${radius.lg}
      transition-all ${motion.duration.fast} ${motion.easing.out}
      hover:bg-[${colors.bg.surfaceActive}] hover:border-[${colors.border.hover}] hover:text-[${colors.text.primary}]
      active:scale-95 active:bg-[${colors.bg.surfaceActive}]
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[${colors.border.focus}] focus-visible:ring-offset-2 focus-visible:ring-offset-[${colors.bg.primary}]
      disabled:opacity-50 disabled:cursor-not-allowed
    `,
    // Ghost: 透明背景
    ghost: `
      bg-transparent
      border-none
      text-[${colors.text.secondary}]
      ${radius.lg}
      transition-all ${motion.duration.fast} ${motion.easing.out}
      hover:bg-[${colors.bg.surfaceHover}] hover:text-[${colors.text.primary}]
      active:scale-95 active:bg-[${colors.bg.surfaceActive}]
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[${colors.border.focus}] focus-visible:ring-offset-2 focus-visible:ring-offset-[${colors.bg.primary}]
      disabled:opacity-50 disabled:cursor-not-allowed
    `,
    // Danger: 霓虹紅
    danger: `
      bg-[${colors.accent.error}]/20
      border border-[${colors.accent.error}]
      text-[${colors.accent.error}]
      ${radius.lg}
      transition-all ${motion.duration.fast} ${motion.easing.out}
      hover:bg-[${colors.accent.error}]/30
      active:scale-95 active:bg-[${colors.accent.error}]/40
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[${colors.accent.error}] focus-visible:ring-offset-2 focus-visible:ring-offset-[${colors.bg.primary}]
      disabled:opacity-50 disabled:cursor-not-allowed
    `,
    // Icon: 圖示按鈕 - 深色圓角
    icon: `
      flex items-center justify-center
      w-10 h-10 min-w-[44px] min-h-[44px]
      bg-[${colors.bg.surfaceHover}]
      border border-[${colors.border.default}]
      text-[${colors.text.secondary}]
      ${radius.xl}
      transition-all ${motion.duration.fast} ${motion.easing.out}
      hover:bg-[${colors.bg.surfaceActive}] hover:border-[${colors.border.hover}] hover:text-[${colors.text.primary}]
      active:scale-95 active:bg-[${colors.bg.surfaceActive}]
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[${colors.border.focus}] focus-visible:ring-offset-2
      disabled:opacity-50 disabled:cursor-not-allowed
    `,
    // Pill/Tag: 緊湊膠囊按鈕 (用於儲位/類別選擇)
    pill: `
      inline-flex items-center
      px-2.5 py-1
      text-xs font-medium
      ${radius.lg}
      transition-all ${motion.duration.fast} ${motion.easing.out}
      bg-[${colors.bg.input}]
      text-[${colors.text.secondary}]
      border border-[${colors.border.input}]
      hover:border-[${colors.border.hover}]
      active:scale-95
    `,
    pillSelected: `
      inline-flex items-center
      px-2.5 py-1
      text-xs font-medium
      ${radius.lg}
      transition-all ${motion.duration.fast} ${motion.easing.out}
      bg-[${colors.accent.primary}]/20
      text-[${colors.accent.primary}]
      border border-[${colors.accent.primary}]
      shadow-[0_0_10px_rgba(0,242,254,0.25)]
      active:scale-95
    `,
  },
  
  // Input variants - 精確對應 AGENTS.md 規範
  input: {
    default: `
      w-full
      px-3.5 py-2
      min-h-[44px]
      bg-[${colors.bg.input}]
      border border-[${colors.border.input}]
      ${radius.xl}
      text-[${colors.text.primary}]
      placeholder-[${colors.text.inputPlaceholder}]
      transition-all ${motion.duration.normal} ${motion.easing.out}
      focus:outline-none focus:border-[${colors.accent.primary}] focus:ring-2 focus:ring-[${colors.accent.primary}]/30 focus:${shadows.focusInput}
      disabled:bg-[${colors.bg.secondary}] disabled:border-[${colors.border.input}] disabled:text-[${colors.text.disabled}] disabled:cursor-not-allowed
    `,
    search: `
      w-full
      pl-10 pr-4 py-2
      min-h-[44px]
      bg-[${colors.bg.input}]
      border border-[${colors.border.input}]
      ${radius.xl}
      text-[${colors.text.primary}]
      placeholder-[${colors.text.inputPlaceholder}]
      transition-all ${motion.duration.normal} ${motion.easing.out}
      focus:outline-none focus:border-[${colors.accent.primary}] focus:ring-2 focus:ring-[${colors.accent.primary}]/30 focus:${shadows.focusInput}
    `,
    date: `
      w-full min-w-0
      px-3 py-2
      min-h-[44px]
      bg-[${colors.bg.input}]
      border border-[${colors.border.input}]
      ${radius.lg}
      text-[${colors.text.primary}]
      placeholder-[${colors.text.inputPlaceholder}]
      transition-all ${motion.duration.normal} ${motion.easing.out}
      focus:outline-none focus:border-[${colors.accent.primary}] focus:ring-2 focus:ring-[${colors.accent.primary}]/30 focus:${shadows.focusInput}
    `,
  },
  
  // Badge/Chip variants - 緊湊設計
  badge: {
    default: `
      inline-flex items-center
      px-2 py-0.5
      ${radius.full}
      text-xs font-medium
      bg-[${colors.bg.surfaceHover}]
      text-[${colors.text.secondary}]
      border border-[${colors.border.default}]
    `,
    accent: `
      inline-flex items-center
      px-2 py-0.5
      ${radius.full}
      text-xs font-medium
      bg-[${colors.accent.primary}]/15
      text-[${colors.accent.primary}]
      border border-[${colors.accent.primary}]/30
    `,
    // 條碼 Badge - 等寬字體 (AGENTS.md 規範)
    barcode: `
      inline-flex items-center
      px-2 py-0.5
      ${radius.md}
      text-xs font-medium
      font-mono
      bg-[${colors.accent.primary}]/10
      text-[${colors.accent.primary}]
      border border-[${colors.accent.primary}]/30
    `,
    // 小標籤 Tag - 用於位置/類別 (AGENTS.md 規範)
    tag: `
      inline-flex items-center
      px-1.5 py-0.5
      ${radius.md}
      text-[10px] font-medium
      bg-[${colors.bg.secondary}]/90
      text-[${colors.text.secondary}]
      border border-[${colors.border.inner}]/60
    `,
    status: (type: Exclude<keyof typeof colors.status, 'discrepancy'>) => {
      const s = colors.status[type];
      return `
        inline-flex items-center
        px-2 py-0.5
        ${radius.full}
        text-xs font-medium
        bg-[${s.bg}]
        text-[${s.text}]
        border border-[${s.border}]
      `;
    },
    discrepancy: (value: number) => {
      if (value > 0) {
        return `
          inline-flex items-center
          px-2 py-0.5
          ${radius.full}
          text-xs font-medium
          bg-[${colors.status.discrepancy.positive.bg}]
          text-[${colors.status.discrepancy.positive.text}]
          border border-[${colors.status.discrepancy.positive.border}]
        `;
      }
      if (value < 0) {
        return `
          inline-flex items-center
          px-2 py-0.5
          ${radius.full}
          text-xs font-medium
          bg-[${colors.status.discrepancy.negative.bg}]
          text-[${colors.status.discrepancy.negative.text}]
          border border-[${colors.status.discrepancy.negative.border}]
        `;
      }
      return `
        inline-flex items-center
        px-2 py-0.5
        ${radius.full}
        text-xs font-medium
        bg-[${colors.status.discrepancy.zero.bg}]
        text-[${colors.status.discrepancy.zero.text}]
        border border-[${colors.status.discrepancy.zero.border}]
      `;
    },
  },
  
  // Metrics Grid - 四宮格數據盒 (AGENTS.md 規範)
  metricBox: `
    bg-[${colors.bg.secondary}]/90
    p-2.5
    ${radius.lg}
    border border-[${colors.border.inner}]/60
  `,
  metricValue: 'font-mono text-base font-bold text-white',
  metricLabel: 'text-xs font-medium text-slate-400',
  
  // Table variants
  table: {
    container: 'overflow-x-auto',
    wrapper: 'min-w-full divide-y divide-[${colors.border.default}]',
    header: `
      bg-[${colors.bg.surfaceHover}]/50
    `,
    headerCell: `
      px-4 py-3
      text-left
      text-xs font-medium
      text-[${colors.text.muted}]
      uppercase tracking-wider
      border-b border-[${colors.border.default}]
    `,
    body: 'divide-y divide-[${colors.border.default}]',
    row: `
      hover:bg-[${colors.bg.surfaceHover}]/30
      transition-colors ${motion.duration.fast}
    `,
    cell: `
      px-4 py-3
      text-sm
      text-[${colors.text.secondary}]
    `,
    cellMuted: `
      px-4 py-3
      text-sm
      text-[${colors.text.muted}]
    `,
  },
  
  // Panel/Section variants
  panel: {
    default: `
      bg-[${colors.bg.surface}]/70
      backdrop-blur-md
      border border-[${colors.border.panel}]
      ${radius.xl}
      ${shadows.md}
    `,
    elevated: `
      bg-[${colors.bg.surface}]/80
      backdrop-blur-md
      border border-[${colors.border.panel}]
      ${radius['2xl']}
      ${shadows.xl}
    `,
    bordered: `
      bg-transparent
      border border-[${colors.border.panel}]
      ${radius.xl}
    `,
    header: `
      flex items-center justify-between
      px-6 py-4
      border-b border-[${colors.border.panel}]
    `,
    headerTitle: 'text-xl font-bold text-[${colors.text.primary}]',
    headerDesc: 'text-sm text-[${colors.text.muted}]',
    content: 'p-6',
  },
  
  // Segmented Control / Tab Pill (AGENTS.md 規範)
  segmentedControl: {
    container: `
      flex items-center gap-1
      bg-[${colors.bg.surface}]/50
      border border-[${colors.border.panel}]
      ${radius.xl}
      p-1
    `,
    item: `
      flex items-center gap-1.5
      px-4 py-2
      text-sm font-medium
      ${radius.lg}
      transition-all ${motion.duration.fast} ${motion.easing.out}
      bg-transparent
      text-[${colors.text.muted}]
      hover:text-[${colors.text.secondary}] hover:bg-[${colors.bg.surfaceHover}]/50
      active:scale-95
    `,
    itemSelected: `
      flex items-center gap-1.5
      px-4 py-2
      text-sm font-medium
      ${radius.lg}
      transition-all ${motion.duration.fast} ${motion.easing.out}
      bg-[${colors.accent.primary}]/20
      text-[${colors.accent.primary}]
      border border-[${colors.accent.primary}]/50
      shadow-[0_0_10px_rgba(0,242,254,0.2)]
    `,
  },
  
  // Empty state
  emptyState: `
    flex flex-col items-center justify-center
    py-12 md:py-16
    text-center
  `,
  emptyIcon: 'w-12 h-12 md:w-16 md:h-16 mx-auto mb-4 opacity-50 text-[${colors.text.muted}]',
  emptyTitle: 'text-lg font-medium text-[${colors.text.muted}] mb-2',
  emptyDesc: 'text-sm text-[${colors.text.muted}] max-w-xs',
  
  // Loading skeleton
  skeleton: `
    animate-pulse
    bg-gradient-to-r
    from-[${colors.bg.surfaceHover}]
    via-[${colors.bg.surfaceActive}]
    to-[${colors.bg.surfaceHover}]
    bg-[length:200%_100%]
    ${radius.lg}
  `,
  
  // Focus ring (accessible)
  focusRing: `
    focus-visible:outline-none
    focus-visible:ring-2
    focus-visible:ring-[${colors.accent.primary}]
    focus-visible:ring-offset-2
    focus-visible:ring-offset-[${colors.bg.primary}]
  `,
} as const;

// ============================================
// Utility Functions
// ============================================
// Combine class names
export const cn = (...classes: (string | undefined | null | false)[]) => 
  classes.filter(Boolean).join(' ');

export const utils = {
  // Combine class names (alias for backwards compat)
  cn: (...classes: (string | undefined | null | false)[]) => 
    classes.filter(Boolean).join(' '),
  
  // Get status style
  getStatusStyle: (status: Exclude<keyof typeof colors.status, 'discrepancy'>) => {
    const s = colors.status[status];
    return `bg-[${s.bg}] text-[${s.text}] border-[${s.border}]`;
  },
  
  // Get discrepancy style
  getDiscrepancyStyle: (value: number) => {
    if (value > 0) return `text-[${colors.status.discrepancy.positive.text}] bg-[${colors.status.discrepancy.positive.bg}] border-[${colors.status.discrepancy.positive.border}]`;
    if (value < 0) return `text-[${colors.status.discrepancy.negative.text}] bg-[${colors.status.discrepancy.negative.bg}] border-[${colors.status.discrepancy.negative.border}]`;
    return `text-[${colors.status.discrepancy.zero.text}] bg-[${colors.status.discrepancy.zero.bg}] border-[${colors.status.discrepancy.zero.border}]`;
  },
  
  // Format number with sign
  formatDiscrepancy: (value: number) => {
    const sign = value > 0 ? '+' : '';
    return `${sign}${value}`;
  },
  
  // Responsive text clamp
  clamp: (min: string, max: string) => `clamp(${min}, 2vw + 1rem, ${max})`,
} as const;

// ============================================
// Export all tokens as a single design system object
// ============================================
export const designSystem = {
  colors,
  typography,
  spacing,
  radius,
  shadows,
  motion,
  zIndex,
  breakpoints,
  variants,
  utils,
} as const;

export type DesignSystem = typeof designSystem;