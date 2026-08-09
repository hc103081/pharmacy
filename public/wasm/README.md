# WASM 檔案說明

此目錄需放置 ONNX Runtime Web 的 WASM 檔案：

## 所需檔案

1. **ort-wasm.wasm** (~1-2MB)
   - 基礎 WASM 執行檔

2. **ort-wasm-simd.wasm** (~2-3MB)
   - 支援 SIMD 指令集的 WASM 執行檔（效能較好）

## 取得方式

```bash
# 從 node_modules 複製
cp node_modules/onnxruntime-web/dist/ort-wasm.wasm public/wasm/
cp node_modules/onnxruntime-web/dist/ort-wasm-simd.wasm public/wasm/
```