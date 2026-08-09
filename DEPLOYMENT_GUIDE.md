# PhamaCount Web - 生產環境部署指南

## 📋 部署前檢查清單

- [ ] Git 儲存庫已推送到 GitHub/GitLab (含 LFS 檔案)
- [ ] Vercel 專案已建立並連結儲存庫
- [ ] 環境變數已在 Vercel 設定
- [ ] MobileSAM 模型檔案已放置

---

## 1. MobileSAM 模型檔案準備 (必要)

### 選項 A：從官方 PyTorch 轉換 (推薦)

```bash
# 1. Clone 官方 repo
git clone https://github.com/ChaoningZhang/MobileSAM.git
cd MobileSAM

# 2. 下載 checkpoint
# 從 https://github.com/ChaoningZhang/MobileSAM/releases/tag/v1.0 下載 mobile_sam.pt
# 放置於 MobileSAM 專案根目錄

# 3. 安裝依賴
pip install torch onnx onnxruntime opencv-python

# 4. 執行官方 export 腳本
python export_onnx.py --checkpoint mobile_sam.pt

# 5. 複製產生的檔案到 PhamaCount 專案
cp mobile_sam_encoder.onnx /path/to/pharmacy/public/models/
cp mobile_sam_decoder.onnx /path/to/pharmacy/public/models/
```

### 選項 B：量化模型 (減小檔案、加快推論)

```bash
# 安裝量化工具
pip install onnxruntime onnx

# 量化 Encoder (35MB -> ~10MB)
python -m onnxruntime.quantization.quantize_dynamic \
  --input public/models/mobile_sam_encoder.onnx \
  --output public/models/mobile_sam_encoder_int8.onnx \
  --weight_type QInt8

# 量化 Decoder (4MB -> ~1.5MB)
python -m onnxruntime.quantization.quantize_dynamic \
  --input public/models/mobile_sam_decoder.onnx \
  --output public/models/mobile_sam_decoder_int8.onnx \
  --weight_type QInt8

# 替換原檔案
mv public/models/mobile_sam_encoder_int8.onnx public/models/mobile_sam_encoder.onnx
mv public/models/mobile_sam_decoder_int8.onnx public/models/mobile_sam_decoder.onnx
```

### 選項 C：使用現成 ONNX (若有)

若您有現成的 MobileSAM ONNX 模型，直接放置：
```
public/models/mobile_sam_encoder.onnx  (~35MB 或量化後 ~10MB)
public/models/mobile_sam_decoder.onnx  (~4MB 或量化後 ~1.5MB)
```

---

## 2. 驗證模型檔案

```bash
npm run verify:models
```

預期輸出：
```
✅ public/models/mobile_sam_encoder.onnx (34.2MB)
✅ public/models/mobile_sam_decoder.onnx (3.8MB)
✅ public/wasm/ort-wasm.wasm (12.9MB)
✅ public/wasm/ort-wasm-simd.wasm (12.9MB)
```

---

## 3. Git LFS 設定與推送

```bash
# 1. 安裝 Git LFS (已完成)
git lfs install

# 2. 追蹤大型檔案 (已完成)
git lfs track "public/models/*.onnx"
git lfs track "public/wasm/*.wasm"

# 3. 確認 .gitattributes
cat .gitattributes
# 應包含:
# public/models/*.onnx filter=lfs diff=lfs merge=lfs -text
# public/wasm/*.wasm filter=lfs diff=lfs merge=lfs -text

# 4. 加入並提交
git add .gitattributes public/models/ public/wasm/
git commit -m "chore: add model files with LFS"

# 5. 推送到遠端 (需支援 LFS 的 Git hosting)
git push origin main
```

> **注意**: GitHub/GitLab 預設支援 LFS。推送大檔案可能需要幾分鐘。

---

## 4. Vercel 專案設定

### 4.1 建立專案

