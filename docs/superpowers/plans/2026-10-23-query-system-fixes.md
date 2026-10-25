# Query System Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix RPC function bug, create test authentication API, and improve E2E UI tests for query functionality

**Architecture:** Three independent but related fixes: 1) Database layer - fix search_drugs_cross_manifest RPC to correctly join manifests table, 2) Auth layer - add email/password login for test environment, 3) Test layer - update E2E tests to use new auth flow and validate UI with real data

**Tech Stack:** Next.js 16 (App Router), Supabase (PostgreSQL, Auth, RPC), Playwright, TypeScript

## Global Constraints

- All code in Traditional Chinese comments
- TypeScript strict mode, no `any` types
- Dark mode UI theme (#07142b background, #00f2fe accent)
- Follow existing migration naming convention (timestamped SQL files)
- Playwright tests use auth-state.json storage state
- Supabase RLS policies must remain intact

---

### Task 1: Fix search_drugs_cross_manifest RPC Function

**Files:**
- Create: `supabase/migrations/20261023000000_fix_search_drugs_cross_manifest_rpc.sql`
- Test: `tests/e2e/query-rpc-fixed-test.spec.ts`

**Interfaces:**
- Consumes: drug_items table (barcode, name, product_code, category, storage_location, expected_quantity, actual_quantity, counted_status, created_at, manifest_id)
- Consumes: manifests table (id, status)
- Produces: Fixed RPC returning correct cross-manifest search results with manifest status filtering

- [ ] **Step 1: Write failing test for RPC fix**

```sql
-- In migration file, first verify current buggy behavior
SELECT * FROM search_drugs_cross_manifest(
  NULL, NULL, NULL, NULL, NULL, NULL, NULL,
  ARRAY['active', 'archived'], NULL, NULL, 50, 0
);
-- Expected: 12 rows (our test data)
-- Actual: 0 rows due to `status = ANY(p_manifest_status)` on drug_items
```

- [ ] **Step 2: Create migration with fixed RPC**

```sql
-- supabase/migrations/20261023000000_fix_search_drugs_cross_manifest_rpc.sql
CREATE OR REPLACE FUNCTION public.search_drugs_cross_manifest(
  p_search_text TEXT DEFAULT NULL,
  p_barcode TEXT DEFAULT NULL,
  p_product_code TEXT DEFAULT NULL,
  p_storage_locations TEXT[] DEFAULT NULL,
  p_categories TEXT[] DEFAULT NULL,
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL,
  p_manifest_status TEXT[] DEFAULT NULL,
  p_counted_status TEXT DEFAULT NULL,
  p_has_discrepancy BOOLEAN DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE(
  id UUID,
  barcode TEXT,
  name TEXT,
  product_code TEXT,
  category TEXT,
  storage_location TEXT,
  expected_quantity NUMERIC,
  actual_quantity NUMERIC,
  counted_status TEXT,
  created_at TIMESTAMPTZ,
  manifest_id UUID
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    di.id::UUID,
    di.barcode,
    di.name,
    di.product_code,
    di.category,
    di.storage_location,
    di.expected_quantity::NUMERIC,
    di.actual_quantity::NUMERIC,
    di.counted_status,
    di.created_at::TIMESTAMPTZ,
    di.manifest_id::UUID
  FROM drug_items di
  JOIN manifests m ON di.manifest_id = m.id
  WHERE
    (p_search_text IS NULL OR 
      di.barcode ILIKE '%' || p_search_text || '%' 
      OR di.name ILIKE '%' || p_search_text || '%' 
      OR di.product_code ILIKE '%' || p_search_text || '%')
    AND (p_barcode IS NULL OR di.barcode = p_barcode)
    AND (p_product_code IS NULL OR di.product_code = p_product_code)
    AND (p_storage_locations IS NULL OR di.storage_location = ANY(p_storage_locations))
    AND (p_categories IS NULL OR di.category = ANY(p_categories))
    AND (p_date_from IS NULL OR di.created_at >= p_date_from)
    AND (p_date_to IS NULL OR di.created_at <= p_date_to)
    AND (p_manifest_status IS NULL OR m.status = ANY(p_manifest_status))
    AND (p_counted_status IS NULL OR di.counted_status = p_counted_status)
    AND (p_has_discrepancy IS NULL OR (di.actual_quantity - di.expected_quantity) != 0)
  ORDER BY di.created_at DESC
  LIMIT GREATEST(p_limit, 0) OFFSET GREATEST(p_offset, 0);
$$;

-- Grant execute to authenticated role
GRANT EXECUTE ON FUNCTION public.search_drugs_cross_manifest(...) TO authenticated;
```

- [ ] **Step 3: Apply migration and verify**

```bash
npx supabase db push
# or
npx supabase migration up
```

- [ ] **Step 4: Write verification test**

```typescript
// tests/e2e/query-rpc-fixed-test.spec.ts
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

test('Fixed RPC should return test data', async () => {
  const { data, error } = await supabaseAdmin.rpc('search_drugs_cross_manifest', {
    p_search_text: null,
    p_barcode: null,
    p_product_code: null,
    p_storage_locations: null,
    p_categories: null,
    p_date_from: null,
    p_date_to: null,
    p_manifest_status: ['active', 'archived'],
    p_counted_status: null,
    p_has_discrepancy: null,
    p_limit: 50,
    p_offset: 0
  });
  
  expect(error).toBeNull();
  expect(data).toBeDefined();
  expect(Array.isArray(data)).toBe(true);
  expect(data!.length).toBeGreaterThanOrEqual(12); // Our 12 test items
  
  // Verify specific searches work
  const { data: aspirin } = await supabaseAdmin.rpc('search_drugs_cross_manifest', {
    p_search_text: '阿司匹林',
    p_barcode: null, p_product_code: null, p_storage_locations: null,
    p_categories: null, p_date_from: null, p_date_to: null,
    p_manifest_status: ['active', 'archived'], p_counted_status: null,
    p_has_discrepancy: null, p_limit: 50, p_offset: 0
  });
  expect(aspirin!.length).toBeGreaterThanOrEqual(2); // Cross-manifest
});
```

- [ ] **Step 5: Run verification test and commit**

```bash
npx playwright test tests/e2e/query-rpc-fixed-test.spec.ts --headed
git add supabase/migrations/20261023000000_fix_search_drugs_cross_manifest_rpc.sql tests/e2e/query-rpc-fixed-test.spec.ts
git commit -m "fix: repair search_drugs_cross_manifest RPC join manifests table for status filter"
```

---

### Task 2: Create Test Authentication API Endpoint

**Files:**
- Create: `src/app/api/test-auth/login/route.ts`
- Create: `src/app/api/test-auth/logout/route.ts`
- Modify: `src/app/login/page.tsx` (add dev-only email/password form)
- Modify: `tests/e2e/auth.setup.ts` (use new test auth API)
- Test: `tests/e2e/test-auth-api.spec.ts`

**Interfaces:**
- Consumes: Supabase Admin client with service role key
- Produces: HTTP endpoints that create proper Supabase sessions for test users
- Produces: Updated auth.setup.ts using API-based login flow

- [ ] **Step 1: Write failing test for test auth API**

```typescript
// tests/e2e/test-auth-api.spec.ts
import { test, expect } from '@playwright/test';

test('Test auth API should create valid session', async ({ request }) => {
  const response = await request.post('/api/test-auth/login', {
    data: { email: 'test-user@pharmacy.local', password: 'TestPassword123!' }
  });
  
  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(body.session).toBeDefined();
  expect(body.session.access_token).toBeTruthy();
  expect(body.session.refresh_token).toBeTruthy();
  expect(body.user).toBeDefined();
});
```

- [ ] **Step 2: Create test auth login API**

```typescript
// src/app/api/test-auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

// Only allow in development/test environment
const isTestEnv = process.env.NODE_ENV !== 'production';

export async function POST(request: NextRequest) {
  if (!isTestEnv) {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  try {
    const { email, password } = await request.json();
    
    // Use Admin client to verify credentials and create session
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Sign in with password (validates credentials)
    const supabaseUser = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    
    const { data, error } = await supabaseUser.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    // Create response with proper cookies for SSR
    const response = NextResponse.json({
      session: data.session,
      user: data.user
    });

    // Set auth cookies that work with @supabase/ssr
    if (data.session) {
      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        path: '/',
        maxAge: 60 * 60 * 24 * 7 // 1 week
      };
      
      response.cookies.set(
        `sb-${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0]}-auth-token`,
        JSON.stringify(data.session),
        cookieOptions
      );
    }

    return response;
  } catch (error) {
    console.error('Test auth login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create test auth logout API**

```typescript
// src/app/api/test-auth/logout/route.ts
import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ success: true });
  
  // Clear auth cookies
  const cookieNames = [
    'sb-auth-token',
    'sb-refresh-token'
  ];
  
  cookieNames.forEach(name => {
    response.cookies.set(name, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0
    });
  });
  
  return response;
}
```

- [ ] **Step 4: Add dev-only email/password form to login page**

```tsx
// src/app/login/page.tsx - Add inside LoginForm component
{/* Dev/Test Environment Only - Email/Password Login */}
{process.env.NODE_ENV !== 'production' && (
  <div className="mt-6 pt-6 border-t border-white/10">
    <h3 className="text-sm font-medium text-white/60 mb-4">
      開發環境測試登入
    </h3>
    <form onSubmit={handleTestLogin} className="space-y-3">
      <div>
        <label htmlFor="test-email" className="block text-sm text-white/70 mb-1">
          Email
        </label>
        <input
          id="test-email"
          type="email"
          name="email"
          defaultValue="test-user@pharmacy.local"
          className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#00f2fe] focus:border-transparent"
        />
      </div>
      <div>
        <label htmlFor="test-password" className="block text-sm text-white/70 mb-1">
          Password
        </label>
        <input
          id="test-password"
          type="password"
          name="password"
          defaultValue="TestPassword123!"
          className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#00f2fe] focus:border-transparent"
        />
      </div>
      <button
        type="submit"
        className="w-full py-2 px-4 bg-[#00f2fe]/20 border border-[#00f2fe] text-[#00f2fe] rounded-xl font-medium hover:bg-[#00f2fe]/30 transition-colors active:scale-95"
      >
        測試帳號登入
      </button>
    </form>
  </div>
)}
```

- [ ] **Step 5: Update auth.setup.ts to use API login**

```typescript
// tests/e2e/auth.setup.ts
import { test as setup } from '@playwright/test';

