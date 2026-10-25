#!/usr/bin/env node

/**
 * 測試認證設置腳本
 * 使用 Supabase Admin API 生成真實的認證狀態
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';
import 'dotenv/config';

// Playwright Auth State 類型定義
interface AuthState {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: string;
  }>;
  origins: Array<{
    origin: string;
    localStorage: Array<{
      name: string;
      value: string;
    }>;
  }>;
}

// 手動載入 .env.local
const envPath = join(process.cwd(), '.env.local');
try {
  const envContent = readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...rest] = trimmed.split('=');
      if (key && rest.length > 0) {
        process.env[key] = rest.join('=');
      }
    }
  });
} catch (error) {
  console.error('無法載入 .env.local 檔案:', (error as Error).message);
}

const TEST_USER = {
  email: 'test-user@pharmacy.local',
  password: 'TestPassword123!'
};

async function main() {
  try {
    console.log('🚀 開始設置測試認證（Supabase Admin API）...');
    
    // 檢查環境變數
    console.log('環境變數檢查:');
    console.log('NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅' : '❌');
    console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅' : '❌');
    
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('❌ 環境變數缺失！');
      console.log('請確保 .env.local 中包含：');
      console.log('- NEXT_PUBLIC_SUPABASE_URL');
      console.log('- SUPABASE_SERVICE_ROLE_KEY');
      process.exit(1);
    }
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    
    // 使用 Service Role Key 建立客戶端
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    
    // 1. 確保測試用戶存在
    const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) throw listError;
    
    let user = existingUsers?.users?.find(u => u.email === TEST_USER.email);
    
    if (!user) {
      // 建立新用戶
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: TEST_USER.email,
        password: TEST_USER.password,
        email_confirm: true,
        user_metadata: {
          name: '測試使用者',
          role: 'test_user'
        }
      });
      if (createError) throw createError;
      user = newUser.user;
      console.log('測試用戶建立成功:', user.id);
    } else {
      console.log('測試用戶已存在:', user.id);
    }
    
    // 2. 使用 Admin API 生成真實的會話
    const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: TEST_USER.email,
      password: TEST_USER.password
    });
    
    if (signInError) throw signInError;
    
    const session = signInData.session;
    if (!session) {
      throw new Error('無法生成會話');
    }
    
    console.log('真實會話已生成');
    
    // 3. 建立 Playwright 認證狀態格式
    const projectRef = supabaseUrl.split('//')[1].split('.')[0];
    const storageKey = `sb-${projectRef}-auth-token`;
    
    // 計算有效的 expires 時間戳（秒級別，不是毫秒級別）
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const expiresTimestamp = session.expires_at || currentTimestamp + 3600; // 1 小時後
    
    const authState: AuthState = {
      cookies: [],
      origins: [
        {
          origin: supabaseUrl,
          localStorage: [
            {
              name: storageKey,
              value: JSON.stringify({
                access_token: session.access_token,
                refresh_token: session.refresh_token,
                expires_at: session.expires_at,
                expires_in: session.expires_in,
                token_type: session.token_type,
                user: session.user
              })
            }
          ]
        }
      ]
    };
    
    // 正確的 cookie 格式（使用秒級別的 Unix 時間戳）
    const cookieDomain = new URL(supabaseUrl).hostname;
    authState.cookies = [
      {
        name: storageKey,
        value: session.access_token,
        domain: cookieDomain,
        path: '/',
        expires: Math.floor(expiresTimestamp / 1000), // 轉換為秒級別
        httpOnly: false,
        secure: true,
        sameSite: 'Lax'
      }
    ];
    
    // 4. 寫入認證狀態檔案
    const fs = require('fs');
    const authFilePath = join(process.cwd(), 'tests', 'e2e', 'auth-state.json');
    fs.writeFileSync(authFilePath, JSON.stringify(authState, null, 2));
    
    console.log('✅ 測試認證設置完成（真實 Supabase 會話）');
    console.log('');
    console.log('📋 測試資料：');
    console.log('Email: test-user@pharmacy.local');
    console.log('密碼: TestPassword123!');
    console.log('');
    console.log('🎯 現在可以執行 E2E 測試：');
    console.log('npm run test:e2e -- --project=chromium-authenticated');
    
  } catch (error) {
    console.error('❌ 設置失敗:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();