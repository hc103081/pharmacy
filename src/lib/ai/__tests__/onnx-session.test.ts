// Mock onnxruntime-web before importing the module
jest.mock('onnxruntime-web', () => ({
  InferenceSession: {
    create: jest.fn(),
  },
  env: {
    wasm: { numThreads: 1, simd: false },
    webgpu: {},
  },
}));

import * as ort from 'onnxruntime-web';
import { createDecoderSession, createEncoderSession, SessionResult } from '@/lib/ai/onnx-session';

describe('onnx-session', () => {
  const mockSession = {
    dispose: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createDecoderSession', () => {
    it('should create session with WebGPU when available', async () => {
      (ort.InferenceSession.create as jest.Mock).mockResolvedValue(mockSession);

      const result: SessionResult = await createDecoderSession();

      expect(ort.InferenceSession.create).toHaveBeenCalledWith(
        expect.stringContaining('/mobile_sam_decoder.onnx'),
        expect.objectContaining({
          executionProviders: ['webgpu'],
          graphOptimizationLevel: 'all',
          externalData: expect.arrayContaining([
            expect.objectContaining({
              path: 'mobile_sam_decoder.onnx.data',
            }),
          ]),
        })
      );
      expect(result.session).toBe(mockSession);
      expect(result.backend).toBe('webgpu');
    });

    it('should fallback to WASM when WebGPU fails', async () => {
      (ort.InferenceSession.create as jest.Mock)
        .mockRejectedValueOnce(new Error('WebGPU not supported'))
        .mockResolvedValueOnce(mockSession);

      const result: SessionResult = await createDecoderSession();

      expect(ort.InferenceSession.create).toHaveBeenCalledTimes(2);
      expect(ort.env.wasm.numThreads).toBeGreaterThan(0);
      expect(ort.env.wasm.simd).toBe(true);
      expect(result.backend).toBe('wasm');
    });

    it('should include external data for decoder', async () => {
      (ort.InferenceSession.create as jest.Mock).mockResolvedValue(mockSession);

      await createDecoderSession();

      const callArgs = (ort.InferenceSession.create as jest.Mock).mock.calls[0];
      const options = callArgs[1];
      expect(options.externalData).toBeDefined();
      expect(options.externalData.length).toBe(1);
      expect(options.externalData[0].path).toBe('mobile_sam_decoder.onnx.data');
    });
  });

  describe('createEncoderSession', () => {
    it('should create session with WebGPU when available', async () => {
      (ort.InferenceSession.create as jest.Mock).mockResolvedValue(mockSession);

      const result: SessionResult = await createEncoderSession();

      expect(ort.InferenceSession.create).toHaveBeenCalledWith(
        expect.stringContaining('/mobile_sam_encoder.onnx'),
        expect.objectContaining({
          executionProviders: ['webgpu'],
          graphOptimizationLevel: 'all',
        })
      );
      expect(result.session).toBe(mockSession);
      expect(result.backend).toBe('webgpu');
    });

    it('should fallback to WASM when WebGPU fails', async () => {
      (ort.InferenceSession.create as jest.Mock)
        .mockRejectedValueOnce(new Error('WebGPU not supported'))
        .mockResolvedValueOnce(mockSession);

      const result: SessionResult = await createEncoderSession();

      expect(ort.InferenceSession.create).toHaveBeenCalledTimes(2);
      expect(ort.env.wasm.numThreads).toBeGreaterThan(0);
      expect(ort.env.wasm.simd).toBe(true);
      expect(result.backend).toBe('wasm');
    });

    it('should NOT include external data for encoder (self-contained model)', async () => {
      (ort.InferenceSession.create as jest.Mock).mockResolvedValue(mockSession);

      await createEncoderSession();

      const callArgs = (ort.InferenceSession.create as jest.Mock).mock.calls[0];
      const options = callArgs[1];
      // Encoder model has embedded weights, no external data needed
      expect(options.externalData).toBeUndefined();
    });
  });

  describe('SessionResult type', () => {
    it('should have correct structure', () => {
      const result: SessionResult = {
        session: mockSession,
        backend: 'webgpu',
      };

      expect(result.session).toBeDefined();
      expect(['webgpu', 'wasm']).toContain(result.backend);
    });
  });
});