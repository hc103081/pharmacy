'use server';

import { parseManifestDate } from '@/lib/folderUtils';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { ManifestFolder, Manifest } from '@/types';

export interface BreadcrumbItem {
  id: string;
  name: string;
  parent_id: string | null;
}

export interface FolderCounts {
  itemCount: number;
  subfolderCount: number;
}

export interface AiOrganizeSuggestion {
  manifestId: string;
  manifestName: string;
  orderNumber?: string;
  sourceDate: string;
  targetPath: string[]; // ['2026年', '10月', '26日']
}

/** 取得當前已驗證使用者 ID */
async function getCurrentUserId(): Promise<string | null> {
  try {
    const supabaseServer = await createClient();
    const { data: { user }, error } = await supabaseServer.auth.getUser();
    if (error || !user) return null;
    return user.id;
  } catch {
    return null;
  }
}

/**
 * 取得指定目錄層級下的資料夾列表與統計資訊
 * 若 parentId 為 null / undefined，代表根目錄
 */
export async function getFolders(parentId: string | null = null): Promise<{
  success: boolean;
  folders?: ManifestFolder[];
  unclassifiedCount?: number;
  error?: string;
}> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: '未登入或登入已過期' };
    }

    const admin = getSupabaseAdmin();

    // 1. 查詢該層級的資料夾
    let query = admin
      .from('manifest_folders')
      .select('*')
      .eq('user_id', userId);

    if (parentId) {
      query = query.eq('parent_id', parentId);
    } else {
      query = query.is('parent_id', null);
    }

    const { data: foldersData, error: foldersError } = await query.order('name', { ascending: true });

    if (foldersError) {
      // 容錯防護：若資料庫尚未建立 manifest_folders 資料表
      if (foldersError.code === 'PGRST205' || foldersError.message?.includes('manifest_folders')) {
        console.warn('[getFolders] manifest_folders table not found. Graceful fallback.');
        return { success: true, folders: [], unclassifiedCount: 0 };
      }
      console.error('[getFolders] Error fetching folders:', foldersError);
      return { success: false, error: '讀取資料夾失敗' };
    }

    // 2. 統計每個資料夾中的清單數量與子資料夾數量
    const foldersWithCounts: ManifestFolder[] = await Promise.all(
      (foldersData || []).map(async (folder) => {
        // 清單數
        const { count: itemCount } = await admin
          .from('manifests')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('folder_id', folder.id);

        // 子資料夾數
        const { count: subfolderCount } = await admin
          .from('manifest_folders')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('parent_id', folder.id);

        return {
          ...folder,
          item_count: itemCount || 0,
          subfolder_count: subfolderCount || 0,
        };
      })
    );

    // 3. 若為根目錄，統計「未分類」清單數量 (folder_id is null)
    let unclassifiedCount = 0;
    if (!parentId) {
      try {
        const { count, error: countErr } = await admin
          .from('manifests')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .is('folder_id', null);
        if (!countErr) {
          unclassifiedCount = count || 0;
        }
      } catch {
        unclassifiedCount = 0;
      }
    }

    return {
      success: true,
      folders: foldersWithCounts,
      unclassifiedCount,
    };
  } catch (err: any) {
    console.error('[getFolders] Exception:', err);
    return { success: false, error: err.message || '取得資料夾清單時發生例外' };
  }
}

/**
 * 取得完整的路徑導航（Breadcrumb）節點陣列
 * 由指定資料夾往上回溯直到根目錄
 */
export async function getBreadcrumbPath(folderId: string | null): Promise<{
  success: boolean;
  breadcrumbs: BreadcrumbItem[];
  error?: string;
}> {
  if (!folderId) {
    return { success: true, breadcrumbs: [] };
  }

  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, breadcrumbs: [], error: '未登入或登入已過期' };
    }

    const admin = getSupabaseAdmin();
    const breadcrumbs: BreadcrumbItem[] = [];
    let currentId: string | null = folderId;

    while (currentId) {
      const res: any = await admin
        .from('manifest_folders')
        .select('id, name, parent_id')
        .eq('id', currentId)
        .eq('user_id', userId)
        .single();

      if (res.error || !res.data) break;

      breadcrumbs.unshift({
        id: res.data.id,
        name: res.data.name,
        parent_id: res.data.parent_id,
      });

      currentId = res.data.parent_id;
    }

    return { success: true, breadcrumbs };
  } catch (err: any) {
    console.error('[getBreadcrumbPath] Exception:', err);
    return { success: false, breadcrumbs: [], error: err.message || '取得路徑失敗' };
  }
}

/**
 * 取得完整樹狀結構（供移動彈窗 Folder Picker 使用）
 */
