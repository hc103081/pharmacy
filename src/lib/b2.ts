'use server';

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  ListObjectsV2CommandOutput,
  ListObjectVersionsCommand,
  HeadObjectCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Backblaze B2 S3-compatible client wrapper
 * Bucket 預設為 Private，需透過 Presigned URL 進行上傳/下載/瀏覽
 */

// 延遲初始化配置
let cachedConfig: {
  region: string;
  bucket: string;
  keyId: string;
  appKey: string;
  endpoint: string;
  bucketId?: string;
} | null = null;

function getConfig() {
  if (!cachedConfig) {
    const requiredEnv = ['B2_KEY_ID', 'B2_APP_KEY', 'B2_BUCKET', 'B2_REGION'];  
    for (const key of requiredEnv) {
      if (!process.env[key]) {
        throw new Error('Missing required env: ' + key);
      }
    }
    const region = process.env.B2_REGION!;
    const bucket = process.env.B2_BUCKET!;
    const keyId = process.env.B2_KEY_ID!;
    const appKey = process.env.B2_APP_KEY!;
    const bucketId = process.env.B2_BUCKET_ID; // 可選：避免呼叫 b2_list_buckets
    cachedConfig = {
      region,
      bucket,
      keyId,
      appKey,
      bucketId,
      endpoint: 'https://s3.' + region + '.backblazeb2.com',
    };
  }
  return cachedConfig;
}

function getBucketId(): string | undefined {
  return getConfig().bucketId;
}

let b2Client: S3Client | null = null;

function getB2Client() {
  if (!b2Client) {
    const config = getConfig();
    b2Client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.keyId,
        secretAccessKey: config.appKey,
      },
      forcePathStyle: true,
    });
  }
  return b2Client;
}

function getBucket() { return getConfig().bucket; }
function getKeyId() { return getConfig().keyId; }
function getAppKey() { return getConfig().appKey; }
function getRegion() { return getConfig().region; }

/**
 * 取得 Cloudflare CDN 主機名 (若已設定)
 * 用於將 B2 S3 端點 hostname 替換為 CDN 域名
 */
function getCdnHost(): string | undefined {
  return process.env.NEXT_PUBLIC_B2_CDN_HOST;
}

/**
 * 將 URL 的 hostname 替換為 CDN 主機名 (若已設定)
 */
function replaceWithCdnHost(url: string): string {
  const cdnHost = getCdnHost();
  if (!cdnHost) return url;
  try {
    const u = new URL(url);
    u.hostname = cdnHost;
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * 建立 Presigned PUT URL
 */
export async function createPresignedUploadUrl(
  key: string,
  contentType: string = 'image/jpeg',
  expiresIn: number = 3600
): Promise<{ uploadUrl: string; key: string }> {
  const client = getB2Client();
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn });
  return { uploadUrl, key };
}

export async function deleteB2Object(key: string): Promise<void> {
  const client = getB2Client();
  const command = new DeleteObjectCommand({
    Bucket: getBucket(),
    Key: key,
  });
  await client.send(command);
}

export async function deleteB2Objects(keys: string[]): Promise<void> {
  const client = getB2Client();

  for (const key of keys) {
    try {
      const listVersionsCmd = new ListObjectVersionsCommand({
        Bucket: getBucket(),
        Prefix: key,
      });
      const versionsResponse = await client.send(listVersionsCmd);

      const allVersions = [
        ...(versionsResponse.Versions || []),
        ...(versionsResponse.DeleteMarkers || []),
      ].filter(v => v.Key === key && v.VersionId);

      for (const version of allVersions) {
        const deleteCmd = new DeleteObjectCommand({
          Bucket: getBucket(),
          Key: key,
          VersionId: version.VersionId,
        });
        await client.send(deleteCmd);
      }

      console.log('[deleteB2Objects] Deleted ' + allVersions.length + ' version(s) for ' + key);
    } catch (err) {
      console.error('[deleteB2Objects] Failed to delete ' + key + ':', err);
    }
  }
}

