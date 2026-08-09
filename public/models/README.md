# MobileSAM 模型檔案說明

此目錄需放置以下模型檔案（需自行從官方取得並轉換）：

## 所需檔案

1. **mobile_sam_encoder.onnx** (~35MB)
   - MobileSAM Image Encoder
   - 輸入: [1, 3, 1024, 1024] (RGB 影像)
   - 輸出: [1, 256, 64, 64] (Image Embedding)
   - 建議量化: INT8 或 FP16

2. **mobile_sam_decoder.onnx** (~4MB)
   - MobileSAM Mask Decoder
   - 輸入: image_embeddings, point_coords, point_labels, orig_im_size
   - 輸出: masks, iou_predictions, low_res_masks
   - 建議量化: INT8

## 取得方式

```bash
# 1. 從官方下載 PyTorch 權重
# https://github.com/ChaoningZhang/MobileSAM

# 2. 轉換為 ONNX
# 使用 export_onnx.py 腳本

# 3. 量化為 INT8 (可選，減小檔案大小)
# python -m onnxruntime.quantization.preprocess --input model.onnx --output model_preprocessed.onnx
# python -m onnxruntime.quantization.quantize_dynamic --input model_preprocessed.onnx --output model_int8.onnx

# 4. 複製到此目錄
cp mobile_sam_encoder.onnx public/models/
cp mobile_sam_decoder.onnx public/models/
```

## WASM 檔案

從 `node_modules/onnxruntime-web/dist/` 複製：
- `ort-wasm.wasm`
- `ort-wasm-simd.wasm`

```bash
cp node_modules/onnxruntime-web/dist/ort-wasm.wasm public/wasm/
cp node_modules/onnxruntime-web/dist/ort-wasm-simd.wasm public/wasm/
```