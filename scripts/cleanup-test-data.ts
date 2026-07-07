#!/usr/bin/env ts-node
/**
 * 測試資料清理腳本
 * 
 * 用途：清理 E2E 測試建立的測試資料
 * 
 * 使用方式：
 *   npx ts-node scripts/cleanup-test-data.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://epjyodyjdssgjqrzgtnc.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ 請設定 SUPABASE_SERVICE_ROLE_KEY 環境變數');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  console.log('🧹 開始清理測試資料...\n');
  
  try {
    // 1. 刪除測試用戶的所有清單
    const testEmail = 'test-e2e-user@example.com';
    const { data: users } = await supabase.auth.admin.listUsers();
    const testUser = users.users.find(u => u.email === testEmail);
    
    if (!testUser) {
      console.log('ℹ️ 找不到測試用戶，無需清理');
      return;
    }
    
    console.log(`找到測試用戶: ${testUser.id}`);
    
    // 刪除該用戶的所有清單
    const { error: deleteError } = await supabase
      .from('manifests')
      .delete()
      .eq('user_id', testUser.id);
    
    if (deleteError) {
      console.error('❌ 刪除清單失敗:', deleteError);
    } else {
      console.log('✅ 已刪除測試用戶的所有清單');
    }
    
    // 刪除測試用戶
    const { error: userDeleteError } = await supabase.auth.admin.deleteUser(testUser.id);
    if (userDeleteError) {
      console.error('❌ 刪除測試用戶失敗:', userDeleteError);
    } else {
      console.log('✅ 已刪除測試用戶');
    }
    
    console.log('\n🎉 測試資料清理完成！');
    
  } catch (error) {
    console.error('❌ 清理測試資料失敗:', error);
    process.exit(1);
  }
}

main();