# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: query-rpc-fixed-test.spec.ts >> search_drugs_cross_manifest RPC 修復驗證 >> 核心功能驗證 (修復後) >> 條碼搜尋布洛芬應在 2 個清單中找到
- Location: tests\e2e\query-rpc-fixed-test.spec.ts:110:9

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 2
Received: 4
```

# Test source

```ts
  29  |         p_categories: null,
  30  |         p_date_from: null,
  31  |         p_date_to: null,
  32  |         p_manifest_status: ['active', 'archived'],
  33  |         p_counted_status: null,
  34  |         p_has_discrepancy: null,
  35  |         p_limit: 50,
  36  |         p_offset: 0
  37  |       });
  38  |       
  39  |       expect(error).toBeNull();
  40  |       expect(data).toBeDefined();
  41  |       expect(Array.isArray(data)).toBe(true);
  42  |       
  43  |       console.log(`✅ 修復後 RPC 返回 ${data.length} 筆結果`);
  44  |       
  45  |       // 修復後：應返回至少 12 筆測試記錄 (種子數據 10 + 2)
  46  |       expect(data.length).toBeGreaterThanOrEqual(12);
  47  |     });
  48  |     
  49  |     test('條碼搜尋阿司匹林應在 2+ 個清單中找到 (跨清單查詢核心功能)', async () => {
  50  |       const { data, error } = await supabaseAdmin.rpc('search_drugs_cross_manifest', {
  51  |         p_search_text: null,
  52  |         p_barcode: '4710000000001',
  53  |         p_product_code: null,
  54  |         p_storage_locations: null,
  55  |         p_categories: null,
  56  |         p_date_from: null,
  57  |         p_date_to: null,
  58  |         p_manifest_status: ['active', 'archived'],
  59  |         p_counted_status: null,
  60  |         p_has_discrepancy: null,
  61  |         p_limit: 50,
  62  |         p_offset: 0
  63  |       });
  64  |       
  65  |       expect(error).toBeNull();
  66  |       expect(data).toBeDefined();
  67  |       expect(Array.isArray(data)).toBe(true);
  68  |       
  69  |       console.log(`✅ 阿司匹林跨清單搜尋返回 ${data.length} 筆結果`);
  70  |       
  71  |       // 阿司匹林應該在 2 個清單中都有 (active + archived)
  72  |       expect(data.length).toBeGreaterThanOrEqual(2);
  73  |       
  74  |       // 驗證每筆都是阿司匹林
  75  |       data.forEach(item => {
  76  |         expect(item.barcode).toBe('4710000000001');
  77  |         expect(item.name).toBe('阿司匹林腸溶錠 100mg');
  78  |       });
  79  |     });
  80  |     
  81  |     test('關鍵字搜尋「阿司匹林」應正常運作', async () => {
  82  |       const { data, error } = await supabaseAdmin.rpc('search_drugs_cross_manifest', {
  83  |         p_search_text: '阿司匹林',
  84  |         p_barcode: null,
  85  |         p_product_code: null,
  86  |         p_storage_locations: null,
  87  |         p_categories: null,
  88  |         p_date_from: null,
  89  |         p_date_to: null,
  90  |         p_manifest_status: ['active', 'archived'],
  91  |         p_counted_status: null,
  92  |         p_has_discrepancy: null,
  93  |         p_limit: 50,
  94  |         p_offset: 0
  95  |       });
  96  |       
  97  |       expect(error).toBeNull();
  98  |       expect(data).toBeDefined();
  99  |       expect(Array.isArray(data)).toBe(true);
  100 |       expect(data.length).toBeGreaterThan(0);
  101 |       
  102 |       const hasAspirin = data.some((item: any) => 
  103 |         item.name.includes('阿司匹林') || item.barcode === '4710000000001'
  104 |       );
  105 |       expect(hasAspirin).toBe(true);
  106 |       
  107 |       console.log(`✅ 關鍵字搜尋「阿司匹林」返回 ${data.length} 筆結果`);
  108 |     });
  109 |     
  110 |     test('條碼搜尋布洛芬應在 2 個清單中找到', async () => {
  111 |       const { data, error } = await supabaseAdmin.rpc('search_drugs_cross_manifest', {
  112 |         p_search_text: null,
  113 |         p_barcode: '4710000000002',
  114 |         p_product_code: null,
  115 |         p_storage_locations: null,
  116 |         p_categories: null,
  117 |         p_date_from: null,
  118 |         p_date_to: null,
  119 |         p_manifest_status: ['active', 'archived'],
  120 |         p_counted_status: null,
  121 |         p_has_discrepancy: null,
  122 |         p_limit: 50,
  123 |         p_offset: 0
  124 |       });
  125 |       
  126 |       expect(error).toBeNull();
  127 |       expect(data).toBeDefined();
  128 |       expect(Array.isArray(data)).toBe(true);
> 129 |       expect(data.length).toBe(2); // 在兩個清單中都有
      |                           ^ Error: expect(received).toBe(expected) // Object.is equality
  130 |       
  131 |       data.forEach(item => {
  132 |         expect(item.barcode).toBe('4710000000002');
  133 |         expect(item.name).toBe('布洛芬錠 200mg');
  134 |       });
  135 |       
  136 |       console.log('✅ 條碼搜尋布洛芬正確返回 2 筆結果 (跨兩個清單)');
  137 |     });
  138 |     
  139 |     test('儲位 A1 篩選應正常運作', async () => {
  140 |       const { data, error } = await supabaseAdmin.rpc('search_drugs_cross_manifest', {
  141 |         p_search_text: null,
  142 |         p_barcode: null,
  143 |         p_product_code: null,
  144 |         p_storage_locations: ['A1'],
  145 |         p_categories: null,
  146 |         p_date_from: null,
  147 |         p_date_to: null,
  148 |         p_manifest_status: ['active', 'archived'],
  149 |         p_counted_status: null,
  150 |         p_has_discrepancy: null,
  151 |         p_limit: 50,
  152 |         p_offset: 0
  153 |       });
  154 |       
  155 |       expect(error).toBeNull();
  156 |       expect(data).toBeDefined();
  157 |       expect(Array.isArray(data)).toBe(true);
  158 |       
  159 |       const allA1 = data.every((item: any) => item.storage_location === 'A1');
  160 |       expect(allA1).toBe(true);
  161 |       
  162 |       console.log(`✅ 儲位 A1 篩選返回 ${data.length} 筆結果`);
  163 |     });
  164 |     
  165 |     test('類別西藥篩選應正常運作', async () => {
  166 |       const { data, error } = await supabaseAdmin.rpc('search_drugs_cross_manifest', {
  167 |         p_search_text: null,
  168 |         p_barcode: null,
  169 |         p_product_code: null,
  170 |         p_storage_locations: null,
  171 |         p_categories: ['西藥'],
  172 |         p_date_from: null,
  173 |         p_date_to: null,
  174 |         p_manifest_status: ['active', 'archived'],
  175 |         p_counted_status: null,
  176 |         p_has_discrepancy: null,
  177 |         p_limit: 50,
  178 |         p_offset: 0
  179 |       });
  180 |       
  181 |       expect(error).toBeNull();
  182 |       expect(data).toBeDefined();
  183 |       expect(Array.isArray(data)).toBe(true);
  184 |       
  185 |       const allWestern = data.every((item: any) => item.category === '西藥');
  186 |       expect(allWestern).toBe(true);
  187 |       
  188 |       console.log(`✅ 類別西藥篩選返回 ${data.length} 筆結果`);
  189 |     });
  190 |     
  191 |     test('只查詢 archived 清單應返回 2 筆 (種子數據)', async () => {
  192 |       const { data, error } = await supabaseAdmin.rpc('search_drugs_cross_manifest', {
  193 |         p_search_text: null,
  194 |         p_barcode: null,
  195 |         p_product_code: null,
  196 |         p_storage_locations: null,
  197 |         p_categories: null,
  198 |         p_date_from: null,
  199 |         p_date_to: null,
  200 |         p_manifest_status: ['archived'],
  201 |         p_counted_status: null,
  202 |         p_has_discrepancy: null,
  203 |         p_limit: 50,
  204 |         p_offset: 0
  205 |       });
  206 |       
  207 |       expect(error).toBeNull();
  208 |       expect(data).toBeDefined();
  209 |       expect(Array.isArray(data)).toBe(true);
  210 |       
  211 |       // Archived 清單有 2 筆 (種子數據)
  212 |       expect(data.length).toBe(2);
  213 |       
  214 |       console.log(`✅ 只查詢 archived 清單返回 ${data.length} 筆結果`);
  215 |     });
  216 |     
  217 |     test('已清點狀態篩選應正常運作', async () => {
  218 |       const { data, error } = await supabaseAdmin.rpc('search_drugs_cross_manifest', {
  219 |         p_search_text: null,
  220 |         p_barcode: null,
  221 |         p_product_code: null,
  222 |         p_storage_locations: null,
  223 |         p_categories: null,
  224 |         p_date_from: null,
  225 |         p_date_to: null,
  226 |         p_manifest_status: ['active', 'archived'],
  227 |         p_counted_status: 'completed',
  228 |         p_has_discrepancy: null,
  229 |         p_limit: 50,
```