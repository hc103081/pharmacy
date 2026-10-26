/**
 * UI 文字常量 - 避免 Turbopack 解析中文字符問題
 */

export const UI_TEXT = {
  searchHint: '輸入條碼 (8-14 位數字) 可精確搜尋',
  appTitle: '藥品查詢系統',
  roleLabels: {
    counter: '清點人員',
    pharmacist: '藥師',
    manager: '管理員',
  } as const,
  exportLabel: '匯出',
  settingsLabel: '設定',
  logoutLabel: '登出',
  offlineMode: '離線模式',
  userFallback: '使用者',
} as const;