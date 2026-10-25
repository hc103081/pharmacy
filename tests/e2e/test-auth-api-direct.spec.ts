import { test, expect } from '@playwright/test';

test('test auth API directly', async ({ page }) => {
  // 直接測試 API，不依賴認證
  const response = await page.request.post('/api/test-auth/login', {
    data: {
      email: 'test-user@pharmacy.local',
      password: 'TestPassword123!'
    }
  });
  
  console.log('Response status:', response.status());
  console.log('Response headers:', response.headers());
  
  if (!response.ok()) {
    const contentType = response.headers()['content-type'];
    console.log('Content type:', contentType);
    if (contentType?.includes('application/json')) {
      const errorData = await response.json();
      console.log('Error data:', errorData);
    } else {
      const errorText = await response.text();
      console.log('Error response (first 500 chars):', errorText.substring(0, 500));
    }
    throw new Error(`API 登入失敗: ${response.status()}`);
  }
  
  const data = await response.json();
  console.log('Success data:', data);
  
  // 檢查 cookies
  const cookies = await page.context().cookies();
  console.log('Cookies after login:', cookies);
  
  expect(data.success).toBe(true);
  expect(data.user).toBeDefined();
  expect(data.user.email).toBe('test-user@pharmacy.local');
});