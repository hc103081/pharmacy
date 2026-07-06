import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-expect-error: Deno std module not typed
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

declare const Deno: any;

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const ARCHIVED_BUCKET = 'archived-manifests';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_DRIVE_API = 'https://www.googleapis.com/drive/v3';
const CHUNK_SIZE = 8 * 256 * 1024; // 8MB = 256KB * 32 (must be 256KB multiple)
const UPLOAD_TIMEOUT_MS = 120_000;
const LOCK_TIMEOUT_HOURS = 1;

function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function acquireLock(manifestId: string, userId: string): Promise<boolean> {
  const lockUntil = new Date(Date.now() - LOCK_TIMEOUT_HOURS * 60 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from('manifests')
    .update({ archive_status: 'migrating', archive_locked_at: new Date().toISOString() })
    .eq('id', manifestId)
    .eq('user_id', userId)
    .eq('status', 'archived')
    .or(
      `archive_status.is.null,and(archive_status.eq.migrating,archive_locked_at.lt.${lockUntil})`
    );

  if (error) return false;

  const { data: check } = await supabase
    .from('manifests')
    .select('archive_status, archive_locked_at')
    .eq('id', manifestId)
    .single();

  return check?.archive_status === 'migrating' && !!check?.archive_locked_at;
}

async function releaseLock(manifestId: string, userId: string, status: 'archived' | null = 'archived') {
  await supabase
    .from('manifests')
    .update({ archive_status: status, archive_locked_at: null })
    .eq('id', manifestId)
    .eq('user_id', userId);
}

async function getValidAccessToken(userId: string): Promise<string> {
  // Get connection with row lock
  const { data: conn, error } = await supabase
    .from('user_gdrive_connections')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !conn) throw new Error('No gdrive connection');

  const needsRefresh = !conn.token_expires_at ||
    new Date(conn.token_expires_at).getTime() < Date.now() + 5 * 60 * 1000;

  if (!needsRefresh) return conn.access_token!;

  // Refresh token outside of DB lock
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

  if (!tokenRes.ok) throw new Error(`Token refresh failed: ${tokenRes.status}`);

  const tokenData = await tokenRes.json();

  // Re-acquire lock and update atomically
  const { data: updated, error: updateError } = await supabase
    .from('user_gdrive_connections')
    .update({
      access_token: tokenData.access_token,
      token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
    })
    .eq('user_id', userId)
    .eq('token_expires_at', conn.token_expires_at) // optimistic lock
    .single();

  if (updateError || !updated) {
    throw new Error('Token was updated by another process, please retry');
  }

  return tokenData.access_token;
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

async function ensureSubfolder(accessToken: string, parentId: string, manifestId: string): Promise<string> {
  const listRes = await fetch(
    `${GOOGLE_DRIVE_API}/files?q=name='${manifestId}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const listData = await listRes.json();

  if (listData.files && listData.files.length > 0) return listData.files[0].id;

  const createRes = await fetch(`${GOOGLE_DRIVE_API}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: manifestId, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  const createData = await createRes.json();
  return createData.id;
}

async function checkDriveSpace(accessToken: string, requiredBytes: number): Promise<boolean> {
  const res = await fetch(`${GOOGLE_DRIVE_API}/about?fields=storageQuota`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  const quota = data.storageQuota;
  if (!quota) return true; // unlimited or unknown
  const available = (quota.limit ? parseInt(quota.limit) : Infinity) - (quota.usage ? parseInt(quota.usage) : 0);
  return available >= requiredBytes;
}

async function uploadToDriveStream(
  accessToken: string,
  downloadUrl: string,
  folderId: string,
  fileName: string,
  fileSize: number
): Promise<string> {
  // Start resumable upload session
  const initRes = await fetch(`${GOOGLE_DRIVE_API}/files?uploadType=resumable`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Upload-Content-Type': 'application/zip',
      'X-Upload-Content-Length': fileSize.toString(),
    },
    body: JSON.stringify({ name: fileName, parents: [folderId] }),
  });

  const resumableUrl = initRes.headers.get('Location');
  if (!resumableUrl) throw new Error('Failed to start resumable upload');

  // Stream download -> upload with 256KB-aligned chunks
  const buffer = new Uint8Array(CHUNK_SIZE);
  let bufferOffset = 0;
  let uploadedBytes = 0;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  const downloadRes = await fetch(downloadUrl, { signal: controller.signal });
  clearTimeout(timeoutId);

  if (!downloadRes.ok || !downloadRes.body) throw new Error('Download failed');

  const reader = downloadRes.body.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    let offset = 0;
    while (offset < value.length) {
      const spaceLeft = CHUNK_SIZE - bufferOffset;
      const toCopy = Math.min(spaceLeft, value.length - offset);
      buffer.set(value.subarray(offset, offset + toCopy), bufferOffset);
      bufferOffset += toCopy;
      offset += toCopy;

      if (bufferOffset === CHUNK_SIZE) {
        const start = uploadedBytes;
        const end = start + CHUNK_SIZE - 1;

        const chunkRes = await fetch(resumableUrl, {
          method: 'PUT',
          headers: { 'Content-Range': `bytes ${start}-${end}/${fileSize}` },
          body: buffer,
        });

        if (chunkRes.status === 200 || chunkRes.status === 201) {
          uploadedBytes = end + 1;
          bufferOffset = 0;
          break; // Upload complete
        }
        if (chunkRes.status === 308) {
          uploadedBytes = end + 1;
          bufferOffset = 0;
          continue;
        }

        // Query progress for resume
        const rangeRes = await fetch(resumableUrl, {
          method: 'PUT',
          headers: { 'Content-Range': `bytes */${fileSize}` },
        });
        if (rangeRes.status === 308) {
          const rangeHeader = rangeRes.headers.get('Range');
          uploadedBytes = rangeHeader ? parseInt(rangeHeader.split('-')[1]) + 1 : uploadedBytes;
          bufferOffset = 0;
          continue;
        }
        throw new Error(`Upload failed: ${chunkRes.status}`);
      }
    }
  }

  // Final partial chunk
  if (bufferOffset > 0) {
    const start = uploadedBytes;
    const end = start + bufferOffset - 1;
    const finalRes = await fetch(resumableUrl, {
      method: 'PUT',
      headers: { 'Content-Range': `bytes ${start}-${end}/${fileSize}` },
      body: buffer.slice(0, bufferOffset),
    });
    if (finalRes.status !== 200 && finalRes.status !== 201) {
      throw new Error(`Final chunk failed: ${finalRes.status}`);
    }
  }

  // Get file ID from final response
  const finalRes = await fetch(resumableUrl, { method: 'PUT', headers: { 'Content-Range': `bytes */${fileSize}` } });
  const fileData = await finalRes.json();
  return fileData.id;
}