const TEST_USER = {
  email: 'test-user@pharmacy.local',
  password: 'TestPassword123!'
};

setup('authenticate via test API and save storage state', async ({ page }) => {
  // Use API to login (works with SSR cookies)
  const response = await page.request.post('/api/test-auth/login', {
    data: TEST_USER
  });
  
  expect(response.ok()).toBe(true);
  const { session, user } = await response.json();
  
  // Navigate to app and verify session
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  
  // Verify we're logged in by checking query page
  await page.goto('/query');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  
  const bodyText = await page.locator('body').textContent();
  expect(bodyText).not.toContain('請先登入');
  
  // Save storage state
  await page.context().storageState({ path: 'tests/e2e/auth-state.json' });
  
  console.log('✅ Test auth via API successful');
});
```

- [ ] **Step 6: Run test and commit**

```bash
npx playwright test tests/e2e/test-auth-api.spec.ts --headed
npx playwright test tests/e2e/auth.setup.ts --headed
git add src/app/api/test-auth/ src/app/login/page.tsx tests/e2e/auth.setup.ts tests/e2e/test-auth-api.spec.ts
git commit -m "feat: add test authentication API for E2E testing"
```

---

### Task 3: Improve E2E UI Tests with Real Authentication

**Files:**
- Modify: `tests/e2e/query-real-test.spec.ts` (update to use new auth, fix selectors)
- Create: `tests/e2e/query-ui-comprehensive.spec.ts` (new comprehensive test)
- Test: `tests/e2e/query-ui-comprehensive.spec.ts`

**Interfaces:**
- Consumes: Fixed RPC (Task 1), Test auth API (Task 2), auth-state.json
- Produces: Passing UI tests for search, filter, tabs, responsive, panel

- [ ] **Step 1: Write comprehensive UI test with fixed selectors**

```typescript
// tests/e2e/query-ui-comprehensive.spec.ts
import { test, expect } from '@playwright/test';

