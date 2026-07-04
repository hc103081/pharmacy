# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests\e2e\dual-barcode.spec.ts >> 雙條碼匯入與匹配
- Location: tests\e2e\dual-barcode.spec.ts:3:5

# Error details

```
Error: page.evaluate: TypeError: Failed to execute 'fetch' on 'Window': Failed to parse URL from /api/test-import
    at eval (eval at evaluate (:302:30), <anonymous>:5:24)
    at UtilityScript.evaluate (<anonymous>:304:16)
    at UtilityScript.<anonymous> (<anonymous>:1:44)
```