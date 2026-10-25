import { test as base, type BrowserContext } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * 從 auth-state.json 讀取 cookies 並轉換為 Cookie 標頭字符串
 */
export function getAuthCookieHeader(): string {
  const authStatePath = path.join(__dirname, 'auth-state.json');
  if (!fs.existsSync(authStatePath)) {
    return '';
  }
  
  const authState = JSON.parse(fs.readFileSync(authStatePath, 'utf-8'));
  const cookies = authState.cookies || [];
  
  // 過濾 localhost 的 cookies 並構建 Cookie 標頭
  const cookieStrings = cookies
    .filter((c: any) => c.domain === 'localhost' || c.domain === '.localhost')
    .map((c: any) => `${c.name}=${c.value}`)
    .join('; ');
  
  return cookieStrings;
}

/**
 * 為 context 設置認證 cookies（用於 SSR）
 */
export async function setupAuthForContext(context: BrowserContext) {
  const cookieHeader = getAuthCookieHeader();
  if (cookieHeader) {
    await context.setExtraHTTPHeaders({
      'Cookie': cookieHeader
    });
  }
  return cookieHeader;
}

export const test = base.extend<{
  // 可以在這裡添加自定義 fixture
}>({});

export { expect } from '@playwright/test';