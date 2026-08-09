#!/usr/bin/env node
// 模型檔案驗證腳本
// 執行: node scripts/verify-models.js

import fs from 'fs';
import path from 'path';

function getTotalModelSize(basePath) {
    let totalSize = 0;
    const mainFile = path.resolve(basePath);
    if (fs.existsSync(mainFile)) {
        totalSize += fs.statSync(mainFile).size;
    }
    // 檢查外部資料檔案 (.data)
    const dataFile = mainFile + '.data';
    if (fs.existsSync(dataFile)) {
        totalSize += fs.statSync(dataFile).size;
    }
    return totalSize;
}

const models = [
    { path: 'public/models/mobile_sam_encoder.onnx', minSize: 5 * 1024 * 1024, desc: 'MobileSAM Encoder (test model ~10MB, production ~35MB)' },
    { path: 'public/models/mobile_sam_decoder.onnx', minSize: 3 * 1024 * 1024, desc: 'MobileSAM Decoder (~4MB)' },
    { path: 'public/wasm/ort-wasm.wasm', minSize: 1 * 1024 * 1024, desc: 'ONNX Runtime WASM' },
    { path: 'public/wasm/ort-wasm-simd.wasm', minSize: 1 * 1024 * 1024, desc: 'ONNX Runtime WASM SIMD' },
];

let allPassed = true;

console.log('=== Verify Model Files ===\n');

for (const model of models) {
    const fullPath = path.resolve(model.path);
    
    if (!fs.existsSync(fullPath)) {
        console.log(`[MISSING] ${model.path}`);
        console.log(`   ${model.desc}`);
        allPassed = false;
        continue;
    }

    const totalSize = getTotalModelSize(model.path);
    const sizeMB = (totalSize / 1024 / 1024).toFixed(1);
    
    if (totalSize < model.minSize) {
        console.log(`[WARN] File too small: ${model.path} (${sizeMB}MB, expected > ${(model.minSize/1024/1024).toFixed(1)}MB)`);
        console.log(`   ${model.desc} - may be placeholder or incomplete`);
        allPassed = false;
    } else {
        console.log(`[OK] ${model.path} (${sizeMB}MB)`);
        console.log(`   ${model.desc}`);
    }
}

console.log('\n' + '='.repeat(50));

if (allPassed) {
    console.log('All model files verified!');
    process.exit(0);
} else {
    console.log('Model verification failed. Please follow README.md to download and place correct files.');
    process.exit(1);
}