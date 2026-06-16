# 認證系統修復與優化 Spec

## Why
登入後登出按鈕消失，使用者無法登出。AuthProvider 僅仰賴 `onAuthStateChange` 初次事件來設定 user 狀態，若事件未正確觸發則 `loading` 永遠為 `true`，導致 UserMenu 整個不渲染。同時登入/登出的使用者體驗與視覺設計也有顯著優化空間。

## What Changes
- 修復 AuthProvider：加入 `getSession()` 主動取得初始 session，確保 `loading` 正確過渡
- 將 `createClient()` 提升為模組層級 singleton，避免每次 render 重複建立
- 重構 UserMenu 為下拉選單式：點擊右上角頭像/Email 展開，含登出選項
- 新增登出確認對話框元件，避免誤觸中斷清點流程
- 登入頁加入倒數重發 Magic Link 功能（60 秒冷卻）
- UI 視覺優化：科技風發光效果、過渡動畫、按鈕互動回饋

## Impact
- Affected code:
  - `src/components/AuthProvider.tsx` — 核心修復
  - `src/components/UserMenu.tsx` — 完全重構
  - `src/app/login/page.tsx` — 加入重發功能
  - `src/app/globals.css` — 新增動畫 class（如需要）
  - `src/app/layout.tsx` — 可能微調 UserMenu 掛載位置

## ADDED Requirements

### Requirement: AuthProvider 初始 Session 主動取得
系統 SHALL 在 AuthProvider 初始化時呼叫 `supabase.auth.getSession()` 主動取得現有 session，而非僅依賴 `onAuthStateChange` 事件。

#### Scenario: Magic Link 回調後頁面載入
- **WHEN** 使用者透過 Magic Link 回調登入後被重導向至首頁
- **THEN** AuthProvider 透過 `getSession()` 立即取得 session 並設定 `user`
- **AND** `loading` 狀態正確過渡為 `false`
- **AND** UserMenu 正確渲染顯示使用者資訊

#### Scenario: 頁面重新整理時保持登入狀態
- **WHEN** 已登入使用者重新整理頁面
- **THEN** AuthProvider 透過 `getSession()` 恢復 session
- **AND** UserMenu 立即顯示，無閃爍或延遲

### Requirement: 下拉選單式 UserMenu
系統 SHALL 提供下拉選單式使用者選單，點擊右上角使用者圖示區域展開/收起。

#### Scenario: 點擊展開選單
- **WHEN** 使用者點擊右上角使用者圖示/Email 區域
- **THEN** 下拉選單平滑展開，顯示使用者 Email 與登出選項
- **AND** 選單具備科技風視覺效果（毛玻璃、發光邊框）

#### Scenario: 點擊外部關閉
- **WHEN** 下拉選單展開時，使用者點擊選單外部區域
- **THEN** 選單自動收起

### Requirement: 登出確認對話框
系統 SHALL 在使用者點擊登出時顯示確認對話框。

#### Scenario: 確認登出
- **WHEN** 使用者在下拉選單點擊「登出」
- **THEN** 顯示確認對話框，提示「確定要登出嗎？登出後將返回登入頁面。」
- **AND** 提供「取消」與「確認登出」兩個選項

#### Scenario: 取消登出
- **WHEN** 使用者在確認對話框點擊「取消」
- **THEN** 對話框關閉，使用者維持登入狀態

### Requirement: Magic Link 倒數重發
系統 SHALL 在 Magic Link 發送後提供 60 秒倒數重發功能。

#### Scenario: 發送後顯示倒數
- **WHEN** Magic Link 發送成功，頁面顯示「請檢查你的信箱」
- **THEN** 同時顯示 60 秒倒數計時器
- **AND** 倒數期間重發按鈕為禁用狀態

#### Scenario: 倒數結束可重發
- **WHEN** 60 秒倒數結束
- **THEN** 重發按鈕啟用，使用者可重新發送 Magic Link
- **AND** 點擊重發後重新開始 60 秒倒數

### Requirement: 科技風 UI 視覺優化
系統 SHALL 對認證相關元件套用科技風視覺效果。

#### Scenario: 登出按鈕互動效果
- **WHEN** 使用者 hover 登出按鈕
- **THEN** 按鈕顯示紅色發光效果 `shadow-[0_0_10px_rgba(255,75,92,0.4)]`

#### Scenario: 下拉選單過渡動畫
- **WHEN** 下拉選單展開/收起
- **THEN** 使用 `animate-in fade-in slide-in-from-top` 平滑過渡

## MODIFIED Requirements

### Requirement: Supabase Client 建立方式
原本 `AuthProvider` 中每次 render 呼叫 `createClient()` 建立新實例。
修改為：`createClient()` 已由 `@supabase/ssr` 的 `createBrowserClient` 內部實作 singleton 快取，但 AuthProvider 仍應在元件層級使用 `useMemo` 或提升至模組層級以確保參照穩定。

## REMOVED Requirements

（無移除項目）
