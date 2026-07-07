import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-expect-error: Deno std module not typed
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

declare const Deno: any;

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const ARCHIVED_BUCKET = 'archived-manifests';
const DRUG_PHOTOS_BUCKET = 'drug-photos';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_DRIVE_API = 'https://www.googleapis.com/drive/v3';
const SAFE_THRESHOLD_MB = 950; // 950MB safety threshold
const PHOTO_ESTIMATE_MULTIPLIER = 1.15;

function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function getValidAccessToken(userId: string): Promise<string> {
  const { data: conn, error } = await supabase
    .from('user_gdrive_connections')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !conn) throw new Error('No gdrive connection');

  const needsRefresh = !conn.token_expires_at ||
    new Date(conn.token_expires_at).getTime() < Date.now() + 5 * 60 * 1000;

  if (!needsRefresh) return conn.access_token!;

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
      refresh_token: conn.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  if (!tokenRes.ok) {
    const errData = await tokenRes.json();
    if (errData.error === 'invalid_grant') {
      await supabase
        .from('user_gdrive_connections')
        .update({ refresh_token: null, access_token: null })
        .eq('user_id', userId);
    }
    throw new Error(`Token refresh failed: ${tokenRes.status}`);
  }

  const tokenData = await tokenRes.json();
  await supabase
    .from('user_gdrive_connections')
    .update({
      access_token: tokenData.access_token,
      token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
    })
    .eq('user_id', userId);

  return tokenData.access_token;
}

async function checkStorageCapacity(zipSize: number, photoEstimate: number): Promise<boolean> {
  const { data, error } = await supabase
    .from('manifests')
    .select('storage_size_bytes')
    .eq('cloud_backup', false);

  if (error) return true; // assume ok if can't check

  const currentUsage = data?.reduce((sum: number, m: any) => sum + (m.storage_size_bytes || 0), 0) || 0;
  const requiredSpace = zipSize + photoEstimate;
  return currentUsage + requiredSpace <= SAFE_THRESHOLD_MB * 1024 * 1024;
}

async function logAction(manifestId: string, status: string, message: string) {
  try {
    await supabase.from('archive_logs').insert({
      manifest_id: manifestId,
      action: 'gdrive_pull',
      trigger: 'manual',
      status,
      message,
    });
  } catch {}
}

