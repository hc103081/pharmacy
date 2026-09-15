'use server';

import { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  ListObjectVersionsCommand,
  HeadObjectCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Backblaze B2 S3-compatible client wrapper
 * Bucket 必須設為 Private，透過 Presigned URL 進行上傳/下載/刪除
 */

// 環境變數驗證
const requiredEnv = ['B2_KEY_ID', 'B2_APP_KEY', 'B2_BUCKET', 'B2_REGION'];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required env: ${key}`);
  }
}

const B2_REGION = process.env.B2_REGION!;
const B2_BUCKET = process.env.B2_BUCKET!;

// B2 S3 Endpoint 格式
const B2_ENDPOINT = `https://s3.${B2_REGION}.backblazeb2.com`;

// 單例 Client
let b2Client: S3Client | null = null;

function getB2Client(): S3Client {
  if (!b2Client) {
    b2Client = new S3Client({
      region: B2_REGION,
      endpoint: B2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.B2_KEY_ID!,
        secretAccessKey: process.env.B2_APP_KEY!,
      },
      // B2 需要 path-style addressing
      forcePathStyle: true,
    });
  }
  return b2Client;
}

/**
 * 產生上傳用 Presigned PUT URL
 * @param key 儲存路徑 (如 photos/2026/01/15/manifestId/1/barcode_123.jpg)
 * @param contentType MIME 類型
 * @param expiresIn 過期秒數 (預設 1 小時)
 */
export async function createPresignedUploadUrl(
  key: string,
  contentType: string = 'image/jpeg',
  expiresIn: number = 3600
): Promise<{ uploadUrl: string; key: string }> {
  const client = getB2Client();
  const command = new PutObjectCommand({
    Bucket: B2_BUCKET,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn });
  return { uploadUrl, key };
}

/**
 * 產生下載/預覽用 Presigned GET URL
 * @param key 儲存路徑
 * @param expiresIn 過期秒數 (預設 1 小時)
 * @param responseContentDisposition 可選：inline (預覽) 或 attachment (下載)
 */
export async function createPresignedViewUrl(
  key: string,
  expiresIn: number = 3600,
  responseContentDisposition?: 'inline' | 'attachment'
): Promise<string> {
  const client = getB2Client();
  const command = new GetObjectCommand({
    Bucket: B2_BUCKET,
    Key: key,
    ...(responseContentDisposition && { ResponseContentDisposition: responseContentDisposition }),
  });

  return getSignedUrl(client, command, { expiresIn });
}

/**
 * 刪除檔案
 */
export async function deleteB2Object(key: string): Promise<void> {
  const client = getB2Client();
  const command = new DeleteObjectCommand({
    Bucket: B2_BUCKET,
    Key: key,
  });
  await client.send(command);
}

/**
 * 批次刪除檔案 (包含所有版本)
 * B2 預設啟用版本控制，需列出所有版本並逐一刪除
 */
export async function deleteB2Objects(keys: string[]): Promise<void> {
  const client = getB2Client();
  
  for (const key of keys) {
    try {
      // 1. 列出該 key 的所有版本
      const listVersionsCmd = new ListObjectVersionsCommand({
        Bucket: B2_BUCKET,
        Prefix: key,
      });
      const versionsResponse = await client.send(listVersionsCmd);
      
      const allVersions = [
        ...(versionsResponse.Versions || []),
        ...(versionsResponse.DeleteMarkers || []),
      ].filter(v => v.Key === key && v.VersionId);
      
      // 2. 逐一刪除每個版本 (需指定 VersionId)
      for (const version of allVersions) {
        const deleteCmd = new DeleteObjectCommand({
          Bucket: B2_BUCKET,
          Key: key,
          VersionId: version.VersionId,
        });
        await client.send(deleteCmd);
      }
      
      console.log(`[deleteB2Objects] Deleted ${allVersions.length} version(s) for ${key}`);
    } catch (err) {
      console.error(`[deleteB2Objects] Failed to delete ${key}:`, err);
      // 不拋出錯誤，繼續處理下一個
    }
  }
}

/**
 * 列舉檔案 (用於清理舊照片)
 * @param prefix 路徑前綴
 * @param maxKeys 最大返回數量
 */
export async function listB2Objects(
  prefix: string = '',
  maxKeys: number = 1000
): Promise<Array<{ key: string; size: number; lastModified: Date }>> {
  const client = getB2Client();
  const command = new ListObjectsV2Command({
    Bucket: B2_BUCKET,
    Prefix: prefix,
    MaxKeys: maxKeys,
  });

  const response = await client.send(command);
  return (response.Contents || []).map(obj => ({
    key: obj.Key!,
    size: obj.Size || 0,
    lastModified: obj.LastModified || new Date(),
  }));
}

/**
 * 檢查檔案是否存在
 */
export async function checkB2ObjectExists(key: string): Promise<boolean> {
  const client = getB2Client();
  const command = new HeadObjectCommand({
    Bucket: B2_BUCKET,
    Key: key,
  });
  try {
    await client.send(command);
    return true;
  } catch {
    return false;
  }
}

/**
 * 產生標準化的照片儲存路徑
 * (非 async，但需在 "use server" 檔案中導出，用 wrapper 包裝)
 */
export async function getPhotoKey(
  manifestId: string,
  pageNumber: number,
  barcode: string,
  fileExt: string = 'jpg'
): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const timestamp = Date.now();
  const safeBarcode = barcode.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `photos/${year}/${month}/${day}/${manifestId}/${pageNumber}/${safeBarcode}_${timestamp}.${fileExt}`;
}

/**
 * 從 photo_url 解析出 B2 key
 * 支援格式: https://.../file/bucket/photos/... 或 相對路徑
 */
export async function getB2KeyFromUrl(url: string): Promise<string | null> {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const parts = pathname.split('/');
    const fileIndex = parts.indexOf('file');
    if (fileIndex !== -1 && fileIndex + 2 < parts.length) {
      return parts.slice(fileIndex + 2).join('/');
    }
    if (pathname.startsWith('/photos/')) {
      return pathname.slice(1);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 檢查是否為 B2 key (相對路徑) 而非完整 URL
 */
export async function checkIsB2Key(photoUrl: string): Promise<boolean> {
  return !photoUrl.startsWith('http');
}