export async function getFolderTree(): Promise<{
  success: boolean;
  folders?: ManifestFolder[];
  error?: string;
}> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: '未登入或登入已過期' };
    }

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('manifest_folders')
      .select('*')
      .eq('user_id', userId)
      .order('name', { ascending: true });

    if (error) {
      if (error.code === 'PGRST205' || error.message?.includes('manifest_folders')) {
        return { success: true, folders: [] };
      }
      return { success: false, error: '無法讀取資料夾目錄樹' };
    }

    return { success: true, folders: data || [] };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * 建立新資料夾
 */
export async function createFolder(
  name: string,
  parentId: string | null = null,
  folderType: 'system_date' | 'custom' = 'custom'
): Promise<{ success: boolean; folder?: ManifestFolder; error?: string }> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: '未登入或登入已過期' };
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      return { success: false, error: '資料夾名稱不可為空' };
    }

    const admin = getSupabaseAdmin();

    // 檢查同層級是否有名稱重複
    let duplicateCheck = admin
      .from('manifest_folders')
      .select('id')
      .eq('user_id', userId)
      .eq('name', trimmedName);

    if (parentId) {
      duplicateCheck = duplicateCheck.eq('parent_id', parentId);
    } else {
      duplicateCheck = duplicateCheck.is('parent_id', null);
    }

    const { data: existing, error: dupError } = await duplicateCheck.maybeSingle();
    if (dupError) {
      if (dupError.code === 'PGRST205' || dupError.message?.includes('manifest_folders')) {
        return {
          success: false,
          error: '雲端資料庫尚未執行 Migration 030（尚未建立 manifest_folders 資料表）',
        };
      }
    }

    if (existing) {
      return { success: false, error: '同層級已存在相同名稱的資料夾' };
    }

    const { data, error } = await admin
      .from('manifest_folders')
      .insert({
        user_id: userId,
        name: trimmedName,
        parent_id: parentId,
        folder_type: folderType,
      })
      .select('*')
      .single();

    if (error) {
      console.error('[createFolder] Error:', error);
      if (error.code === 'PGRST205' || error.message?.includes('manifest_folders')) {
        return {
          success: false,
          error: '雲端資料庫尚未執行 Migration 030（尚未建立 manifest_folders 資料表）',
        };
      }
      return { success: false, error: error.message || '建立資料夾失敗' };
    }

    return { success: true, folder: data };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * 重新命名資料夾
 */
export async function renameFolder(
  folderId: string,
  newName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: '未登入或登入已過期' };
    }

    const trimmedName = newName.trim();
    if (!trimmedName) {
      return { success: false, error: '資料夾名稱不可為空' };
    }

    const admin = getSupabaseAdmin();

    const { error } = await admin
      .from('manifest_folders')
      .update({ name: trimmedName, updated_at: new Date().toISOString() })
      .eq('id', folderId)
      .eq('user_id', userId);

    if (error) {
      return { success: false, error: '重新命名失敗' };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * 刪除資料夾
 * 資料庫已設置 ON DELETE CASCADE (子資料夾) 與 ON DELETE SET NULL (清單退回未分類)
 */
export async function deleteFolder(folderId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: '未登入或登入已過期' };
    }

    const admin = getSupabaseAdmin();

    const { error } = await admin
      .from('manifest_folders')
      .delete()
      .eq('id', folderId)
      .eq('user_id', userId);

    if (error) {
      return { success: false, error: '刪除資料夾失敗' };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * 批次移動清單到指定資料夾
 * 若 targetFolderId 為 null，代表移出至「未分類」
 */
export async function moveManifestsToFolder(
  manifestIds: string[],
  targetFolderId: string | null
): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    if (!manifestIds || manifestIds.length === 0) {
      return { success: true, count: 0 };
    }

    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: '未登入或登入已過期' };
    }

    const admin = getSupabaseAdmin();

    // 若指定了 targetFolderId，驗證目標資料夾所有權
    if (targetFolderId) {
      const { data: folder, error: folderError } = await admin
        .from('manifest_folders')
        .select('id')
        .eq('id', targetFolderId)
        .eq('user_id', userId)
        .single();

      if (folderError || !folder) {
        return { success: false, error: '找不到指定的目標資料夾' };
      }
    }

    const { error } = await admin
      .from('manifests')
      .update({ folder_id: targetFolderId })
      .in('id', manifestIds)
      .eq('user_id', userId);

    if (error) {
      console.error('[moveManifestsToFolder] Error:', error);
      if (error.code === '42703' || error.message?.includes('folder_id')) {
        return {
          success: false,
          error: '雲端資料庫尚未執行 Migration 030（manifests 表缺少 folder_id 欄位）',
        };
      }
      return { success: false, error: '移動清單失敗' };
    }

    return { success: true, count: manifestIds.length };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * AI 智慧分類：掃描所有尚未分類的清單並產出推薦歸檔階層
 */
