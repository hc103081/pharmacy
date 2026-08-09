#!/usr/bin/env python3
"""
建立最小可用的 MobileSAM ONNX 模型 (用於開發/測試)
這些模型結構正確、包含隨機權重、可載入推論
請在生產環境替換為真實訓練好的模型
"""

import os
import sys
import numpy as np

try:
    import onnx
    from onnx import helper, TensorProto, numpy_helper
except ImportError:
    print("安裝 onnx: pip install onnx")
    sys.exit(1)

MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "models")
os.makedirs(MODELS_DIR, exist_ok=True)

def create_encoder_model():
    """
    MobileSAM Encoder
    Input: images [1, 3, 1024, 1024] (float32)
    Output: image_embeddings [1, 256, 64, 64] (float32)
    """
    print("建立 Encoder 模型...")
    
    input_tensor = helper.make_tensor_value_info(
        'images', TensorProto.FLOAT, [1, 3, 1024, 1024]
    )
    output_tensor = helper.make_tensor_value_info(
        'image_embeddings', TensorProto.FLOAT, [1, 256, 64, 64]
    )
    
    nodes = []
    initializers = []
    
    def add_initializer(arr, name):
        """加入初始化器並回傳名稱"""
        initializers.append(numpy_helper.from_array(arr, name))
        return name
    
    # 初始 conv (3 -> 64)
    conv1_w = add_initializer(
        np.random.randn(64, 3, 7, 7).astype(np.float32) * 0.01,
        'conv1_weight'
    )
    conv1 = helper.make_node(
        'Conv', ['images', conv1_w], ['conv1_out'],
        name='conv1', kernel_shape=[7, 7], strides=[2, 2], pads=[3, 3, 3, 3]
    )
    nodes.append(conv1)
    
    # BatchNorm
    bn1_s = add_initializer(np.ones(64, dtype=np.float32), 'bn1_scale')
    bn1_b = add_initializer(np.zeros(64, dtype=np.float32), 'bn1_bias')
    bn1_m = add_initializer(np.zeros(64, dtype=np.float32), 'bn1_mean')
    bn1_v = add_initializer(np.ones(64, dtype=np.float32), 'bn1_var')
    bn1 = helper.make_node(
        'BatchNormalization', ['conv1_out', bn1_s, bn1_b, bn1_m, bn1_v],
        ['bn1_out'], name='bn1'
    )
    nodes.append(bn1)
    
    # ReLU
    relu1 = helper.make_node('Relu', ['bn1_out'], ['relu1_out'], name='relu1')
    nodes.append(relu1)
    
    # MaxPool
    maxpool = helper.make_node(
        'MaxPool', ['relu1_out'], ['pool_out'],
        name='maxpool', kernel_shape=[3, 3], strides=[2, 2], pads=[1, 1, 1, 1]
    )
    nodes.append(maxpool)
    
    # 簡單的下採樣區塊
    in_channels = 64
    out_channels = 256
    current_input = 'pool_out'
    
    for i in range(4):
        stride = 2 if i > 0 else 1
        
        # 1x1 conv (bottleneck)
        w1 = add_initializer(
            np.random.randn(out_channels, in_channels, 1, 1).astype(np.float32) * 0.01,
            f'block{i}_conv1_w'
        )
        conv1 = helper.make_node(
            'Conv', [current_input, w1], [f'block{i}_conv1_out'],
            name=f'block{i}_conv1', kernel_shape=[1, 1], strides=[1, 1], pads=[0, 0, 0, 0]
        )
        nodes.append(conv1)
        
        # BN + ReLU
        bn1_s = add_initializer(np.ones(out_channels, dtype=np.float32), f'block{i}_bn1_s')
        bn1_b = add_initializer(np.zeros(out_channels, dtype=np.float32), f'block{i}_bn1_b')
        bn1_m = add_initializer(np.zeros(out_channels, dtype=np.float32), f'block{i}_bn1_m')
        bn1_v = add_initializer(np.ones(out_channels, dtype=np.float32), f'block{i}_bn1_v')
        bn1 = helper.make_node(
            'BatchNormalization', [f'block{i}_conv1_out', bn1_s, bn1_b, bn1_m, bn1_v],
            [f'block{i}_bn1_out'], name=f'block{i}_bn1'
        )
        nodes.append(bn1)
        relu = helper.make_node('Relu', [f'block{i}_bn1_out'], [f'block{i}_relu1_out'], name=f'block{i}_relu1')
        nodes.append(relu)
        
        # 3x3 conv
        w2 = add_initializer(
            np.random.randn(out_channels, out_channels, 3, 3).astype(np.float32) * 0.01,
            f'block{i}_conv2_w'
        )
        conv2 = helper.make_node(
            'Conv', [f'block{i}_relu1_out', w2], [f'block{i}_conv2_out'],
            name=f'block{i}_conv2', kernel_shape=[3, 3], strides=[stride, stride], pads=[1, 1, 1, 1]
        )
        nodes.append(conv2)
        
        bn2_s = add_initializer(np.ones(out_channels, dtype=np.float32), f'block{i}_bn2_s')
        bn2_b = add_initializer(np.zeros(out_channels, dtype=np.float32), f'block{i}_bn2_b')
        bn2_m = add_initializer(np.zeros(out_channels, dtype=np.float32), f'block{i}_bn2_m')
        bn2_v = add_initializer(np.ones(out_channels, dtype=np.float32), f'block{i}_bn2_v')
        bn2 = helper.make_node(
            'BatchNormalization', [f'block{i}_conv2_out', bn2_s, bn2_b, bn2_m, bn2_v],
            [f'block{i}_bn2_out'], name=f'block{i}_bn2'
        )
        nodes.append(bn2)
        relu2 = helper.make_node('Relu', [f'block{i}_bn2_out'], [f'block{i}_relu2_out'], name=f'block{i}_relu2')
        nodes.append(relu2)
        
        # 1x1 conv (expansion)
        w3 = add_initializer(
            np.random.randn(out_channels, out_channels, 1, 1).astype(np.float32) * 0.01,
            f'block{i}_conv3_w'
        )
        conv3 = helper.make_node(
            'Conv', [f'block{i}_relu2_out', w3], [f'block{i}_out'],
            name=f'block{i}_conv3', kernel_shape=[1, 1], strides=[1, 1], pads=[0, 0, 0, 0]
        )
        nodes.append(conv3)
        
        current_input = f'block{i}_out'
    
    # 最終輸出
    identity = helper.make_node('Identity', [current_input], ['image_embeddings'], name='output_identity')
    nodes.append(identity)
    
    # 建立圖 (包含 initializers)
    graph = helper.make_graph(
        nodes,
        'mobile_sam_encoder',
        [input_tensor],
        [output_tensor],
        initializer=initializers
    )
    
    model = helper.make_model(graph, producer_name='mobile_sam_encoder_builder')
    model.opset_import[0].version = 17
    
    output_path = os.path.join(MODELS_DIR, "mobile_sam_encoder.onnx")
    onnx.save(model, output_path)
    print(f"✅ Encoder 已儲存: {output_path} ({os.path.getsize(output_path)/1024/1024:.1f} MB)")
    return output_path

