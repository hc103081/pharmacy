import { S3Client, ListObjectVersionsCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.resolve(__dirname, '../.env.local') });

const B2_KEY_ID = process.env.B2_KEY_ID!;
const B2_APP_KEY = process.env.B2_APP_KEY!;
const B2_BUCKET = process.env.B2_BUCKET!;
const B2_REGION = process.env.B2_REGION!;

const client = new S3Client({
  region: B2_REGION,
  endpoint: `https://s3.${B2_REGION}.backblazeb2.com`,
  credentials: {
    accessKeyId: B2_KEY_ID,
    secretAccessKey: B2_APP_KEY,
  },
});

async function cleanupDuplicates() {
  console.log('🔍 掃描 B2 所有檔案版本...\n');
  
  let totalVersions = 0;
  let deletedCount = 0;
  let keyCount = 0;
  
  // 分頁列出所有版本
  let nextKeyMarker: string | undefined;
  let nextVersionIdMarker: string | undefined;
  
  do {
    const cmd = new ListObjectVersionsCommand({
      Bucket: B2_BUCKET,
      KeyMarker: nextKeyMarker,
      VersionIdMarker: nextVersionIdMarker,
      MaxKeys: 1000,
    });
    
    const res = await client.send(cmd);
    totalVersions += (res.Versions?.length || 0) + (res.DeleteMarkers?.length || 0);
    
    // 按 key 分組版本
    const versionsByKey = new Map<string, Array<{VersionId: string; IsLatest: boolean; LastModified: Date}>>();
    
    for (const v of res.Versions || []) {
      if (!v.Key || !v.VersionId) continue;
      const arr = versionsByKey.get(v.Key) || [];
      arr.push({
        VersionId: v.VersionId,
        IsLatest: v.IsLatest === true,
        LastModified: v.LastModified || new Date(0),
      });
      versionsByKey.set(v.Key, arr);
    }
    
    // 刪除非最新版本
    for (const [key, versions] of versionsByKey) {
      if (versions.length > 1) {
        keyCount++;
        // 保留最新版 (IsLatest=true)，刪除其他
        const toDelete = versions.filter(v => !v.IsLatest);
        for (const v of toDelete) {
          try {
            await client.send(new DeleteObjectCommand({
              Bucket: B2_BUCKET,
              Key: key,
              VersionId: v.VersionId,
            }));
            deletedCount++;
            console.log(`  🗑️ 刪除舊版本: ${key} (v${v.VersionId.slice(0,8)}...)`);
          } catch (err) {
            console.error(`  ❌ 刪除失敗: ${key}`, err);
          }
        }
      }
    }
    
    nextKeyMarker = res.NextKeyMarker;
    nextVersionIdMarker = res.NextVersionIdMarker;
    
    console.log(`  進度: 已掃描 ${totalVersions} 版本, 處理 ${keyCount} 個有重複的 key, 刪除 ${deletedCount} 個舊版本`);
    
  } while (nextKeyMarker || nextVersionIdMarker);
  
  console.log('\n📊 清理完成:');
  console.log(`   總版本數: ${totalVersions}`);
  console.log(`   有重複的 key: ${keyCount}`);
  console.log(`   刪除舊版本: ${deletedCount}`);
  console.log(`   剩餘唯一檔案: ${totalVersions - deletedCount}`);
}

cleanupDuplicates().catch(console.error);