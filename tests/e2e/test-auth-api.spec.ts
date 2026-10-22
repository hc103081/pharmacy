import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Test Auth API', () => {
  test('should login with test credentials and access /query without redirect', async ({ page }) => {
    // Call the test auth login API
    const loginResponse = await page.request.post(`${BASE_URL}/api/test-auth/login`, {
      data: {
        email: 'test-user@pharmacy.local',
        password: 'TestPassword123!'
      }
    });
    
    expect(loginResponse.ok()).toBeTruthy();
    const loginData = await loginResponse.json();
    expect(loginData.success).toBe(true);
    expect(loginData.user).toBeDefined();
    
    // Navigate to /query page
    await page.goto(`${BASE_URL}/query`);
    await page.waitForLoadState('networkidle');
    
    // Should NOT see "請先登入" (please login first)
    const loginText = page.locator('text=請先登入');
    await expect(loginText).not.toBeVisible({ timeout: 5000 });
    
    // Should see query page content (e.g., search input or drug list)
    // The exact content depends on the page, but it should not redirect to /login
    const currentUrl = page.url();
    expect(currentUrl).not.toContain('/login');
  });

  test('should logout and clear session', async ({ page }) => {
    // First login
    await page.request.post(`${BASE_URL}/api/test-auth/login`, {
      data: {
        email: 'test-user@pharmacy.local',
        password: 'TestPassword123!'
      }
    });
    
    // Then logout
    const logoutResponse = await page.request.post(`${BASE_URL}/api/test-auth/logout`);
    expect(logoutResponse.ok()).toBeTruthy();
    const logoutData = await logoutResponse.json();
    expect(logoutData.success).toBe(true);
    
    // Navigate to /query page - should redirect to /login
    await page.goto(`${BASE_URL}/query`);
    await page.waitForLoadState('networkidle');
    
    // Should see login page or redirect to /login
    const currentUrl = page.url();
    expect(currentUrl).toContain('/login');
  });

  test('should reject invalid credentials', async ({ page }) => {
    const loginResponse = await page.request.post(`${BASE_URL}/api/test-auth/login`, {
      data: {
        email: 'test-user@pharmacy.local',
        password: 'WrongPassword123!'
      }
    });
    
    expect(loginResponse.status()).toBe(401);
    const loginData = await loginResponse.json();
    expect(loginData.success).toBe(false);
    expect(loginData.error).toBeDefined();
  });

  test('should only be available in non-production environment', async ({ page }) => {
    // This test verifies the API is only available in development/test
    // In production, it should return 404 or 403
    // We can't easily test production here, but we can verify it works in dev
    const loginResponse = await page.request.post(`${BASE_URL}/api/test-auth/login`, {
      data: {
        email: 'test-user@pharmacy.local',
        password: 'TestPassword123!'
      }
    });
    
    // Should work in development
    expect(loginResponse.ok()).toBeTruthy();
  });
});