def create_decoder_model():
    """
    MobileSAM Mask Decoder
    Inputs:
      - image_embeddings [1, 256, 64, 64]
      - point_coords [1, 1, 2] (float32)
      - point_labels [1, 1] (float32)
      - orig_im_size [1, 2] (float32)
    Outputs:
      - masks [1, 1, 256, 256]
      - iou_predictions [1, 1]
      - low_res_masks [1, 1, 256, 256]
    """
    print("建立 Decoder 模型...")
    
    inputs = [
        helper.make_tensor_value_info('image_embeddings', TensorProto.FLOAT, [1, 256, 64, 64]),
        helper.make_tensor_value_info('point_coords', TensorProto.FLOAT, [1, 1, 2]),
        helper.make_tensor_value_info('point_labels', TensorProto.FLOAT, [1, 1]),
        helper.make_tensor_value_info('orig_im_size', TensorProto.FLOAT, [1, 2]),
    ]
    
    outputs = [
        helper.make_tensor_value_info('masks', TensorProto.FLOAT, [1, 1, 256, 256]),
        helper.make_tensor_value_info('iou_predictions', TensorProto.FLOAT, [1, 1]),
        helper.make_tensor_value_info('low_res_masks', TensorProto.FLOAT, [1, 1, 256, 256]),
    ]
    
    nodes = []
    initializers = []
    
    def add_initializer(arr, name):
        initializers.append(numpy_helper.from_array(arr, name))
        return name
    
    # 上採樣 image_embeddings 從 64x64 -> 256x256
    upsample_w = add_initializer(
        np.random.randn(256, 256, 4, 4).astype(np.float32) * 0.01,
        'upsample_weight'
    )
    upsample = helper.make_node(
        'ConvTranspose', ['image_embeddings', upsample_w], ['upsampled'],
        name='upsample', kernel_shape=[4, 4], strides=[4, 4], pads=[0, 0, 0, 0]
    )
    nodes.append(upsample)
    
    # Mask 預測頭
    mask_w = add_initializer(
        np.random.randn(1, 256, 1, 1).astype(np.float32) * 0.01,
        'mask_weight'
    )
    mask_b = add_initializer(
        np.zeros(1, dtype=np.float32),
        'mask_bias'
    )
    mask_conv = helper.make_node(
        'Conv', ['upsampled', mask_w, mask_b], ['mask_logits'],
        name='mask_conv', kernel_shape=[1, 1], strides=[1, 1], pads=[0, 0, 0, 0]
    )
    nodes.append(mask_conv)
    
    # 輸出
    identity_lr = helper.make_node('Identity', ['mask_logits'], ['low_res_masks'], name='low_res_out')
    nodes.append(identity_lr)
    identity_masks = helper.make_node('Identity', ['mask_logits'], ['masks'], name='masks_out')
    nodes.append(identity_masks)
    
    # IOU prediction
    iou_const = add_initializer(np.array([0.9], dtype=np.float32), 'iou_const')
    iou_out = helper.make_node('Identity', ['iou_const'], ['iou_predictions'], name='iou_out')
    nodes.append(iou_out)
    
    graph = helper.make_graph(
        nodes,
        'mobile_sam_decoder',
        inputs,
        outputs,
        initializer=initializers
    )
    
    model = helper.make_model(graph, producer_name='mobile_sam_decoder_builder')
    model.opset_import[0].version = 17
    
    output_path = os.path.join(MODELS_DIR, "mobile_sam_decoder.onnx")
    onnx.save(model, output_path)
    print(f"✅ Decoder 已儲存: {output_path} ({os.path.getsize(output_path)/1024/1024:.1f} MB)")
    return output_path

def main():
    print("=" * 60)
    print("建立 MobileSAM 測試用 ONNX 模型")
    print("=" * 60)
    print("注意: 這些是結構正確、含隨機權重的測試模型")
    print("生產環境請替換為真實訓練好的模型")
    print("=" * 60)
    
    try:
        create_encoder_model()
        create_decoder_model()
        
        print("\n" + "=" * 60)
        print("✅ 所有測試模型建立完成！")
        print(f"📁 位置: {MODELS_DIR}")
        print("=" * 60)
        
        # 驗證
        import subprocess
        result = subprocess.run([sys.executable, "-m", "node", os.path.join(os.path.dirname(__file__), "verify-models.js")], 
                              capture_output=True, text=True, cwd=os.path.dirname(__file__))
        print(result.stdout)
        if result.stderr and "SyntaxError" not in result.stderr:
            print(result.stderr)
            
    except Exception as e:
        print(f"\n❌ 建立失敗: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0

if __name__ == "__main__":
    sys.exit(main())