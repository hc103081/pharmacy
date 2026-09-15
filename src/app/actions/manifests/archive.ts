'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { deleteB2Objects, getB2KeyFromUrl } from '@/lib/b2';

interface ArchiveResponse {
  success: boolean;
  error?: string;
}

/**
 * 封存清單 (歸檔)
 */
export async function archiveManifest(manifestId: string): Promise<ArchiveResponse> {
  try {
    const { error } = await getSupabaseAdmin()
      .from('manifests')
      .update({ status: 'archived', archived_at: new Date().toISOString() })
      .eq('id', manifestId);

    if (error) {
      return { success: false, error: `封存清單失敗: ${error.message}` };
    }

    return { success: true };
  } catch (error: unknown) {
    console.error('Archive Manifest Error:', error);
    const errorMessage = error instanceof Error ? error.message : '封存清單失敗';
    return { success: false, error: errorMessage };
  }
}

/**
 * 永久刪除清單及其所有關聯數據 (含 Storage 照片)
 * Strategy 2: 同時刪除 Supabase Storage 舊照片 和 B2 照片
 */
export async function deleteManifest(manifestId: string): Promise<ArchiveResponse> {
  try {
    // 1. 獲取 manifest 資訊（檢查是否有封存 ZIP）
    const { data: manifest, error: manifestError } = await getSupabaseAdmin()
      .from('manifests')
      .select('archived_zip_path, status')
      .eq('id', manifestId)
      .single();

    if (manifestError && manifestError.code !== 'PGRST116') {
      return { success: false, error: `查詢清單失敗: ${manifestError.message}` };
    }

    // 2. 刪除封存 ZIP（如果有的話，archived manifest）
    if (manifest?.archived_zip_path) {
      const { error: zipError } = await getSupabaseAdmin().storage
        .from('archived-manifests')
        .remove([manifest.archived_zip_path]);
      if (zipError) console.error('Archive ZIP delete error:', zipError);
    }

    // 3. 獲取所有關聯項目的照片路徑（active manifest）
    const { data: items, error: itemsError } = await getSupabaseAdmin()
      .from('drug_items')
      .select('id, photo_url')
      .eq('manifest_id', manifestId);

    if (itemsError) {
      return { success: false, error: `查詢項目失敗: ${itemsError.message}` };
    }

    console.log(`[deleteManifest] manifestId: ${manifestId}, items found: ${items?.length || 0}`);
    if (items && items.length > 0) {
      items.forEach(item => console.log(`[deleteManifest] item ${item.id}: photo_url = ${item.photo_url}`));
    }

    // 4. 分類照片 URL
    const allPhotoUrls = items
      .map(item => item.photo_url)
      .filter((url): url is string => !!url);

    console.log(`[deleteManifest] allPhotoUrls:`, allPhotoUrls);

    // Supabase URL: 包含 supabase.co
    const supabasePhotoUrls = allPhotoUrls.filter(url => url.includes('supabase.co'));

    // B2 相關: B2 public URL (backblazeb2.com, b2.cloud) 或 相對路徑 (photos/...)
    const b2PhotoUrls = allPhotoUrls.filter(url => 
      url.includes('backblazeb2.com') || 
      url.includes('b2.cloud') || 
      url.startsWith('photos/')
    );

    console.log(`[deleteManifest] supabasePhotoUrls: ${supabasePhotoUrls.length}, b2PhotoUrls: ${b2PhotoUrls.length}`);

    // 5. 刪除 Supabase Storage 舊照片
    if (supabasePhotoUrls.length > 0) {
      const photosToDelete = supabasePhotoUrls
        .map(url => {
          try {
            const urlObj = new URL(url);
            const pathWithBucket = urlObj.pathname.replace('/storage/v1/object/public/', '');
            const pathParts = pathWithBucket.split('/');
            return pathParts.length > 1 ? pathParts.slice(1).join('/') : null;
          } catch {
            return null;
          }
        })
        .filter((path): path is string => !!path);

      if (photosToDelete.length > 0) {
        const { error: storageError } = await getSupabaseAdmin().storage
          .from('drug-photos')
          .remove(photosToDelete);
        if (storageError) console.error('Supabase Storage delete error:', storageError);
        else console.log(`[deleteManifest] Deleted ${photosToDelete.length} Supabase photos`);
      }
    }

    // 6. 刪除 B2 照片
    if (b2PhotoUrls.length > 0) {
      const b2Keys = b2PhotoUrls
        .map(url => {
          // 相對路徑直接用
          if (url.startsWith('photos/')) return url;
          // B2 public URL 解析 key
          return getB2KeyFromUrl(url);
        })
        .filter((key): key is string => !!key);

      console.log(`[deleteManifest] b2Keys to delete:`, b2Keys);

      if (b2Keys.length > 0) {
        try {
          await deleteB2Objects(b2Keys);
          console.log(`✅ Deleted ${b2Keys.length} B2 photos for manifest ${manifestId}`);
        } catch (b2Err) {
          console.error('B2 delete error:', b2Err);
        }
      }
    } else {
      console.log(`[deleteManifest] No B2 photos to delete`);
    }

    // 6. 刪除 Manifest (觸發 Cascade Delete 刪除 drug_items)
    const { error: deleteError } = await getSupabaseAdmin()
      .from('manifests')
      .delete()
      .eq('id', manifestId);

    if (deleteError) {
      return { success: false, error: `刪除清單失敗: ${deleteError.message}` };
    }

    return { success: true };
  } catch (error: unknown) {
    console.error('Delete Manifest Error:', error);
    const errorMessage = error instanceof Error ? error.message : '刪除清單失敗';
    return { success: false, error: errorMessage };
  }
}
