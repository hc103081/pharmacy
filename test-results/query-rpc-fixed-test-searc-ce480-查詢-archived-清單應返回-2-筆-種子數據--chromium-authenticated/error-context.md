# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: query-rpc-fixed-test.spec.ts >> search_drugs_cross_manifest RPC 修復驗證 >> 核心功能驗證 (修復後) >> 只查詢 archived 清單應返回 2 筆 (種子數據)
- Location: tests\e2e\query-rpc-fixed-test.spec.ts:191:9

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 2
Received: 4
```

# Test source

```ts
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
  129 |       expect(data.length).toBe(2); // 在兩個清單中都有
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
> 212 |       expect(data.length).toBe(2);
      |                           ^ Error: expect(received).toBe(expected) // Object.is equality
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
  230 |         p_offset: 0
  231 |       });
  232 |       
  233 |       expect(error).toBeNull();
  234 |       expect(data).toBeDefined();
  235 |       expect(Array.isArray(data)).toBe(true);
  236 |       
  237 |       const allCompleted = data.every((item: any) => item.counted_status === 'completed');
  238 |       expect(allCompleted).toBe(true);
  239 |       
  240 |       console.log(`✅ 已清點狀態篩選返回 ${data.length} 筆結果`);
  241 |     });
  242 |     
  243 |     test('有差異項目篩選應正常運作', async () => {
  244 |       const { data, error } = await supabaseAdmin.rpc('search_drugs_cross_manifest', {
  245 |         p_search_text: null,
  246 |         p_barcode: null,
  247 |         p_product_code: null,
  248 |         p_storage_locations: null,
  249 |         p_categories: null,
  250 |         p_date_from: null,
  251 |         p_date_to: null,
  252 |         p_manifest_status: ['active', 'archived'],
  253 |         p_counted_status: null,
  254 |         p_has_discrepancy: 1,
  255 |         p_limit: 50,
  256 |         p_offset: 0
  257 |       });
  258 |       
  259 |       expect(error).toBeNull();
  260 |       expect(data).toBeDefined();
  261 |       expect(Array.isArray(data)).toBe(true);
  262 |       
  263 |       const allDiscrepancy = data.every((item: any) => 
  264 |         (item.actual_quantity || 0) !== (item.expected_quantity || 0)
  265 |       );
  266 |       expect(allDiscrepancy).toBe(true);
  267 |       
  268 |       console.log(`✅ 有差異項目篩選返回 ${data.length} 筆結果`);
  269 |     });
  270 |     
  271 |     test('分頁功能應正常運作 (使用 id 作為次要排序確保穩定)', async () => {
  272 |       const { data: page1, error: error1 } = await supabaseAdmin.rpc('search_drugs_cross_manifest', {
  273 |         p_search_text: null,
  274 |         p_barcode: null,
  275 |         p_product_code: null,
  276 |         p_storage_locations: null,
  277 |         p_categories: null,
  278 |         p_date_from: null,
  279 |         p_date_to: null,
  280 |         p_manifest_status: ['active', 'archived'],
  281 |         p_counted_status: null,
  282 |         p_has_discrepancy: null,
  283 |         p_limit: 5,
  284 |         p_offset: 0
  285 |       });
  286 |       
  287 |       expect(error1).toBeNull();
  288 |       expect(page1).toBeDefined();
  289 |       expect(page1.length).toBe(5);
  290 |       
  291 |       const { data: page2, error: error2 } = await supabaseAdmin.rpc('search_drugs_cross_manifest', {
  292 |         p_search_text: null,
  293 |         p_barcode: null,
  294 |         p_product_code: null,
  295 |         p_storage_locations: null,
  296 |         p_categories: null,
  297 |         p_date_from: null,
  298 |         p_date_to: null,
  299 |         p_manifest_status: ['active', 'archived'],
  300 |         p_counted_status: null,
  301 |         p_has_discrepancy: null,
  302 |         p_limit: 5,
  303 |         p_offset: 5
  304 |       });
  305 |       
  306 |       expect(error2).toBeNull();
  307 |       expect(page2).toBeDefined();
  308 |       expect(page2.length).toBe(5);
  309 |       
  310 |       // 確保不重複 (使用 id 比對)
  311 |       const page1Ids = page1.map((item: any) => item.id);
  312 |       const page2Ids = page2.map((item: any) => item.id);
```