#!/usr/bin/env node
// 模型檔案驗證腳本
// 執行: node scripts/verify-models.js

import fs from 'fs';
import path from 'path';

const models = [
  { path: 'public/models/mobile_sam_encoder.onnx', minSize: 30 * 1024 * 1024, desc: 'MobileSAM Encoder (~35MB)' },
  { path: 'public/models/mobile_sam_decoder.onnx', minSize: 3 * 1024 * 1024, desc: 'MobileSAM Decoder (~4MB)' },
  { path: 'public/wasm/ort-wasm.wasm', minSize: 1 * 1024 * 1024, desc: 'ONNX Runtime WASM' },
  { path: 'public/wasm/ort-wasm-simd.wasm', minSize: 1 * 1024 * 1024, desc: 'ONNX Runtime WASM SIMD' },
];

let allPassed = true;

console.log('🔍 驗證模型檔案...\n');

for (const model of models) {
  const fullPath = path.resolve(model.path);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`❌ 缺少檔案: ${model.path}`);
    console.log(`   ${model.desc}`);
    allPassed = false;
    continue;
  }

  const stats = fs.statSync(fullPath);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
  
  if (stats.size < model.minSize) {
    console.log(`⚠️  檔案過小: ${model.path} (${sizeMB}MB, 預期 > ${(model.minSize/1024/1024).toFixed(1)}MB)`);
    console.log(`   ${model.desc} - 可能是 placeholder 或下載不完整`);
    allPassed = false;
  } else {
    console.log(`✅ ${model.path} (${sizeMB}MB)`);
    console.log(`   ${model.desc}`);
  }
}

console.log('\n' + '='.repeat(50));

if (allPassed) {
  console.log('✅ 所有模型檔案驗證通過！');
  process.exit(0);
} else {
  console.log('❌ 模型檔案驗證失敗，請依照 README.md 指示下載並放置正確檔案。');
  process.exit(1);
}