async function logAction(manifestId: string, action: string, status: string, message: string) {
  try {
    await supabase.from('archive_logs').insert({
      manifest_id: manifestId,
      action,
      trigger: 'gdrive-migrate',
      status,
      message,
    });
  } catch {}
}

serve(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  let manifestId: string, userId: string, trigger: 'queue-worker' | 'manual' = 'queue-worker';
  try {
    const body = await req.json();
    manifestId = body.manifestId;
    trigger = body.trigger || 'queue-worker';
    if (!manifestId) throw new Error('manifestId required');
  } catch {
    return jsonResponse({ error: 'manifestId required' }, 400);
  }

  try {
    // Get user_id from manifest
    const { data: manifest, error: mErr } = await supabase
      .from('manifests')
      .select('user_id, archived_zip_path, storage_size_bytes')
      .eq('id', manifestId)
      .single();
    if (mErr || !manifest) throw mErr || new Error('Manifest not found');
    userId = manifest.user_id;

    // Acquire lock
    const locked = await acquireLock(manifestId, userId);
    if (!locked) return jsonResponse({ skipped: 'Already locked or processing' });

    try {
      // Get valid access token
      const accessToken = await getValidAccessToken(userId);

      // Check Drive space
      const zipSize = manifest.storage_size_bytes || 0;
      if (zipSize === 0) throw new Error('ZIP size unknown');
      const hasSpace = await checkDriveSpace(accessToken, zipSize);
      if (!hasSpace) {
        await releaseLock(manifestId, userId, 'archived');
        await logAction(manifestId, 'gdrive_migrate', 'failed', 'Insufficient Google Drive space');
        return jsonResponse({ error: 'Insufficient Google Drive space' }, 400);
      }

      // Ensure folders
      const rootFolderId = await ensureRootFolder(accessToken, userId);
      const subfolderId = await ensureSubfolder(accessToken, rootFolderId, manifestId);

      // Get signed download URL
      const { data: signedData, error: signError } = await supabase.storage
        .from(ARCHIVED_BUCKET)
        .createSignedUrl(`${manifestId}/archive.zip`, 86400);
      if (signError || !signedData) throw signError || new Error('Failed to create signed URL');

      // Upload to Google Drive
      const fileId = await uploadToDriveStream(
        accessToken,
        signedData.signedUrl,
        subfolderId,
        'archive.zip',
        zipSize
      );

      // Verify upload size
      const verifyRes = await fetch(`${GOOGLE_DRIVE_API}/files/${fileId}?fields=size`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const verifyData = await verifyRes.json();
      if (parseInt(verifyData.size) !== zipSize) {
        throw new Error('Upload size mismatch');
      }

      // Update DB: mark cloud_backup = true
      const { error: manifestUpdateError, count } = await supabase
        .from('manifests')
        .update({
          cloud_backup: true,
          gdrive_file_id: fileId,
          archive_status: null,
          archive_locked_at: null,
        })
        .eq('id', manifestId)
        .select('count');

      if (manifestUpdateError) throw manifestUpdateError;
      if (!count || count === 0) {
        throw new Error('Manifest update failed: no rows affected (possible RLS issue)');
      }

      // Delete from Supabase Storage (ONLY after successful DB update)
      const { error: storageDeleteError } = await supabase.storage
        .from(ARCHIVED_BUCKET)
        .remove([`${manifestId}/archive.zip`]);
      if (storageDeleteError) throw storageDeleteError;

      // Update job
      const { error: jobUpdateError } = await supabase
        .from('gdrive_migration_jobs')
        .update({ storage_deleted: true })
        .eq('manifest_id', manifestId);
      if (jobUpdateError) throw jobUpdateError;

      await logAction(manifestId, 'gdrive_migrate', 'success', `Migrated to Google Drive: ${fileId}`);

      return jsonResponse({ success: true, fileId });
    } catch (err: any) {
      await releaseLock(manifestId, userId, 'archived');
      await logAction(manifestId, 'gdrive_migrate', 'failed', err.message);
      throw err;
    }
  } catch (err: any) {
    console.error('[gdrive-migrate] Error:', err);
    return jsonResponse({ error: err.message || 'Internal server error' }, 500);
  }
});