test.use({ storageState: 'tests/e2e/auth-state.json' });

async function waitForQueryPage(page) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  
  // Check for login prompt
  const bodyText = await page.locator('body').textContent();
  if (bodyText?.includes('請先登入')) {
    throw new Error('Not authenticated - auth-state.json invalid');
  }
  
  // Wait for key elements
  await Promise.race([
    page.waitForSelector('h1:has-text("藥品查詢系統")', { timeout: 15000 }).catch(() => null),
    page.waitForSelector('input[placeholder="條碼、品名、製造廠代碼..."]', { timeout: 15000 }).catch(() => null),
  ]);
}

async function checkResultsVisible(page) {
  const table = page.locator('table').first();
  const noResults = page.locator('text=無搜尋結果').first();
  await Promise.race([
    table.waitFor({ state: 'visible', timeout: 10000 }).catch(() => null),
    noResults.waitFor({ state: 'visible', timeout: 10000 }).catch(() => null),
  ]);
}

test.describe('Query Page UI - Full Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/query');
    await waitForQueryPage(page);
  });

  test('Basic UI elements visible', async ({ page }) => {
    await expect(page.locator('h1:has-text("藥品查詢系統")')).toBeVisible();
    await expect(page.locator('button:has-text("藥品搜尋")')).toBeVisible();
    await expect(page.locator('button:has-text("歷史記錄")')).toBeVisible();
    await expect(page.locator('button:has-text("趨勢分析")')).toBeVisible();
    await expect(page.locator('button:has-text("報表儀表板")')).toBeVisible();
    await expect(page.locator('input[placeholder="條碼、品名、製造廠代碼..."]')).toBeVisible();
    await checkResultsVisible(page);
  });

  test('Keyword search works', async ({ page }) => {
    const input = page.locator('input[placeholder="條碼、品名、製造廠代碼..."]').first();
    await input.fill('阿司匹林');
    await input.press('Enter');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await checkResultsVisible(page);
  });

  test('Barcode search works', async ({ page }) => {
    const input = page.locator('input[placeholder="條碼、品名、製造廠代碼..."]').first();
    await input.fill('4710000000002');
    await input.press('Enter');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await checkResultsVisible(page);
  });

  test('Tab switching works', async ({ page }) => {
    const tabs = ['歷史記錄', '趨勢分析', '報表儀表板', '藥品搜尋'];
    for (const tabName of tabs) {
      await page.locator(`button:has-text("${tabName}")`).first().click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
    }
  });

  test('Reset filter works', async ({ page }) => {
    const input = page.locator('input[placeholder="條碼、品名、製造廠代碼..."]').first();
    await input.fill('測試');
    await input.press('Enter');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const resetBtn = page.locator('button:has-text("重置")').first();
    await resetBtn.waitFor({ state: 'visible', timeout: 10000 });
    await resetBtn.click();
    await page.waitForTimeout(1000);
    
    await expect(input).toHaveValue('');
  });

  test('Export button visible and clickable', async ({ page }) => {
    const exportBtn = page.locator('button:has-text("匯出結果")').first();
    await exportBtn.waitFor({ state: 'visible', timeout: 10000 });
    await expect(exportBtn).toBeVisible();
    
    page.on('dialog', dialog => dialog.accept());
    await exportBtn.click();
  });
});