1. 進入 [Vercel Dashboard](https://vercel.com/dashboard)
2. 點擊 "Add New..." → "Project"
3. 選擇 Git 儲存庫 → Import
4. Framework Preset: **Next.js** (自動偵測)
5. 點擊 "Deploy"

### 4.2 環境變數 (Settings → Environment Variables)

| 變數名稱 | 值 | 環境 |
|----------|-----|------|
| `NEXT_PUBLIC_SITE_URL` | `https://your-domain.vercel.app` | Production, Preview |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxx.supabase.co` | All |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` | All |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | Production only |

### 4.3 啟用 Git LFS (重要)

Vercel 專案設定 → Git → **Enable Git LFS** → Save

---

## 5. 執行部署

### 自動部署 (推薦)
推送到 `main` 分支即可觸發：
1. GitHub Actions CI/CD (Lint → Build → E2E → Deploy)
2. Vercel 自動建置並部署

### 手動部署
```bash
# 安裝 Vercel CLI
npm i -g vercel

# 登入
vercel login

# 部署 Preview
vercel

# 部署 Production
vercel --prod
```

---

## 6. 部署後驗收

### 6.1 基本功能
- [ ] 首頁載入正常
- [ ] 登入/註冊流程正常
- [ ] `/manifests` 清單頁面正常

### 6.2 AI 計數功能 (關鍵)
- [ ] 進入 `/scan?manifestId=xxx`
- [ ] Header 右上角顯示齒輪圖示 ⚙️
- [ ] 點擊齒輪 → 彈出「啟用 AI 計數模式」
- [ ] 勾選後顯示模式：`🟢 WebGPU` (Chrome/Edge) 或 `🟡 CPU (WASM)` (Firefox/Safari)
- [ ] 點擊藥品「拍照確認」→ 選擇測試照片
- [ ] 等待「AI 模型分析中...」完成
- [ ] 點擊相片上的藥物 → 出現綠色 Mask + 數字 ①②③
- [ ] 底部顯示「AI 偵測顆粒數: N 顆」
- [ ] 右鍵/長按可刪除誤判
- [ ] 點擊「採用 AI 結果」→ Modal 關閉 → `actual_quantity` 更新

### 6.3 離線測試
- [ ] 正常載入並啟用 AI 模式
- [ ] Chrome DevTools → Network → Offline
- [ ] 重新整理頁面
- [ ] AI 設定仍可開啟，**不顯示「載入中...」**
- [ ] 拍照流程完全可用

### 6.4 多裝置測試
| 裝置/瀏覽器 | 預期模式 | 驗收 |
|-------------|----------|------|
| Chrome Desktop | 🟢 WebGPU | ☐ |
| Edge Desktop | 🟢 WebGPU | ☐ |
| Firefox Desktop | 🟡 CPU (WASM) | ☐ |
| Safari macOS | 🟡 CPU (WASM) | ☐ |
| Chrome Android | 🟢 WebGPU | ☐ |
| Safari iOS | 🟡 CPU (WASM) | ☐ |

---

## 7. 常見問題排查

### 模型檔案 404
```bash
# 確認檔案存在
ls -la public/models/

# 確認 Git LFS 已拉取
git lfs pull

# 確認 Vercel 建置日誌包含模型複製
```

### WebGPU 不工作
- 確認瀏覽器支援：Chrome 113+, Edge 113+
- 檢查 Console 是否有 `WebGPU 不支援，降級 WASM+SIMD` 訊息
- WASM 模式下 Decoder < 80ms 仍可接受

### 記憶體不足 (OOM)
- iOS Safari 限制 ~250MB
- 確認量化模型 (INT8) 已使用
- 避免連續快速拍照，間隔 2-3 秒

### Service Worker 未註冊
- 確認 `next.config.ts` 有 `withPWA` 設定
- 檢查 `public/sw.js` 存在
- Production build 才會註冊 SW (`npm run build && npm run start`)

---

## 8. 監控與維護

### 效能監控
- Vercel Analytics: 啟用 Web Vitals
- Console 記憶體監控 (開發環境已內建)

### 模型更新
```bash
# 1. 取得新版模型
# 2. 替換 public/models/*.onnx
# 3. 提交並推送 (LFS 會處理大檔案)
git add public/models/
git commit -m "feat: update MobileSAM model v1.1"
git push origin main
# CI/CD 自動部署，SW 會自動快取新版
```

### 日誌查看
- Vercel Functions Logs: Dashboard → Functions
- Edge Network Logs: Dashboard → Logs

---

## 9. 緊急回滾

```bash
# Vercel Dashboard → Deployments → 選擇前一版本 → Promote to Production
# 或 CLI:
vercel rollback [deployment-url] --token=$VERCEL_TOKEN
```

---

## 📞 支援管道

- **技術文件**: `docs/ai-counting-user-guide.md`
- **測試清單**: `docs/ai-counting-manual-test-checklist.md`
- **設計規格**: `docs/superpowers/specs/2026-08-09-mobile-sam-integration-design.md`
- **GitHub Issues**: 專案 Issues 頁面