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
