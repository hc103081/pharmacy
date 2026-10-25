import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

// 測試用戶資料
const TEST_USER = {
  email: 'test-user@pharmacy.local',
  name: '測試使用者',
  id: 'test-user-id'
};

/**
 * Service Account 用戶管理
 * 用於建立和管理測試用戶
 */
export class ServiceAccountManager {
  private supabaseService: any;

  constructor() {
    // 從環境變數取得 Service Role Key
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Service Account 配置缺失：NEXT_PUBLIC_SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY');
    }

    // 使用 Service Role Key 建立客戶端（可以管理所有用戶）
    this.supabaseService = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }

  /**
   * 建立或更新測試用戶
   */
  async createTestUser(): Promise<{ user: any; password?: string }> {
    try {
      // 使用正確的 Service Account API 來管理用戶
      const { data: existingUsers, error: listError } = await this.supabaseService.auth.admin.listUsers();
      
      if (listError) {
        throw listError;
      }

      let user;
      
      // 檢查測試用戶是否已存在
      const existingUser = existingUsers?.users?.find((u: any) => u.email === TEST_USER.email);
      
      if (existingUser) {
        // 用戶已存在，更新資料
        user = existingUser;
        console.log('測試用戶已存在，更新資料:', user.id);
      } else {
        // 建立新用戶
        const { data: newUser, error: createError } = await this.supabaseService.auth.admin.createUser({
          email: TEST_USER.email,
          password: 'TestPassword123!', // 測試密碼
          email_confirm: true,
          user_metadata: {
            name: TEST_USER.name,
            role: 'test_user'
          }
        });

        if (createError) {
          throw createError;
        }

        user = newUser.user;
        console.log('測試用戶建立成功:', user.id);
      }

      return { user, password: 'TestPassword123!' };
    } catch (error) {
      console.error('建立測試用戶失敗:', error);
      throw error;
    }
  }

  /**
   * 產生 JWT 令牌（Service Role 模式）
   */
  async generateServiceToken(): Promise<string> {
    try {
      // 使用 Service Role Key 直接產生 JWT
      // 注意：這裡我們需要模擬一個 JWT 令牌，因為 Service Account 的 JWT 生成需要特定的 API
      const jwtPayload = {
        sub: TEST_USER.id,
        email: TEST_USER.email,
        role: 'authenticated',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600, // 1小時後過期
        iss: process.env.NEXT_PUBLIC_SUPABASE_URL!,
        aud: 'authenticated'
      };

      // 在實際應用中，這裡應該使用 Supabase 的 JWT 生成 API
      // 但為了測試目的，我們生成一個模擬的 JWT
      const mockToken = Buffer.from(JSON.stringify(jwtPayload)).toString('base64') + '.mock_signature';
      
      console.log('模擬 JWT 令牌已生成');
      return mockToken;
    } catch (error) {
      console.error('產生 JWT 令牌失敗:', error);
      throw error;
    }
  }

  /**
   * 產生 Playwright 認證狀態
   */
  async generateAuthState(): Promise<any> {
    try {
      const token = await this.generateServiceToken();
      
      // 模擬 Supabase 認證狀態
      const authState = {
        accessToken: token,
        refreshToken: 'mock-refresh-token',
        expiresAt: Date.now() + 3600000, // 1小時後過期
        user: {
          id: TEST_USER.id,
          email: TEST_USER.email,
          email_confirmed_at: new Date().toISOString(),
          phone_confirmed_at: null,
          last_sign_in_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          role: 'authenticated',
          app_metadata: {
            provider: 'service_account',
            providers: ['service_account']
          },
          user_metadata: {
            name: TEST_USER.name,
            role: 'test_user'
          }
        },
        tokenType: 'bearer'
      };

      return authState;
    } catch (error) {
      console.error('生成認證狀態失敗:', error);
      throw error;
    }
  }
}

/**
 * 產生認證狀態檔案（供 Playwright 使用）
 */
export async function generateAuthStateFile(): Promise<void> {
  const manager = new ServiceAccountManager();
  
  try {
    console.log('開始產生測試用戶認證狀態...');
    
    // 確保測試用戶存在
    await manager.createTestUser();
    
    // 產生認證狀態
    const authState = await manager.generateAuthState();
    
    // 寫入檔案
    const fs = require('fs');
    const path = require('path');
    
    const authFilePath = path.join(process.cwd(), 'tests', 'e2e', 'auth-state.json');
    fs.writeFileSync(authFilePath, JSON.stringify(authState, null, 2));
    
    console.log(`認證狀態檔案已建立: ${authFilePath}`);
    console.log(`測試用戶: ${TEST_USER.email}`);
    console.log(`測試密碼: TestPassword123!`);
    
  } catch (error) {
    console.error('產生認證狀態檔案失敗:', error);
    throw error;
  }
}

// 導出測試用戶資料
export { TEST_USER };