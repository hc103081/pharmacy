import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// 載入環境變數
config({ path: '.env.local' });

// 使用 Service Role Key 創建管理員客戶端
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

async function seedTestData() {
  console.log('🌱 開始插入測試數據...');
  
  try {
    // 1. 獲取測試用戶 ID
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
    const testUser = users.find(u => u.email === 'test-user@pharmacy.local');
    
    if (!testUser) {
      console.error('❌ 找不到測試用戶');
      return;
    }
    
    const userId = testUser.id;
    console.log(`✅ 找到測試用戶: ${userId}`);
    
    // 2. 創建測試清單 - 使用正確的欄位
    const manifestData = {
      user_id: userId,
      name: '測試清單 2024-10-22',
      order_number: 'TEST-20241022-001',
      delivery_date: new Date().toISOString().split('T')[0],
      source_file: 'test-manifest.csv',
      total_items: 10,
      status: 'active',
      source_images: [],
      conclusion_type: 'pending'
    };
    
    const { data: manifest, error: manifestError } = await supabaseAdmin
      .from('manifests')
      .insert(manifestData)
      .select()
      .single();
    
    if (manifestError) {
      console.error('❌ 創建清單失敗:', manifestError);
      return;
    }
    
    console.log(`✅ 創建清單: ${manifest.id}`);
    
    // 3. 插入測試藥品項目 - 只使用資料表實際存在的欄位
    const testDrugs = [
      {
        manifest_id: manifest.id,
        page_number: 1,
        item_order: 1,
        barcode: '4710000000001',
        product_code: 'PC001',
        name: '阿司匹林腸溶錠 100mg',
        category: '西藥',
        storage_location: 'A1',
        expected_quantity: 100,
        actual_quantity: 100,
        counted_status: 'completed'
      },
      {
        manifest_id: manifest.id,
        page_number: 1,
        item_order: 2,
        barcode: '4710000000002',
        product_code: 'PC002',
        name: '布洛芬錠 200mg',
        category: '西藥',
        storage_location: 'A1',
        expected_quantity: 50,
        actual_quantity: 48,
        counted_status: 'completed'
      },
      {
        manifest_id: manifest.id,
        page_number: 1,
        item_order: 3,
        barcode: '4710000000003',
        product_code: 'PC003',
        name: '對乙醯氨基酚錠 500mg',
        category: '西藥',
        storage_location: 'A2',
        expected_quantity: 80,
        actual_quantity: 80,
        counted_status: 'completed'
      },
      {
        manifest_id: manifest.id,
        page_number: 1,
        item_order: 4,
        barcode: '4710000000004',
        product_code: 'PC004',
        name: '維生素C錠 500mg',
        category: '保健品',
        storage_location: 'B1',
        expected_quantity: 120,
        actual_quantity: 118,
        counted_status: 'completed'
      },
      {
        manifest_id: manifest.id,
        page_number: 1,
        item_order: 5,
        barcode: '4710000000005',
        product_code: 'PC005',
        name: '益生菌膠囊',
        category: '保健品',
        storage_location: 'B2',
        expected_quantity: 60,
        actual_quantity: 60,
        counted_status: 'pending'
      },
      {
        manifest_id: manifest.id,
        page_number: 1,
        item_order: 6,
        barcode: '4710000000006',
        product_code: 'PC006',
        name: '三合一感冒糖漿',
        category: '西藥',
        storage_location: 'A3',
        expected_quantity: 30,
        actual_quantity: 28,
        counted_status: 'completed'
      },
      {
        manifest_id: manifest.id,
        page_number: 1,
        item_order: 7,
        barcode: '4710000000007',
        product_code: 'PC007',
        name: '胃藥懸浮液',
        category: '西藥',
        storage_location: 'A2',
        expected_quantity: 40,
        actual_quantity: 40,
        counted_status: 'completed'
      },
      {
        manifest_id: manifest.id,
        page_number: 1,
        item_order: 8,
        barcode: '4710000000008',
        product_code: 'PC008',
        name: '膠囊型益生菌',
        category: '保健品',
        storage_location: 'B1',
        expected_quantity: 90,
        actual_quantity: 88,
        counted_status: 'completed'
      },
      {
        manifest_id: manifest.id,
        page_number: 1,
        item_order: 9,
        barcode: '4710000000009',
        product_code: 'PC009',
        name: '鈣質錠',
        category: '保健品',
        storage_location: 'B3',
        expected_quantity: 150,
        actual_quantity: 150,
        counted_status: 'completed'
      },
      {
        manifest_id: manifest.id,
        page_number: 1,
        item_order: 10,
        barcode: '4710000000010',
        product_code: 'PC010',
        name: '魚油軟膠囊',
        category: '保健品',
        storage_location: 'B2',
        expected_quantity: 70,
        actual_quantity: 70,
        counted_status: 'completed'
      }
    ];
    
    const { error: itemsError } = await supabaseAdmin
      .from('drug_items')
      .insert(testDrugs);
    
    if (itemsError) {
      console.error('❌ 插入藥品項目失敗:', itemsError);
      return;
    }
    
    console.log(`✅ 插入 ${testDrugs.length} 筆測試藥品項目`);
    
    // 4. 創建第二個清單用於測試跨清單查詢
    const manifestData2 = {
      user_id: userId,
      name: '測試清單 2024-10-21',
      order_number: 'TEST-20241021-001',
      delivery_date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
      source_file: 'test-manifest-2.csv',
      total_items: 2,
      status: 'archived',
      source_images: [],
      conclusion_type: 'normal'
    };
    
    const { data: manifest2, error: manifestError2 } = await supabaseAdmin
      .from('manifests')
      .insert(manifestData2)
      .select()
      .single();
    
    if (manifestError2) {
      console.error('❌ 創建第二個清單失敗:', manifestError2);
    } else {
      console.log(`✅ 創建第二個清單: ${manifest2.id}`);
      
      // 為第二個清單插入一些相同藥品的歷史數據
      const testDrugs2 = [
        {
          manifest_id: manifest2.id,
          page_number: 1,
          item_order: 1,
          barcode: '4710000000001',
          product_code: 'PC001',
          name: '阿司匹林腸溶錠 100mg',
          category: '西藥',
          storage_location: 'A1',
          expected_quantity: 100,
          actual_quantity: 95,
          counted_status: 'completed'
        },
        {
          manifest_id: manifest2.id,
          page_number: 1,
          item_order: 2,
          barcode: '4710000000002',
          product_code: 'PC002',
          name: '布洛芬錠 200mg',
          category: '西藥',
          storage_location: 'A1',
          expected_quantity: 50,
          actual_quantity: 50,
          counted_status: 'completed'
        }
      ];
      
      await supabaseAdmin
        .from('drug_items')
        .insert(testDrugs2);
      
      console.log(`✅ 為第二個清單插入 ${testDrugs2.length} 筆歷史藥品項目`);
    }
    
    console.log('🎉 測試數據插入完成！');
    
  } catch (error) {
    console.error('💥 插入測試數據過程發生錯誤:', error);
  }
}

seedTestData().then(() => {
  console.log('🏁 腳本執行完成');
  process.exit(0);
}).catch((error) => {
  console.error('💥 腳本執行失敗:', error);
  process.exit(1);
});