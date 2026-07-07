'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { dataUriToBlob } from '@/lib/base64';

/**
 * 共用工具：將 Base64 Data URI 陣列轉為 Blob 並上傳至 Supabase Storage (import_screenshots bucket)
 * 供 pdfParser.ts (PDF 匯入) 與未來 server-side 上傳需求共用
 *
 * @param dataUris - Base64 Data URI 陣列 (如 "data:image/jpeg;base64,/9j/4AAQ...")
 * @returns 上傳後的公開 URL 陣列
 */
export async function uploadMergedImages(dataUris: string[]): Promise<{ urls: string[] }> {
  const supabase = getSupabaseAdmin();
  const urls: string[] = [];

  // 轉換 Data URI 為 Blob
  const blobs: Blob[] = dataUris.map(uri => dataUriToBlob(uri));

  for (let i = 0; i < blobs.length; i++) {
    const blob = blobs[i];
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}-${i}.jpg`;

    const { error } = await supabase.storage
      .from('import_screenshots')
      .upload(fileName, blob, {
        contentType: 'image/jpeg',
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