export async function listB2Objects(
  prefix: string = '',
  maxKeys: number = 1000
): Promise<Array<{ key: string; size: number; lastModified: Date }>> {
  const client = getB2Client();
  const command = new ListObjectsV2Command({
    Bucket: getBucket(),
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
 * 列出所有具有指定前綴的 B2 物件（支援分頁）
 * 適合用於統計整個 Bucket 或特定前綴下的總用量
 */
export async function listB2ObjectsWithPrefix(
  prefix: string = '',
  maxKeys: number = 1000
): Promise<Array<{ key: string; size: number; lastModified: Date }>> {
  const client = getB2Client();
  const allObjects: Array<{ key: string; size: number; lastModified: Date }> = [];
  let continuationToken: string | undefined = undefined;

  do {
    const command = new ListObjectsV2Command({
      Bucket: getBucket(),
      Prefix: prefix,
      MaxKeys: maxKeys,
      ContinuationToken: continuationToken,
    });

    const response: ListObjectsV2CommandOutput = await client.send(command);
    const objects = (response.Contents || []).map((obj) => ({
      key: obj.Key!,
      size: obj.Size || 0,
      lastModified: obj.LastModified || new Date(),
    }));
    allObjects.push(...objects);

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return allObjects;
}

export async function getB2DownloadAuthorization(
  bucketId: string,
  fileNamePrefix: string,
  expiresIn: number = 3600
): Promise<string> {
  const auth = Buffer.from(getKeyId() + ':' + getAppKey()).toString('base64');

  const authRes = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
    method: 'GET',
    headers: { 'Authorization': 'Basic ' + auth },
  });
  const authData = await authRes.json();

  if (!authData.absoluteMinimumPartSize) {
    throw new Error('B2 authorize failed: ' + JSON.stringify(authData));
  }

  const apiUrl = authData.apiUrl;
  const downloadUrl = authData.downloadUrl;
  const authorizationToken = authData.authorizationToken;

  const downloadAuthRes = await fetch(apiUrl + '/b2api/v2/b2_get_download_authorization', {
    method: 'POST',
    headers: {
      'Authorization': authorizationToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      bucketId,
      fileNamePrefix,
      validDurationInSeconds: expiresIn,
    }),
  });

  const downloadAuth = await downloadAuthRes.json();

  if (!downloadAuthRes.ok) {
    throw new Error('B2 download auth failed: ' + JSON.stringify(downloadAuth));
  }

  const url = downloadUrl + '/file/' + getBucket() + '/' + encodeURIComponent(fileNamePrefix) + '?Authorization=' + downloadAuth.authorizationToken;
  // 將 hostname 替換為 Cloudflare CDN 域名 (若已設定)
  return replaceWithCdnHost(url);
}

/**
 * 取得 B2 原生上傳授權 (用於直接上傳，避開 S3 CORS 問題)
 * 回傳 { uploadUrl, authorizationToken, bucketId }
 */
export async function getB2UploadAuthorization(
  bucketId: string,
  expiresIn: number = 3600
): Promise<{ uploadUrl: string; authorizationToken: string; bucketId: string }> {
  const auth = Buffer.from(getKeyId() + ':' + getAppKey()).toString('base64');

  const authRes = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
    method: 'GET',
    headers: { 'Authorization': 'Basic ' + auth },
  });
  const authData = await authRes.json();

  if (!authData.absoluteMinimumPartSize) {
    throw new Error('B2 authorize failed: ' + JSON.stringify(authData));
  }

  const apiUrl = authData.apiUrl;
  const authorizationToken = authData.authorizationToken;

  const uploadRes = await fetch(apiUrl + '/b2api/v2/b2_get_upload_url', {
    method: 'POST',
    headers: {
      'Authorization': authorizationToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ bucketId }),
  });

  const uploadData = await uploadRes.json();

  if (!uploadRes.ok) {
    throw new Error('B2 get upload url failed: ' + JSON.stringify(uploadData));
  }

  return {
    uploadUrl: uploadData.uploadUrl,
    authorizationToken: uploadData.authorizationToken,
    bucketId,
  };
}

export async function createPresignedViewUrl(
  key: string,
  expiresIn: number = 3600,
  responseContentDisposition?: 'inline' | 'attachment'
): Promise<string> {
  // 直接使用 S3 兼容端點生成預簽名 URL
  // B2 原生下載端點 (f004.backblazeb2.com/file/...) 預設不支援 CORS，會導致瀏覽器阻擋
  // S3 端點 (s3.{region}.backblazeb2.com) 支援 CORS 配置，可正常在瀏覽器中載入圖片
  const client = getB2Client();
  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: key,
    ...(responseContentDisposition && { ResponseContentDisposition: responseContentDisposition }),
  });

  const signedUrl = await getSignedUrl(client, command, { expiresIn });
  // 將 hostname 替換為 Cloudflare CDN 域名 (若已設定 NEXT_PUBLIC_B2_CDN_HOST)
  // CF 端需設定「忽略查詢字串」快取規則，以便忽略簽名參數進行快取
  return replaceWithCdnHost(signedUrl);
}

let cachedBucketId: string | null = null;
export async function getB2BucketId(): Promise<string> {
  if (cachedBucketId) return cachedBucketId;

  // 如果有環境變數直接提供 bucketId，優先使用
  const envBucketId = getBucketId();
  if (envBucketId) {
    cachedBucketId = envBucketId;
    return cachedBucketId;
  }

  const auth = Buffer.from(getKeyId() + ':' + getAppKey()).toString('base64');  
  const authRes = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
    method: 'GET',
    headers: { 'Authorization': 'Basic ' + auth },
  });
  const authData = await authRes.json();

  const bucketsRes = await fetch(authData.apiUrl + '/b2api/v2/b2_list_buckets', {
    method: 'POST',
    headers: { 'Authorization': authData.authorizationToken },
    body: JSON.stringify({ accountId: authData.accountId }),
  });
  const buckets = await bucketsRes.json();
  const bucket = buckets.buckets.find((b: { bucketName: string; bucketId: string }) => b.bucketName === getBucket());

  if (!bucket) throw new Error('Bucket ' + getBucket() + ' not found');
  cachedBucketId = bucket.bucketId;
  return bucket.bucketId;
}

export async function checkB2ObjectExists(key: string): Promise<boolean> {
  const client = getB2Client();
  const command = new HeadObjectCommand({
    Bucket: getBucket(),
    Key: key,
  });
  try {
    await client.send(command);
    return true;
  } catch {
    return false;
  }
}

