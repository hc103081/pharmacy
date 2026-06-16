# Tasks

- [x] Task 1: 修復 AuthProvider 核心邏輯
  - [x] 1.1: 在 AuthProvider useEffect 中加入 `getSession()` 主動取得初始 session
  - [x] 1.2: 確保 `loading` 在 getSession 回傳後正確設為 `false`
  - [x] 1.3: 確保 `onAuthStateChange` 仍持續監聽後續狀態變化

- [x] Task 2+3+5: 重構 UserMenu 下拉選單 + 登出確認對話框 + UI 視覺優化
  - [x] 2.1: 建立右上角使用者圖示/Email 觸發區域
  - [x] 2.2: 實作下拉選單展開/收起邏輯（useState + click outside）
  - [x] 2.3: 套用科技風視覺樣式（毛玻璃背景、發光邊框、過渡動畫）
  - [x] 2.4: 移除舊的橫條式 UserMenu 佈局
  - [x] 3.1: 建立 LogoutConfirmDialog 元件
  - [x] 3.2: 對話框含「取消」與「確認登出」按鈕
  - [x] 3.3: 點擊確認登出執行 `signOut()`，點擊取消關閉對話框
  - [x] 3.4: 套用科技風對話框樣式（與 JumpDialog 風格一致）
  - [x] 5.1: 登出按鈕 hover 紅色發光效果
  - [x] 5.2: 下拉選單展開/收起過渡動畫
  - [x] 5.3: 登入頁載入過渡動畫優化（如需額外 CSS class）

- [x] Task 4: 登入頁倒數重發功能
  - [x] 4.1: 在 `?sent=true` 狀態下加入 60 秒倒數計時器
  - [x] 4.2: 倒數期間重發按鈕禁用，倒數結束後啟用
  - [x] 4.3: 點擊重發重新呼叫 login Server Action 並重置倒數
  - [x] 4.4: 支援 Enter 鍵送出表單（確認現有 formAction 行為）

# Task Dependencies
- Task 2 depends on Task 1（UserMenu 重構需先確保 AuthProvider 正確回傳 user）
- Task 3 depends on Task 2（確認對話框嵌入在 UserMenu 下拉選單中）
- Task 4 獨立，可與 Task 1-3 平行進行
- Task 5 可與 Task 2-3 合併實作