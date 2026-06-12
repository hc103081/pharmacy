'use server';

import { supabaseAdmin } from '@/lib/supabaseAdmin';

export interface ArchiveResponse {
  success: boolean;
  error?: string;
}

/**
 * 將清單標記為已完成 (Archive)
 */
export async function archiveManifest(manifestId: string): Promise<ArchiveResponse> {
  try {
    const { error } = await supabaseAdmin
      .from('manifests')
      .update({ status: 'completed' })
      .eq('id', manifestId);

    if (error) throw error;

    return { success: true };
  } catch (error: any) {
    console.error('Archive Manifest Error:', error);
    return { 
      success: false, 
      error: error.message || '封存清單失敗' 
    };
  }
}

/**
 * 永久刪除清單及其所有關聯數據 (含 Storage 照片)
 */
export async function deleteManifest(manifestId: string): Promise<ArchiveResponse> {
  try {
    // 1. 獲取所有關聯項目的照片路徑
    const { data: items, error: itemsError } = await supabaseAdmin
      .from('drug_items')
      .select('photo_url')
      .eq('manifest_id', manifestId);

    if (itemsError) throw itemsError;

    // 2. 從 Storage 刪除照片
    const photosToDelete = items
      .map(item => item.photo_url)
      .filter((url): url is string => !!url)
      .map(url => {
        // 從 Public URL 提取路徑 (去掉 /storage/v1/object/public/bucket_name/)
        const urlObj = new URL(url);
        const pathWithBucket = urlObj.pathname.replace('/storage/v1/object/public/', '');
        const pathParts = pathWithBucket.split('/');
        // 移除第一部分 (儲存桶名稱)，保留剩餘路徑
        return pathParts.length > 1 ? pathParts.slice(1).join('/') : null;
      })
      .filter((path): path is string => !!path);

    if (photosToDelete.length > 0) {
      const { error: storageError } = await supabaseAdmin.storage
        .from('drug-photos')
        .remove(photosToDelete);
      
      if (storageError) console.error('Storage delete error:', storageError);
      // 即使照片刪除失敗也繼續刪除數據記錄
    }

    // 3. 刪除 Manifest (觸發 Cascade Delete 刪除 drug_items)
    const { error: deleteError } = await supabaseAdmin
      .from('manifests')
      .delete()
      .eq('id', manifestId);

    if (deleteError) throw deleteError;

    return { success: true };
  } catch (error: any) {
    console.error('Delete Manifest Error:', error);
    return { 
      success: false, 
      error: error.message || '刪除清單失敗' 
    };
  }
}
