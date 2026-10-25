# 測試數據管理指南

## 📊 測試數據概覽

### 測試數據結構
```typescript
// 測試數據包含以下主要部分：
1. 用戶數據 - 測試用戶帳號
2. 清單數據 - 藥品清單記錄
3. 藥品數據 - 藥品基本信息
4. 歷史數據 - 跨清單查詢記錄
5. 篩選數據 - 各種篩選條件
```

### 測試數據腳本
```bash
# 測試數據腳本位置
scripts/seed-test-data.ts

# 測試數據文件
tests/e2e/auth-state.json
```

## 🛠️ 測試數據生成

### 1. 數據生成腳本
```typescript
// scripts/seed-test-data.ts
export async function seedTestData() {
  // 1. 創建測試用戶
  const testUser = await createTestUser();
  
  // 2. 創建測試清單
  const manifests = await createTestManifests(testUser.id);
  
  // 3. 創建藥品項目
  const drugItems = await createTestDrugItems(manifests);
  
  // 4. 創建歷史數據
  const historyData = await createTestHistory(manifests, drugItems);
  
  return { testUser, manifests, drugItems, historyData };
}
```

### 2. 數據生成命令
```bash
# 生成測試數據
npm run seed-test-data

# 清理並重新生成測試數據
npm run seed-test-data -- --clean
```

## 📋 測試數據詳情

### 1. 用戶數據
```json
{
  "id": "c1950b9d-d217-454b-8bec-2d2d98a8a25d",
  "email": "test-user@pharmacy.local",
  "password": "TestPassword123!",
  "name": "測試用戶",
  "created_at": "2024-10-23T00:00:00Z"
}
```

### 2. 清單數據
```json
[
  {
    "id": "1",
    "name": "2024年10月藥品清單",
    "status": "active",
    "created_at": "2024-10-23T00:00:00Z",
    "updated_at": "2024-10-23T00:00:00Z"
  },
  {
    "id": "2", 
    "name": "2024年9月藥品清單",
    "status": "active",
    "created_at": "2024-09-23T00:00:00Z",
    "updated_at": "2024-09-23T00:00:00Z"
  },
  {
    "id": "3",
    "name": "2024年8月藥品清單", 
    "status": "archived",
    "created_at": "2024-08-23T00:00:00Z",
    "updated_at": "2024-08-23T00:00:00Z"
  }
]
```

### 3. 藥品數據
```json
[
  {
    "barcode": "1234567890123",
    "product_code": "ASP001",
    "name": "阿司匹林100mg錠劑",
    "storage_location": "A-01-01",
    "category": "止痛藥"
  },
  {
    "barcode": "2345678901234",
    "product_code": "PAR002", 
    "name": "對乙醯氨基酚500mg錠劑",
    "storage_location": "A-01-02",
    "category": "退燒藥"
  },
  {
    "barcode": "3456789012345",
    "product_code": "IBU003",
    "name": "布洛芬400mg錠劑", 
    "storage_location": "B-02-01",
    "category": "消炎藥"
  }
]
```

### 4. 歷史數據
```json
[
  {
    "manifest_id": "1",
    "manifest_name": "2024年10月藥品清單",
    "page_number": 1,
    "expected": 100,
    "actual": 95,
    "status": "counted",
    "counted_at": "2024-10-23T10:00:00Z"
  },
  {
    "manifest_id": "2", 
    "manifest_name": "2024年9月藥品清單",
    "page_number": 1,
    "expected": 100,
    "actual": 105,
    "status": "counted",
    "counted_at": "2024-09-23T10:00:00Z"
  }
]
```

## 🔧 數據管理工具

### 1. 數據驗證腳本
```typescript
// scripts/validate-test-data.ts
export async function validateTestData() {
  // 驗證測試數據完整性
  const testData = await seedTestData();
  
  // 檢查用戶是否存在
  const userExists = await checkUserExists(testData.testUser.id);
  
  // 檢查清單數量
  const manifestsCount = await countManifests();
  
  // 檢查藥品數量
  const drugItemsCount = await countDrugItems();
  
  return { userExists, manifestsCount, drugItemsCount };
}
```