test.describe('Responsive Design', () => {
  test.use({ storageState: 'tests/e2e/auth-state.json' });

  test('Desktop layout', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/query');
    await waitForQueryPage(page);
    await expect(page.locator('aside').first()).toBeVisible();
  });

  test('Mobile layout', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/query');
    await waitForQueryPage(page);
    await expect(page.locator('button:has-text("藥品搜尋")')).toBeVisible();
  });

  test('Tablet layout', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/query');
    await waitForQueryPage(page);
    await checkResultsVisible(page);
  });
});

test.describe('Left Panel Filters (Desktop)', () => {
  test.use({ storageState: 'tests/e2e/auth-state.json' });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/query');
    await waitForQueryPage(page);
  });

  test('Storage location filter', async ({ page }) => {
    const btn = page.locator('aside button:has-text("A1")').first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(500);
      const applyBtn = page.locator('aside button:has-text("套用篩選")').first();
      if (await applyBtn.isVisible().catch(() => false)) {
        await applyBtn.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);
      }
    }
    await checkResultsVisible(page);
  });

  test('Category filter', async ({ page }) => {
    const expandBtn = page.locator('aside button:has-text("展開進階篩選")').first();
    if (await expandBtn.isVisible().catch(() => false)) {
      await expandBtn.click();
      await page.waitForTimeout(500);
    }
    
    const catBtn = page.locator('aside button:has-text("西藥")').first();
    if (await catBtn.isVisible().catch(() => false)) {
      await catBtn.click();
      await page.waitForTimeout(500);
      const applyBtn = page.locator('aside button:has-text("套用篩選")').first();
      if (await applyBtn.isVisible().catch(() => false)) {
        await applyBtn.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);
      }
    }
    await checkResultsVisible(page);
  });

  test('Panel reset', async ({ page }) => {
    const input = page.locator('input[placeholder="條碼、品名、製造廠代碼..."]').first();
    await input.fill('測試');
    await input.press('Enter');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const expandBtn = page.locator('aside button:has-text("展開進階篩選")').first();
    if (await expandBtn.isVisible().catch(() => false)) {
      await expandBtn.click();
      await page.waitForTimeout(500);
    }
    
    const storageBtn = page.locator('aside button:has-text("A1")').first();
    if (await storageBtn.isVisible().catch(() => false)) {
      await storageBtn.click();
      await page.waitForTimeout(500);
    }
    
    const resetBtn = page.locator('aside button:has-text("重置")').first();
    if (await resetBtn.isVisible().catch(() => false)) {
      await resetBtn.click();
      await page.waitForTimeout(1000);
      await expect(input).toHaveValue('');
    }
    await checkResultsVisible(page);
  });
});
```

- [ ] **Step 2: Run comprehensive UI tests**

```bash
# First regenerate auth state with new API
npx playwright test tests/e2e/auth.setup.ts --headed

# Then run UI tests
npx playwright test tests/e2e/query-ui-comprehensive.spec.ts --headed
```

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/query-ui-comprehensive.spec.ts tests/e2e/query-real-test.spec.ts
git commit -m "test: comprehensive query UI tests with real auth flow"
```

---

## Execution Order

1. **Task 1** (RPC fix) - Independent, run first
2. **Task 2** (Test auth API) - Independent, can run in parallel with Task 1
3. **Task 3** (UI tests) - Depends on Task 1 & 2, run last

## Verification Checklist

After all tasks complete:
- [ ] `search_drugs_cross_manifest` returns 12+ test records
- [ ] Cross-manifest search finds 阿司匹林 in both active and archived manifests
- [ ] Test auth API returns valid session with cookies
- [ ] Playwright auth.setup.ts generates valid auth-state.json
- [ ] All query UI tests pass (search, filter, tabs, responsive, panel)
- [ ] No console errors in test runs

---

**Plan saved to:** `docs/superpowers/plans/2026-10-23-query-system-fixes.md`

**Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks
- REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development

**2. Inline Execution** - Execute tasks in this session using executing-plans
- REQUIRED SUB-SKILL: Use superpowers:executing-plans

**Which approach?**