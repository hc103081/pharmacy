import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function updateManifests() {
  // 找出所有有 photo_url 的 manifest
  const { data: items, error: queryError } = await supabase
    .from('drug_items')
    .select('manifest_id')
    .not('photo_url', 'is', null);

  if (queryError) {
    console.error('查詢失敗:', queryError);
    process.exit(1);
  }

  const manifestIds = [...new Set(items?.map(i => i.manifest_id) || [])];
  console.log('需要更新的 manifest 數量:', manifestIds.length);

  // 批次更新
  const { error } = await supabase
    .from('manifests')
    .update({ storage_provider: 'b2' })
    .in('id', manifestIds);

  if (error) {
    console.error('更新失敗:', error);
    process.exit(1);
  }
  
  console.log('✅ manifests.storage_provider 更新完成');
}

updateManifests();