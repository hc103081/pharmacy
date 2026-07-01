'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export interface ArchiveResponse {
  success: boolean;
  error?: string;
}

/**
 * 將清單標記為已完成 (Archive)
 */
export async function archiveManifest(manifestId: string): Promise<ArchiveResponse> {
  try {
    const { error } = await getSupabaseAdmin()
      .from('manifests')
      .update({ status: 'completed' })
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
      .select('photo_url')
      .eq('manifest_id', manifestId);

    if (itemsError) {
      return { success: false, error: `查詢項目失敗: ${itemsError.message}` };
    }

    // 4. 從 Storage 刪除照片
    const photosToDelete = items
      .map(item => item.photo_url)
      .filter((url): url is string => !!url)
      .map(url => {
        const urlObj = new URL(url);
        const pathWithBucket = urlObj.pathname.replace('/storage/v1/object/public/', '');
        const pathParts = pathWithBucket.split('/');
        return pathParts.length > 1 ? pathParts.slice(1).join('/') : null;
      })
      .filter((path): path is string => !!path);

    if (photosToDelete.length > 0) {
      const { error: storageError } = await getSupabaseAdmin().storage
        .from('drug-photos')
        .remove(photosToDelete);
      if (storageError) console.error('Storage delete error:', storageError);
    }

    // 5. 刪除 Manifest (觸發 Cascade Delete 刪除 drug_items)
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