### 2. 數據清理腳本
```typescript
// scripts/cleanup-test-data.ts
export async function cleanupTestData() {
  // 清理測試數據
  await cleanupDrugItems();
  await cleanupManifests();
  await cleanupUsers();
  
  console.log('測試數據已清理');
}
```

## 📊 測試數據使用

### 1. 在測試中使用數據
```typescript
// tests/e2e/query-ui-comprehensive.spec.ts
test('Keyword search works', async ({ page }) => {
  const testData = await getTestData();
  
  // 使用測試數據進行搜測試
  await page.fill('input[placeholder="條碼、品名、製造廠代碼..."]', testData.drugItems[0].name);
  await page.click('button:has-text("搜尋")');
  
  // 驗證結果
  await expect(page.locator('.result-item')).toBeVisible();
});
```

### 2. 數據驅動測試
```typescript
// tests/e2e/data-driven-test.spec.ts
const testData = [
  { keyword: '阿司匹林', expectedCount: 2 },
  { keyword: '對乙醯氨基酚', expectedCount: 1 },
  { keyword: '布洛芬', expectedCount: 1 }
];

test.describe('Data-driven search tests', () => {
  testData.forEach(({ keyword, expectedCount }) => {
    test(`Search for "${keyword}" should return ${expectedCount} results`, async ({ page }) => {
      await page.fill('input[placeholder="條碼、品名、製造廠代碼..."]', keyword);
      await page.click('button:has-text("搜尋")');
      
      const results = await page.locator('.result-item').count();
      expect(results).toBe(expectedCount);
    });
  });
});
```

## 🔍 數據質量保證

### 1. 數據完整性檢查
```typescript
// scripts/data-integrity-check.ts
export async function checkDataIntegrity() {
  // 檢查外鍵關聯
  const orphanedItems = await findOrphanedDrugItems();
  const orphanedHistory = await findOrphanedHistory();
  
  // 檢查數據一致性
  const inconsistentData = await findInconsistentData();
  
  return { orphanedItems, orphanedHistory, inconsistentData };
}
```

### 2. 數據更新腳本
```typescript
// scripts/update-test-data.ts
export async function updateTestData() {
  // 更新測試數據
  await updateDrugItems();
  await updateManifests();
  await updateHistory();
  
  console.log('測試數據已更新');
}
```

## 🚀 數據管理最佳實踐

### 1. 數據版本控制
```bash
# 使用 Git 管理測試數據腳本
git add scripts/seed-test-data.ts
git commit -m "更新測試數據"

# 使用 Git 管理測試數據文件
git add tests/e2e/auth-state.json
git commit -m "更新認證狀態"
```

### 2. 數據重用策略
```typescript
// tests/e2e/shared-data.ts
export const sharedTestData = {
  user: {
    id: 'c1950b9d-d217-454b-8bec-2d2d98a8a25d',
    email: 'test-user@pharmacy.local'
  },
  drugs: [
    { barcode: '1234567890123', name: '阿司匹林' },
    { barcode: '2345678901234', name: '對乙醯氨基酚' }
  ]
};

// 在測試中共享數據
export function useSharedTestData() {
  return sharedTestData;
}
```

### 3. 數據隱私保護
```typescript
// scripts/anonymize-test-data.ts
export async function anonymizeTestData() {
  // 匿名化測試數據
  await anonymizeUsers();
  await anonymizeManifests();
  await anonymizeDrugItems();
  
  console.log('測試數據已匿名化');
}
```

## 📈 數據分析

### 1. 數據統計
```typescript
// scripts/data-stats.ts
export async function getDataStats() {
  const stats = {
    users: await countUsers(),
    manifests: await countManifests(),
    drugItems: await countDrugItems(),
    history: await countHistory()
  };
  
  return stats;
}
```

### 2. 數據趨勢分析
```typescript
// scripts/data-trends.ts
export async function getDataTrends() {
  const trends = {
    drugItemsGrowth: await calculateDrugItemsGrowth(),
    manifestsCreated: await calculateManifestsCreated(),
    historyAccuracy: await calculateHistoryAccuracy()
  };
  
  return trends;
}
```

## 🔗 相關資源

- [測試架構文檔](./architecture.md)
- [測試執行指南](./execution-guide.md)
- [環境配置指南](../../README.md)

---

*最後更新: 2026-10-25*  
*版本: 1.0*  
**維護者: PhamaCount Web 開發團隊**