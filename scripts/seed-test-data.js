#!/usr/bin/env node
/**
 * 測試資料建立腳本
 * 
 * 用途：為 E2E 測試建立各種場景所需的測試清單
 * - 已封存 > 30 天的清單（用於測試 gdrive-migrate）
 * - 已封存且 cloud_backup=true 的清單（用於測試 gdrive-pull 還原）
 * - 大量清單模擬儲存用量警告
 * 
 * 使用方式：
 *   node scripts/seed-test-data.js
 */

const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('crypto');

// 從環境變數讀取
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://epjyodyjdssgjqrzgtnc.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// 需要設定 SUPABASE_SERVICE_ROLE_KEY 環境變數
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ 請設定 SUPABASE_SERVICE_ROLE_KEY 環境變數');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function getOrCreateTestUser() {
  const testEmail = 'test-e2e-user@example.com';
  
  // 嘗試查找現有用戶
  const { data: users } = await supabase.auth.admin.listUsers();
  const existingUser = users.users.find(u => u.email === testEmail);
  
  if (existingUser) {
    console.log(`✅ 找到現有測試用戶: ${existingUser.id}`);
    return existingUser.id;
  }
  
  // 建立新用戶
  const { data, error } = await supabase.auth.admin.createUser({
    email: testEmail,
    password: 'test-password-123',
    email_confirm: true,
  });
  
  if (error) {
    console.error('❌ 建立測試用戶失敗:', error);
    throw error;
  }
  
  console.log(`✅ 建立測試用戶: ${data.user.id}`);
  return data.user.id;
}

async function createManifest(userId, manifest) {
  const { data, error } = await supabase
    .from('manifests')
    .insert({
      id: randomUUID(),
      name: manifest.name,
      status: manifest.status,
      cloud_backup: manifest.cloud_backup ?? false,
      gdrive_file_id: manifest.gdrive_file_id ?? null,
      archived_at: manifest.archived_at ?? (manifest.status === 'archived' ? new Date().toISOString() : null),
      storage_size_bytes: manifest.storage_size_bytes ?? 0,
      total_items: manifest.total_items,
      user_id: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();
  
  if (error) {
    console.error(`❌ 建立清單失敗 (${manifest.name}):`, error);
    return null;
  }
  
  console.log(`✅ 建立清單: ${manifest.name} (${data.id})`);
  return data;
}

async function main() {
  console.log('🌱 開始建立測試資料...\n');
  
  try {
    const userId = await getOrCreateTestUser();
    
    const thirtyDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    
    // 1. 已封存 > 30 天，未雲端備份（用於測試 gdrive-migrate）
    await createManifest(userId, {
      name: '測試清單 - 已封存 31 天 (本地)',
      status: 'archived',
      cloud_backup: false,
      archived_at: thirtyDaysAgo,
      storage_size_bytes: 50 * 1024 * 1024, // 50 MB
      total_items: 44,
      user_id: userId,
    });
    
    // 2. 已封存 > 30 天，未雲端備份（另一個用於併發測試）
    await createManifest(userId, {
      name: '測試清單 - 已封存 32 天 (本地) #2',
      status: 'archived',
      cloud_backup: false,
      archived_at: new Date(Date.now() - 32 * 24 * 60 * 60 * 1000).toISOString(),
      storage_size_bytes: 30 * 1024 * 1024, // 30 MB
      total_items: 44,
      user_id: userId,
    });
    
    // 3. 已封存且已雲端備份（用於測試 gdrive-pull 還原）
    await createManifest(userId, {
      name: '測試清單 - 已封存 15 天 (雲端)',
      status: 'archived',
      cloud_backup: true,
      gdrive_file_id: 'test-gdrive-file-id-123',
      archived_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
      storage_size_bytes: 25 * 1024 * 1024, // 25 MB
      total_items: 44,
      user_id: userId,
    });
    
    // 4. 進行中清單（用於測試 active tab）
    await createManifest(userId, {
      name: '測試清單 - 進行中',
      status: 'active',
      storage_size_bytes: 10 * 1024 * 1024, // 10 MB
      total_items: 44,
      user_id: userId,
    });
    
    // 5. 大型清單模擬儲存用量 (800MB+)
    await createManifest(userId, {
      name: '大型測試清單 - 850MB',
      status: 'active',
      storage_size_bytes: 850 * 1024 * 1024, // 850 MB - 觸發 warning
      total_items: 44,
      user_id: userId,
    });
    
    // 6. 大型清單模擬儲存用量 (950MB+)
    await createManifest(userId, {
      name: '大型測試清單 - 980MB',
      status: 'active',
      storage_size_bytes: 980 * 1024 * 1024, // 980 MB - 觸發 critical
      total_items: 44,
      user_id: userId,
    });
    
    console.log('\n🎉 測試資料建立完成！');
    console.log('\n📋 建立的清單：');
    console.log('  1. 已封存 31 天 (本地) - 50MB - 可測試 gdrive-migrate');
    console.log('  2. 已封存 32 天 (本地) - 30MB - 可測試併發移轉');
    console.log('  3. 已封存 15 天 (雲端) - 25MB - 可測試 gdrive-pull 還原');
    console.log('  4. 進行中清單 - 10MB - 一般測試');
    console.log('  5. 850MB 清單 - 觸發儲存警告 (warning)');
    console.log('  6. 980MB 清單 - 觸發儲存警告 (critical)');
    
  } catch (error) {
    console.error('❌ 建立測試資料失敗:', error);
    process.exit(1);
  }
}

main();