#!/usr/bin/env python3
"""
MobileSAM 模型下載與 ONNX 轉換腳本
用法: python scripts/download_and_convert_models.py
"""

import os
import sys
import subprocess
import urllib.request
from pathlib import Path

# 專案路徑
PROJECT_ROOT = Path(__file__).parent.parent
MODELS_DIR = PROJECT_ROOT / "public" / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

# 模型下載來源 (按優先順序)
MODEL_SOURCES = [
    {
        "name": "GitHub Release (官方)",
        "encoder": "https://github.com/ChaoningZhang/MobileSAM/releases/download/v1.0/mobile_sam_encoder.onnx",
        "decoder": "https://github.com/ChaoningZhang/MobileSAM/releases/download/v1.0/mobile_sam_decoder.onnx",
    },
    {
        "name": "Hugging Face (需 token)",
        "encoder": "https://huggingface.co/spaces/abhishek/mobile_sam/resolve/main/mobile_sam_encoder.onnx",
        "decoder": "https://huggingface.co/spaces/abhishek/mobile_sam/resolve/main/mobile_sam_decoder.onnx",
    },
    {
        "name": "ONNX Model Zoo (社群版)",
        "encoder": "https://github.com/onnx/models/raw/main/vision/body_analysis/mobile_sam/model/mobile_sam_encoder.onnx",
        "decoder": "https://github.com/onnx/models/raw/main/vision/body_analysis/mobile_sam/model/mobile_sam_decoder.onnx",
    },
]

def download_file(url: str, dest: Path, description: str) -> bool:
    """下載檔案並顯示進度"""
    print(f"\n📥 下載 {description}...")
    print(f"   來源: {url}")
    print(f"   目標: {dest}")
    
    try:
        def show_progress(block_num, block_size, total_size):
            if total_size > 0:
                percent = min(100, (block_num * block_size * 100) // total_size)
                mb_done = (block_num * block_size) / (1024 * 1024)
                mb_total = total_size / (1024 * 1024)
                sys.stdout.write(f"\r   進度: {percent}% ({mb_done:.1f}/{mb_total:.1f} MB)")
                sys.stdout.flush()
        
        urllib.request.urlretrieve(url, dest, show_progress)
        print(f"\n✅ {description} 下載完成 ({dest.stat().st_size / 1024 / 1024:.1f} MB)")
        return True
    except Exception as e:
        print(f"\n❌ 下載失敗: {e}")
        return False

def convert_pytorch_to_onnx():
    """從 PyTorch checkpoint 轉換 ONNX (需本地有 mobile_sam.pt)"""
    print("\n🔄 嘗試從 PyTorch 轉換 ONNX...")
    
    checkpoint_path = MODELS_DIR / "mobile_sam.pt"
    if not checkpoint_path.exists():
        print("⚠️  找不到 mobile_sam.pt，跳過 PyTorch 轉換")
        print(f"   請從 {GITHUB_RELEASE} 下載並放置至 {checkpoint_path}")
        return False
    
    try:
        # 動態 import 避免依賴問題
        import torch
        sys.path.insert(0, str(PROJECT_ROOT))
        
        # 這裡需要 MobileSAM 的模型定義
        # 建議使用官方 export 腳本
        print("   請使用官方 export 腳本:")
        print("   cd MobileSAM && python export_onnx.py --checkpoint mobile_sam.pt")
        return False
    except ImportError:
        print("⚠️  未安裝 torch，跳過 PyTorch 轉換")
        return False

def quantize_onnx(model_path: Path, output_path: Path) -> bool:
    """量化 ONNX 模型為 INT8"""
    print(f"\n🔧 量化 {model_path.name} 為 INT8...")
    try:
        import onnx
        from onnxruntime.quantization import quantize_dynamic, QuantType
        
        quantize_dynamic(
            model_input=str(model_path),
            model_output=str(output_path),
            weight_type=QuantType.QInt8
        )
        print(f"✅ 量化完成: {output_path} ({output_path.stat().st_size / 1024 / 1024:.1f} MB)")
        return True
    except ImportError:
        print("⚠️  未安裝 onnxruntime.quantization，跳過量化")
        print("   安裝: pip install onnxruntime onnx")
        return False
    except Exception as e:
        print(f"❌ 量化失敗: {e}")
        return False

def verify_models() -> bool:
    """驗證模型檔案"""
    print("\n🔍 驗證模型檔案...")
    
    encoder_path = MODELS_DIR / "mobile_sam_encoder.onnx"
    decoder_path = MODELS_DIR / "mobile_sam_decoder.onnx"
    
    all_ok = True
    
    for path, min_size_mb, name in [
        (encoder_path, 30, "Encoder"),
        (decoder_path, 3, "Decoder"),
    ]:
        if not path.exists():
            print(f"❌ 缺少 {name}: {path}")
            all_ok = False
        else:
            size_mb = path.stat().st_size / 1024 / 1024
            if size_mb < min_size_mb:
                print(f"⚠️  {name} 可能不完整: {size_mb:.1f} MB (預期 > {min_size_mb} MB)")
            else:
                print(f"✅ {name}: {size_mb:.1f} MB")
    
    return all_ok

def main():
    print("=" * 60)
    print("MobileSAM 模型準備腳本")
    print("=" * 60)
    
    encoder_path = MODELS_DIR / "mobile_sam_encoder.onnx"
    decoder_path = MODELS_DIR / "mobile_sam_decoder.onnx"
    
    # 1. 嘗試從多個來源下載
    for source in MODEL_SOURCES:
        if encoder_path.exists() and decoder_path.exists():
            break
            
        print(f"\n🔄 嘗試來源: {source['name']}")
        
        if not encoder_path.exists():
            download_file(source["encoder"], encoder_path, f"Encoder ({source['name']})")
        
        if not decoder_path.exists():
            download_file(source["decoder"], decoder_path, f"Decoder ({source['name']})")
    
    # 2. 如果下載的檔案過大，嘗試量化
    if encoder_path.exists() and encoder_path.stat().st_size > 50 * 1024 * 1024:
        print("\n📦 Encoder 檔案較大，嘗試量化...")
        quantized_encoder = MODELS_DIR / "mobile_sam_encoder_int8.onnx"
        if quantize_onnx(encoder_path, quantized_encoder):
            encoder_path.unlink()
            quantized_encoder.rename(encoder_path)
    
    if decoder_path.exists() and decoder_path.stat().st_size > 10 * 1024 * 1024:
        print("\n📦 Decoder 檔案較大，嘗試量化...")
        quantized_decoder = MODELS_DIR / "mobile_sam_decoder_int8.onnx"
        if quantize_onnx(decoder_path, quantized_decoder):
            decoder_path.unlink()
            quantized_decoder.rename(decoder_path)
    
    # 3. 驗證
    if verify_models():
        print("\n" + "=" * 60)
        print("✅ 所有模型檔案準備完成！")
        print("=" * 60)
        return 0
    else:
        print("\n" + "=" * 60)
        print("❌ 模型檔案準備不完整")
        print("=" * 60)
        print("\n📋 手動處理步驟:")
        print("1. 從 GitHub Release 下載 mobile_sam.pt")
        print("   https://github.com/ChaoningZhang/MobileSAM/releases/tag/v1.0")
        print("2. 放置至 public/models/mobile_sam.pt")
        print("3. 在 MobileSAM 專案中執行 export_onnx.py")
        print("4. 將產生的 .onnx 複製到 public/models/")
        print("5. 執行量化 (可選): pip install onnxruntime")
        return 1

if __name__ == "__main__":
    sys.exit(main())