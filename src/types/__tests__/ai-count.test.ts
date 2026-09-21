import type {
  AISegmentedItem,
  AICountingState,
  ModelLoadState,
  WorkerMessage,
  WorkerResponse,
} from '@/types/ai-count';

describe('ai-count types', () => {
  describe('AISegmentedItem', () => {
    it('should allow valid segmented item', () => {
      const item: AISegmentedItem = {
        id: 'test-id',
        index: 1,
        clickPoint: { x: 0.5, y: 0.5 },
        boundingBox: [0.1, 0.1, 0.9, 0.9],
        maskData: new Uint8Array([1, 0, 0, 1]),
        areaPixels: 2,
        confidence: 0.95,
        createdAt: Date.now(),
      };

      expect(item.id).toBe('test-id');
      expect(item.index).toBe(1);
      expect(item.confidence).toBeGreaterThan(0.9);
    });

    it('should require all mandatory fields', () => {
      // This is a compile-time check - if it compiles, the type is correct
      const item: AISegmentedItem = {
        id: '1',
        index: 1,
        clickPoint: { x: 0, y: 0 },
        boundingBox: [0, 0, 0, 0],
        maskData: new Uint8Array(0),
        areaPixels: 0,
        confidence: 0,
        createdAt: 0,
      };
      expect(item).toBeDefined();
    });
  });

  describe('AICountingState', () => {
    it('should allow valid counting state', () => {
      const state: AICountingState = {
        imageId: 'img-123',
        imageDimensions: { width: 1024, height: 768 },
        imageElement: null,
        isDecoderReady: true,
        isEncoderReady: true,
        isEncoderProcessing: false,
        imageEmbedding: null,
        items: [],
        totalCount: 0,
        isAIModeEnabled: false,
        showAIOverlay: false,
        pendingAdoption: false,
        historyStack: [[]],
        historyIndex: 0,
      };

      expect(state.imageId).toBe('img-123');
      expect(state.imageDimensions.width).toBe(1024);
      expect(state.isDecoderReady).toBe(true);
    });

    it('should support history stack with items', () => {
      const item: AISegmentedItem = {
        id: '1',
        index: 1,
        clickPoint: { x: 0.5, y: 0.5 },
        boundingBox: [0, 0, 1, 1],
        maskData: new Uint8Array(1),
        areaPixels: 1,
        confidence: 0.9,
        createdAt: Date.now(),
      };

      const state: AICountingState = {
        imageId: 'img-123',
        imageDimensions: { width: 100, height: 100 },
        imageElement: null,
        isDecoderReady: true,
        isEncoderReady: true,
        isEncoderProcessing: false,
        imageEmbedding: null,
        items: [item],
        totalCount: 1,
        isAIModeEnabled: true,
        showAIOverlay: true,
        pendingAdoption: false,
        historyStack: [[], [item]],
        historyIndex: 1,
      };

      expect(state.historyStack.length).toBe(2);
      expect(state.historyIndex).toBe(1);
    });
  });

  describe('ModelLoadState', () => {
    it('should allow all valid decoder states', () => {
      const states: ModelLoadState['decoder'][] = ['idle', 'loading', 'ready', 'error'];
      states.forEach(s => {
        const state: ModelLoadState = {
          decoder: s,
          encoder: 'idle',
          backend: 'wasm',
          isEncoderProcessing: false,
        };
        expect(state.decoder).toBe(s);
      });
    });

    it('should allow all valid encoder states', () => {
      const states: ModelLoadState['encoder'][] = ['idle', 'loading', 'ready', 'error'];
      states.forEach(s => {
        const state: ModelLoadState = {
          decoder: 'idle',
          encoder: s,
          backend: 'wasm',
          isEncoderProcessing: false,
        };
        expect(state.encoder).toBe(s);
      });
    });

    it('should allow both backend types', () => {
      const backends: ModelLoadState['backend'][] = ['webgpu', 'wasm', 'unknown'];
      backends.forEach(b => {
        const state: ModelLoadState = {
          decoder: 'idle',
          encoder: 'idle',
          backend: b,
          isEncoderProcessing: false,
        };
        expect(state.backend).toBe(b);
      });
    });

    it('should support optional progress fields', () => {
      const state: ModelLoadState = {
        decoder: 'ready',
        encoder: 'loading',
        backend: 'wasm',
        isEncoderProcessing: true,
        encoderProgress: 50,
        encoderStage: 'downloading',
        errorMessage: 'Test error',
      };

      expect(state.encoderProgress).toBe(50);
      expect(state.encoderStage).toBe('downloading');
      expect(state.errorMessage).toBe('Test error');
    });
  });

  describe('WorkerMessage', () => {
    it('should allow INIT_DECODER message', () => {
      const msg: WorkerMessage = {
        type: 'INIT_DECODER',
        modelUrl: 'https://example.com/decoder.onnx',
        decoderDataUrl: 'https://example.com/decoder.onnx.data',
        wasmConfig: { numThreads: 4, simd: true },
      };

      expect(msg.type).toBe('INIT_DECODER');
      expect(msg.wasmConfig.numThreads).toBe(4);
    });

    it('should allow INIT_ENCODER message', () => {
      const msg: WorkerMessage = {
        type: 'INIT_ENCODER',
        modelUrl: 'https://example.com/encoder.onnx',
        wasmConfig: { numThreads: 1, simd: true },
      };

      expect(msg.type).toBe('INIT_ENCODER');
      expect(msg.wasmConfig.simd).toBe(true);
    });

    it('should allow RUN_ENCODER message with ImageBitmap', () => {
      const msg: WorkerMessage = {
        type: 'RUN_ENCODER',
        imageBitmap: {} as ImageBitmap,
      };

      expect(msg.type).toBe('RUN_ENCODER');
    });

    it('should allow DISPOSE message', () => {
      const msg: WorkerMessage = { type: 'DISPOSE' };
      expect(msg.type).toBe('DISPOSE');
    });
  });

  describe('WorkerResponse', () => {
    it('should allow DECODER_READY response', () => {
      const resp: WorkerResponse = {
        type: 'DECODER_READY',
        backend: 'webgpu',
      };

      expect(resp.type).toBe('DECODER_READY');
      expect(resp.backend).toBe('webgpu');
    });

    it('should allow ENCODER_READY response', () => {
      const resp: WorkerResponse = { type: 'ENCODER_READY' };
      expect(resp.type).toBe('ENCODER_READY');
    });

    it('should allow EMBEDDING_READY response', () => {
      const resp: WorkerResponse = {
        type: 'EMBEDDING_READY',
        embedding: new Float32Array([1, 2, 3]),
        shape: [1, 3],
      };

      expect(resp.type).toBe('EMBEDDING_READY');
      expect(resp.embedding.length).toBe(3);
    });

    it('should allow ERROR response', () => {
      const resp: WorkerResponse = {
        type: 'ERROR',
        message: 'Something went wrong',
      };

      expect(resp.type).toBe('ERROR');
      expect(resp.message).toBe('Something went wrong');
    });

    it('should allow ENCODER_PROGRESS response', () => {
      const resp: WorkerResponse = {
        type: 'ENCODER_PROGRESS',
        progress: 75,
        stage: 'initializing',
      };

      expect(resp.type).toBe('ENCODER_PROGRESS');
      expect(resp.progress).toBe(75);
      expect(resp.stage).toBe('initializing');
    });
  });
});