export async function analyzeAndSuggestFolders(): Promise<{
  success: boolean;
  suggestions?: AiOrganizeSuggestion[];
  totalUnclassified?: number;
  error?: string;
}> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: '未登入或登入已過期' };
    }

    const admin = getSupabaseAdmin();

    // 取得所有未分類清單 (folder_id is null)
    let unclassifiedList: Manifest[] = [];
    const { data: unclassified, error } = await admin
      .from('manifests')
      .select('*')
      .eq('user_id', userId)
      .is('folder_id', null)
      .order('created_at', { ascending: false });

    if (error) {
      // 容錯防護：若資料庫尚未新增 folder_id 欄位，自動 fallback 讀取該用戶所有清單
      if (error.code === '42703' || error.message?.includes('folder_id')) {
        console.warn('[analyzeAndSuggestFolders] folder_id column missing, fallback to all manifests');
        const { data: allData, error: allErr } = await admin
          .from('manifests')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });
        if (allErr) {
          return { success: false, error: '無法讀取清單資料' };
        }
        unclassifiedList = allData || [];
      } else {
        console.error('[analyzeAndSuggestFolders] Error:', error);
        return { success: false, error: '無法讀取未分類清單' };
      }
    } else {
      unclassifiedList = unclassified || [];
    }

    const suggestions: AiOrganizeSuggestion[] = unclassifiedList.map((m) => {
      const { year, month, day, dateStr } = parseManifestDate(m);
      return {
        manifestId: m.id,
        manifestName: m.name,
        orderNumber: m.order_number,
        sourceDate: dateStr,
        targetPath: [year, month, day],
      };
    });

    return {
      success: true,
      suggestions,
      totalUnclassified: unclassifiedList.length,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * 一鍵套用 AI 智慧分類建議
 * 自動依序建立所需的 年/月/日 資料夾，並將清單批次移入
 */
export async function applyAiOrganization(
  suggestions: AiOrganizeSuggestion[]
): Promise<{ success: boolean; appliedCount?: number; createdFoldersCount?: number; error?: string }> {
  try {
    if (!suggestions || suggestions.length === 0) {
      return { success: true, appliedCount: 0, createdFoldersCount: 0 };
    }

    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: '未登入或登入已過期' };
    }

    const admin = getSupabaseAdmin();

    // 1. 取得現有所有資料夾建立快取 Map
    const { data: allFolders, error: foldersErr } = await admin
      .from('manifest_folders')
      .select('*')
      .eq('user_id', userId);

    if (foldersErr) {
      if (foldersErr.code === 'PGRST205' || foldersErr.message?.includes('manifest_folders')) {
        return {
          success: false,
          error: '雲端資料庫尚未執行 Migration 030（尚未建立 manifest_folders 資料表）',
        };
      }
      return { success: false, error: '讀取現有資料夾失敗' };
    }

    const folderMap = new Map<string, string>(); // Key: `${parentId || 'root'}::${name}`, Value: id
    (allFolders || []).forEach((f: any) => {
      folderMap.set(`${f.parent_id || 'root'}::${f.name}`, f.id);
    });

    let createdFoldersCount = 0;

    // 輔助函式：取得或建立資料夾
    async function getOrCreateFolder(name: string, parentId: string | null): Promise<string> {
      const key = `${parentId || 'root'}::${name}`;
      if (folderMap.has(key)) {
        return folderMap.get(key)!;
      }

      // 資料庫建立
      const { data: newFolder, error } = await admin
        .from('manifest_folders')
        .insert({
          user_id: userId,
          name,
          parent_id: parentId,
          folder_type: 'system_date',
        })
        .select('id')
        .single();

      if (error || !newFolder) {
        throw new Error(`無法建立資料夾 ${name}: ${error?.message}`);
      }

      folderMap.set(key, newFolder.id);
      createdFoldersCount++;
      return newFolder.id;
    }

    // 2. 逐一處理歸檔
    let appliedCount = 0;

    for (const item of suggestions) {
      const [yearName, monthName, dayName] = item.targetPath;

      // 建立/尋找 Year 資料夾
      const yearId = await getOrCreateFolder(yearName, null);
      // 建立/尋找 Month 資料夾
      const monthId = await getOrCreateFolder(monthName, yearId);
      // 建立/尋找 Day 資料夾
      const dayId = await getOrCreateFolder(dayName, monthId);

      // 移動清單至 Day 資料夾
      const { error: updateError } = await admin
        .from('manifests')
        .update({ folder_id: dayId })
        .eq('id', item.manifestId)
        .eq('user_id', userId);

      if (!updateError) {
        appliedCount++;
      }
    }

    return {
      success: true,
      appliedCount,
      createdFoldersCount,
    };
  } catch (err: any) {
    console.error('[applyAiOrganization] Error:', err);
    return { success: false, error: err.message };
  }
}
