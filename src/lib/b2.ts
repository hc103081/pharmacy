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

  return downloadUrl + '/file/' + getBucket() + '/' + encodeURIComponent(fileNamePrefix) + '?Authorization=' + downloadAuth.authorizationToken;
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
  try {
    const bucketId = await getB2BucketId();
    const nativeUrl = await getB2DownloadAuthorization(bucketId, key, expiresIn);

    if (responseContentDisposition) {
      throw new Error('Use presigned for disposition');
    }
    return nativeUrl;
  } catch (nativeErr: unknown) {
    const msg = nativeErr instanceof Error ? nativeErr.message : String(nativeErr);
    console.log('[createPresignedViewUrl] B2 native auth failed, fallback to S3 presigned:', msg);
  }

  const client = getB2Client();
  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: key,
    ...(responseContentDisposition && { ResponseContentDisposition: responseContentDisposition }),
  });

  return getSignedUrl(client, command, { expiresIn });
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

