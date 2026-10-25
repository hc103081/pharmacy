#!/usr/bin/env node

/**
 * 測試認證設置腳本
 * 用於建立測試用戶和生成 Playwright 認證狀態
 */

const { readFileSync } = require('fs');
const { join } = require('path');
const { generateAuthStateFile } = require('./dist/lib/auth/service-account.js');

// 手動載入 .env.local
const envPath = join(process.cwd(), '.env.local');
if (process.env.NODE_ENV !== 'production') {
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
    console.error('無法載入 .env.local 檔案:', error.message);
    process.exit(1);
  }
}

async function main() {
  try {
    console.log('🚀 開始設置測試認證...');
    
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

    // 生成認證狀態檔案
    await generateAuthStateFile();
    
    console.log('✅ 測試認證設置完成！');
    console.log('');
    console.log('📋 測試資料：');
    console.log('Email: test-user@pharmacy.local');
    console.log('密碼: TestPassword123!');
    console.log('');
    console.log('🎯 現在可以執行 E2E 測試：');
    console.log('npm run test:e2e -- --project=chromium-authenticated');
    
  } catch (error) {
    console.error('❌ 設置失敗:', error.message);
    process.exit(1);
  }
}

main();