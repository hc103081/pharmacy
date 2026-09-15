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

async function checkDuplicates() {
  // 檢查 drug_items 中 photo_url 是否有重複
  const { data: items, error } = await supabase
    .from('drug_items')
    .select('id, manifest_id, photo_url, storage_provider')
    .not('photo_url', 'is', null)
    .eq('storage_provider', 'b2');

  if (error) { console.error(error); return; }

  console.log('總筆數:', items?.length);

  // 按 photo_url 分組檢查重複
  const urlCount = new Map<string, number>();
  items?.forEach(item => {
    const count = urlCount.get(item.photo_url) || 0;
    urlCount.set(item.photo_url, count + 1);
  });

  const duplicates = [...urlCount.entries()].filter(([, count]) => count > 1);
  console.log('重複 photo_url 數量:', duplicates.length);
  if (duplicates.length > 0) {
    console.log('重複範例:', duplicates.slice(0, 5));
  }

  // 檢查 manifest 照片數
  const { data: manifests } = await supabase
    .from('manifests')
    .select('id, name, storage_provider');
  console.log('Manifests:', manifests?.map(m => ({ id: m.id.slice(0,8), provider: m.storage_provider })));
}

checkDuplicates();