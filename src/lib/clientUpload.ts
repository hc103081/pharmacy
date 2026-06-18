import { createClient } from '@/lib/supabase/client';

/**
 * 從客戶端（瀏覽器）直接上傳圖片至 Supabase Storage 的 import_screenshots bucket。
 * 繞過 Vercel Serverless Function 的請求體大小限制 (4.5MB)。
 *
 * @param files - 要上傳的 File / Blob 陣列
 * @returns 上傳後的公開 URL 陣列
 */
export async function clientUploadImportImages(files: (File | Blob)[]): Promise<{ urls: string[] }> {
  const supabase = createClient();
  const urls: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const ext = file instanceof File ? file.name.split('.').pop() || 'jpg' : 'jpg';
    const contentType = file.type || 'image/jpeg';
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}-${i}.${ext}`;

    const { error } = await supabase.storage
      .from('import_screenshots')
      .upload(fileName, file, {
        contentType,
        upsert: true,
      });

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from('import_screenshots')
      .getPublicUrl(fileName);

    urls.push(publicUrl);
  }

  return { urls };
}