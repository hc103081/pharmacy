import { defineConfig, devices } from '@playwright/test';
import path from 'path';

/**
 * Playwright E2E 設定。
 * 此設定檔用於驗證重構後各頁面能正常載入與渲染，不依賴真實 Supabase 連線。
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium-authenticated',
      use: {
        ...devices['Desktop Chrome'],
        storageState: path.join(__dirname, 'tests', 'e2e', 'auth-state.json'),
      },
      dependencies: ['setup-auth'],
    },
    {
      name: 'setup-auth',
      testMatch: /.*\.setup\.ts/,
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