async function ensureRootFolder(accessToken: string, userId: string): Promise<string> {
  // Check cached folder ID
  const { data: conn } = await supabase
    .from('user_gdrive_connections')
    .select('gdrive_root_folder_id')
    .eq('user_id', userId)
    .single();

  if (conn?.gdrive_root_folder_id) return conn.gdrive_root_folder_id;

  // Query existing folder
  const listRes = await fetch(
    `${GOOGLE_DRIVE_API}/files?q=name='PhamaCount' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name,createdTime)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const listData = await listRes.json();

  let folderId: string;
  if (listData.files && listData.files.length > 0) {
    listData.files.sort((a: any, b: any) => b.createdTime.localeCompare(a.createdTime));
    folderId = listData.files[0].id;
  } else {
    // Create new folder
    const createRes = await fetch(`${GOOGLE_DRIVE_API}/files`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'PhamaCount', mimeType: 'application/vnd.google-apps.folder' }),
    });
    const createData = await createRes.json();
    folderId = createData.id;
  }

  // Cache in DB
  await supabase
    .from('user_gdrive_connections')
    .update({ gdrive_root_folder_id: folderId })
    .eq('user_id', userId);

  return folderId;
}

serve(async (req: Request) => {
  console.log('[gdrive-pull] Request received, method:', req.method);
  
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  let manifestId: string;
  try {
    const body = await req.json();
    console.log('[gdrive-pull] Request body:', body);
    manifestId = body.manifestId;
    if (!manifestId) throw new Error('manifestId required');
  } catch (e) {
    console.error('[gdrive-pull] JSON parse error:', e);
    return jsonResponse({ error: 'manifestId required' }, 400);
  }

  try {
    // Get manifest info
    console.log('[gdrive-pull] Querying manifest:', manifestId);
    const { data: manifest, error: mErr } = await supabase
      .from('manifests')
      .select('id, user_id, cloud_backup, gdrive_file_id, storage_size_bytes')
      .eq('id', manifestId)
      .single();

    console.log('[gdrive-pull] Manifest query result:', { manifest: !!manifest, error: mErr?.message });

    if (mErr || !manifest) return jsonResponse({ error: 'Manifest not found' }, 404);
    if (!manifest.cloud_backup || !manifest.gdrive_file_id) {
      console.log('[gdrive-pull] Not cloud backed:', { cloud_backup: manifest.cloud_backup, gdrive_file_id: manifest.gdrive_file_id });
      return jsonResponse({ error: 'Not a cloud-backed manifest' }, 400);
    }

    const userId = manifest.user_id;
    const zipSize = manifest.storage_size_bytes || 0;
    const photoEstimate = zipSize * PHOTO_ESTIMATE_MULTIPLIER;

    // Capacity check
    const hasCapacity = await checkStorageCapacity(zipSize, photoEstimate);
    if (!hasCapacity) {
      return jsonResponse({
        error: 'storage_full_prevent',
        message: 'Supabase 空間不足以容納還原檔案，請先封存其他進行中清單以釋放空間。',
      }, 400);
    }

    // Get access token
    let accessToken: string;
    try {
      accessToken = await getValidAccessToken(userId);
      console.log('[gdrive-pull] Got access token, length:', accessToken.length);
    } catch (err: any) {
      console.error('[gdrive-pull] Token error:', err);
      return jsonResponse({
        error: 'gdrive_auth_expired',
        message: 'Google Drive 授權已過期，請重新連結',
      }, 401);
    }

    // Download ZIP from Google Drive
    console.log('[gdrive-pull] Starting download for file:', manifest.gdrive_file_id);
    const downloadRes = await fetch(
      `${GOOGLE_DRIVE_API}/files/${manifest.gdrive_file_id}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    console.log('[gdrive-pull] Download response status:', downloadRes.status);

    if (downloadRes.status === 404) {
      // File deleted from Drive - mark as corrupted
      await supabase
        .from('manifests')
        .update({
          cloud_backup: false,
          gdrive_file_id: null,
          archive_status: null,
          archive_locked_at: null,
        })
        .eq('id', manifestId);
      await logAction(manifestId, 'gdrive_pull', 'failed', 'Cloud backup missing (404)');
      return jsonResponse({
        error: 'cloud_backup_missing',
        message: '雲端備份檔案已被移除，無法還原',
      }, 404);
    }

    if (!downloadRes.ok) {
      if (downloadRes.status === 401) {
        return jsonResponse({ error: 'gdrive_auth_expired', message: 'Google Drive 授權已過期' }, 401);
      }
      const errorText = await downloadRes.text();
      console.error('[gdrive-pull] Download failed:', downloadRes.status, errorText);
      throw new Error(`Download failed: ${downloadRes.status} ${errorText}`);
    }

    const zipBlob = await downloadRes.blob();
    console.log('[gdrive-pull] Blob size:', zipBlob.size);
    const zipArrayBuffer = await zipBlob.arrayBuffer();
    console.log('[gdrive-pull] ArrayBuffer byteLength:', zipArrayBuffer.byteLength);

    // Upload back to Supabase Storage
    const zipPath = `${manifestId}/archive.zip`;
    const { error: uploadError } = await supabase.storage
      .from(ARCHIVED_BUCKET)
      .upload(zipPath, zipArrayBuffer, {
        contentType: 'application/zip',
        upsert: true,
      });
    if (uploadError) throw uploadError;

    // Update DB: restore local state
    const gdriveFileId = manifest.gdrive_file_id; // Save before update
    const pullUserId = userId;
    const pullAccessToken = accessToken;
    
    await supabase
      .from('manifests')
      .update({
        cloud_backup: false,
        gdrive_file_id: null,
        archive_status: 'archived',
        archived_zip_path: zipPath,
        storage_size_bytes: zipArrayBuffer.byteLength,
      })
      .eq('id', manifestId);

    await logAction(manifestId, 'gdrive_pull', 'success', 'Pulled from Google Drive to Supabase');

    // === 新增：還原後清理 Drive 上的 archive.zip 及父資料夾 ===
    let zipDeleted = false;
    let folderDeleted = false;

    try {
      // 1. 刪除 archive.zip
      const delFileRes = await fetch(`${GOOGLE_DRIVE_API}/files/${gdriveFileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${pullAccessToken}` },
      });
      if (delFileRes.ok || delFileRes.status === 404) zipDeleted = true;

      // 2. 找父資料夾 PhamaCount/archived/{manifestId}/
      const rootFolderId = await ensureRootFolder(pullAccessToken, pullUserId);
      const listFolderRes = await fetch(
        `${GOOGLE_DRIVE_API}/files?q=name='${manifestId}' and '${rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id)`,
        { headers: { Authorization: `Bearer ${pullAccessToken}` } }
      );
      const folderData = await listFolderRes.json();
      const subfolderId = folderData.files?.[0]?.id;

      if (subfolderId) {
        // 3. 確認資料夾為空
        const listContentRes = await fetch(
          `${GOOGLE_DRIVE_API}/files?q='${subfolderId}' in parents and trashed=false&fields=files(id)`,
          { headers: { Authorization: `Bearer ${pullAccessToken}` } }
        );
        const contentData = await listContentRes.json();
        
        if (!contentData.files?.length) {
          // 4. 刪除空資料夾
          const delFolderRes = await fetch(`${GOOGLE_DRIVE_API}/files/${subfolderId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${pullAccessToken}` },
          });
          if (delFolderRes.ok || delFolderRes.status === 404) folderDeleted = true;
        }
      }
    } catch (err) {
      // 清理失敗只記 log，不阻斷主流程
      await logAction(manifestId, 'gdrive_cleanup', 'failed', err.message);
    }

    return jsonResponse({ 
      success: true, 
      zipSize: zipArrayBuffer.byteLength, 
      cleanup: { zipDeleted, folderDeleted } 
    });
  } catch (err: any) {
    console.error('[gdrive-pull] Error:', err);
    return jsonResponse({ error: err.message || 'Internal server error' }, 500);
  }
});