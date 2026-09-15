#!/usr/bin/env ts-node
/**
 * 照片遷移腳本：將 drug_items.photo_url 從 Supabase URL 遷移為 B2 key
 * 
 * 流程：
 * 1. 查詢所有 photo_url 為 Supabase URL 格式的 drug_items
 * 2. 從 Supabase Storage 下載檔案
 * 3. 上傳到 B2 (保持相同的路徑結構)
 * 4. 更新資料庫 photo_url 為 B2 key，並設定 storage_provider = 'b2'
 * 
 * 使用方式：
 *   npx tsx scripts/migrate-photos-to-b2.ts
 * 
 * 環境變數需求：
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   B2_KEY_ID
 *   B2_APP_KEY
 *   B2_BUCKET
 *   B2_REGION
 */

import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.resolve(__dirname, '../.env.local') });
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

// 環境變數
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const B2_KEY_ID = process.env.B2_KEY_ID || '';
const B2_APP_KEY = process.env.B2_APP_KEY || '';
const B2_BUCKET = process.env.B2_BUCKET || '';
const B2_REGION = process.env.B2_REGION || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ 請設定 NEXT_PUBLIC_SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!B2_KEY_ID || !B2_APP_KEY || !B2_BUCKET || !B2_REGION) {
  console.error('❌ 請設定 B2 環境變數: B2_KEY_ID, B2_APP_KEY, B2_BUCKET, B2_REGION');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// B2 S3 Client
const b2Client = new S3Client({
  region: B2_REGION,
  endpoint: `https://s3.${B2_REGION}.backblazeb2.com`,
  credentials: {
    accessKeyId: B2_KEY_ID,
    secretAccessKey: B2_APP_KEY,
  },
});

// 從 Supabase URL 解析出 storage path
function extractSupabaseStoragePath(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    // 格式: /storage/v1/object/public/drug-photos/photos/...
    const prefix = '/storage/v1/object/public/drug-photos/';
    if (pathname.startsWith(prefix)) {
      return pathname.slice(prefix.length);
    }
    return null;
  } catch {
    return null;
  }
}

// 產生 B2 key (保持相同結構)
function getB2Key(storagePath: string): string {
  return storagePath; // 直接使用相同路徑結構
}

// 批次處理配置
const BATCH_SIZE = 50;
const MAX_CONCURRENT_DOWNLOADS = 5;

async function migratePhotos() {
  console.log('🚀 開始遷移照片到 B2...\n');

  // 1. 查詢所有需要遷移的項目 (Supabase URL 格式)
  let allItems: Array<{ id: string; photo_url: string }> = [];
  let offset = 0;
  const LIMIT = 1000;

  console.log('📋 查詢需遷移的資料...');
  while (true) {
    const { data, error } = await supabase
      .from('drug_items')
      .select('id, photo_url')
      .like('photo_url', 'https://%supabase.co%')
      .range(offset, offset + LIMIT - 1);

    if (error) {
      console.error('❌ 查詢失敗:', error);
      process.exit(1);
    }

    if (!data || data.length === 0) break;

    allItems.push(...data);
    offset += LIMIT;

    if (data.length < LIMIT) break;
  }

  console.log(`📦 找到 ${allItems.length} 張需遷移的照片\n`);

  if (allItems.length === 0) {
    console.log('✅ 沒有需要遷移的資料');
    return;
  }

  // 2. 遷移處理
  let successCount = 0;
  let failCount = 0;
  const failedItems: Array<{ id: string; error: string }> = [];

  for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
    const batch = allItems.slice(i, i + BATCH_SIZE);
    console.log(`\n📦 處理批次 ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allItems.length / BATCH_SIZE)} (${batch.length} 項)`);

    // 並行下載 + 上傳
    const results = await Promise.all(
      batch.map(async (item, idx) => {
        const globalIdx = i + idx + 1;
        try {
          const storagePath = extractSupabaseStoragePath(item.photo_url);
          if (!storagePath) {
            throw new Error('無法解析 Supabase 路徑');
          }

          const b2Key = getB2Key(storagePath);

          // 下載檔案
          const { data: fileData, error: downloadError } = await supabase.storage
            .from('drug-photos')
            .download(storagePath);

          if (downloadError || !fileData) {
            throw new Error(`下載失敗: ${downloadError?.message}`);
          }

          const arrayBuffer = await fileData.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          // 上傳到 B2
          await b2Client.send(new PutObjectCommand({
            Bucket: B2_BUCKET,
            Key: b2Key,
            Body: new Uint8Array(buffer),
            ContentType: 'image/jpeg',
          }));

          // 更新資料庫
          const { error: updateError } = await supabase
            .from('drug_items')
            .update({
              photo_url: b2Key,
              storage_provider: 'b2',
            })
            .eq('id', item.id);

          if (updateError) {
            throw new Error(`資料庫更新失敗: ${updateError.message}`);
          }

          console.log(`  ✅ [${globalIdx}/${allItems.length}] ${item.id} -> ${b2Key}`);
          return { success: true };
        } catch (err: any) {
          console.error(`  ❌ [${globalIdx}/${allItems.length}] ${item.id}: ${err.message}`);
          return { success: false, error: err.message };
        }
      })
    );

    // 統計結果
    for (const result of results) {
      if (result.success) successCount++;
      else {
        failCount++;
        failedItems.push({ id: '', error: result.error || 'Unknown error' });
      }
    }

    // 進度顯示
    console.log(`   進度: ${successCount}/${allItems.length} 成功, ${failCount} 失敗`);
  }

  // 3. 結果總結
  console.log('\n📊 遷移完成統計:');
  console.log(`   總計: ${allItems.length}`);
  console.log(`   ✅ 成功: ${successCount}`);
  console.log(`   ❌ 失敗: ${failCount}`);

  if (failedItems.length > 0) {
    console.log('\n❌ 失敗項目:');
    failedItems.forEach(f => console.log(`   - ${f.error}`));
  }

  // 4. 驗證遷移結果
  console.log('\n🔍 驗證遷移結果...');
  const { count } = await supabase
    .from('drug_items')
    .select('*', { count: 'exact', head: true })
    .eq('storage_provider', 'b2');

  console.log(`   storage_provider = 'b2' 的項目數: ${count}`);

  const { count: supabaseCount } = await supabase
    .from('drug_items')
    .select('*', { count: 'exact', head: true })
    .like('photo_url', 'https://%supabase.co%');

  console.log(`   仍為 Supabase URL 的項目數: ${supabaseCount}`);

  console.log('\n🎉 遷移完成！');
}

// 執行
migratePhotos().catch(err => {
  console.error('❌ 遷移腳本執行失敗:', err);
  process.exit(1);
});