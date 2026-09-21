import {
  calculateIoU,
  computeBBox,
  computeConfidence,
  binarizeAndResize,
  handleNegativeClick,
} from '../counting-logic';
import type { AICountingState, AISegmentedItem } from '@/types/ai-count';

describe('counting-logic', () => {
  describe('calculateIoU', () => {
    it('returns 1 for identical masks', () => {
      const mask = new Uint8Array([1, 1, 0, 1, 0, 0]);
      expect(calculateIoU(mask, mask)).toBe(1);
    });

    it('returns 0 for completely disjoint masks', () => {
      const maskA = new Uint8Array([1, 1, 0, 0, 0, 0]);
      const maskB = new Uint8Array([0, 0, 0, 1, 1, 0]);
      expect(calculateIoU(maskA, maskB)).toBe(0);
    });

    it('calculates correct IoU for partially overlapping masks', () => {
      // maskA: [1,1,0,0] -> area=2
      // maskB: [0,1,1,0] -> area=2
      // intersection: [0,1,0,0] -> 1
      // union: [1,1,1,0] -> 3
      // IoU = 1/3
      const maskA = new Uint8Array([1, 1, 0, 0]);
      const maskB = new Uint8Array([0, 1, 1, 0]);
      expect(calculateIoU(maskA, maskB)).toBeCloseTo(1 / 3);
    });

    it('handles empty masks', () => {
      const empty = new Uint8Array([0, 0, 0, 0]);
      const nonEmpty = new Uint8Array([1, 1, 0, 0]);
      expect(calculateIoU(empty, nonEmpty)).toBe(0);
      expect(calculateIoU(empty, empty)).toBe(0);
    });

    it('handles different sized masks (uses min length)', () => {
      const maskA = new Uint8Array([1, 1, 1, 1]); // length 4
      const maskB = new Uint8Array([1, 1, 0, 0, 0, 0]); // length 6
      // Only first 4 elements compared
      // intersection: 2, union: 4 -> IoU = 0.5
      expect(calculateIoU(maskA, maskB)).toBe(0.5);
    });
  });

  describe('computeBBox', () => {
    it('returns correct bbox for a simple rectangle', () => {
      // 4x4 image, mask covers pixels (1,1) to (2,2) -> 2x2 square at center
      const mask = new Uint8Array([
        0, 0, 0, 0,
        0, 1, 1, 0,
        0, 1, 1, 0,
        0, 0, 0, 0,
      ]);
      const bbox = computeBBox(mask, 4, 4);
      // minX=1/4=0.25, minY=1/4=0.25, maxX=2/4=0.5, maxY=2/4=0.5
      expect(bbox).toEqual([0.25, 0.25, 0.5, 0.5]);
    });

    it('returns [0,0,0,0] for empty mask', () => {
      const mask = new Uint8Array([0, 0, 0, 0]);
      expect(computeBBox(mask, 2, 2)).toEqual([0, 0, 0, 0]);
    });

    it('returns correct bbox for single pixel', () => {
      // 2x2 image, only top-left pixel set
      const mask = new Uint8Array([1, 0, 0, 0]);
      const bbox = computeBBox(mask, 2, 2);
      // minX=0/2=0, minY=0/2=0, maxX=0/2=0, maxY=0/2=0
      expect(bbox).toEqual([0, 0, 0, 0]);
    });

    it('returns correct bbox for full image mask', () => {
      const mask = new Uint8Array([1, 1, 1, 1]);
      const bbox = computeBBox(mask, 2, 2);
      // Normalized coordinates: maxX = 1/2 = 0.5, maxY = 1/2 = 0.5
      expect(bbox).toEqual([0, 0, 0.5, 0.5]);
    });

    it('handles non-square images', () => {
      // 3x2 image (width=3, height=2)
      const mask = new Uint8Array([
        0, 1, 0,
        0, 1, 0,
      ]);
      const bbox = computeBBox(mask, 3, 2);
      // minX=1/3≈0.33, minY=0/2=0, maxX=1/3≈0.33, maxY=1/2=0.5
      expect(bbox[0]).toBeCloseTo(1 / 3);
      expect(bbox[1]).toBe(0);
      expect(bbox[2]).toBeCloseTo(1 / 3);
      expect(bbox[3]).toBe(0.5);
    });
  });

  describe('computeConfidence', () => {
    it('returns high confidence for large positive logit', () => {
      const logits = new Float32Array([10, 0, 0, 0]);
      const conf = computeConfidence(logits);
      // sigmoid(10) ≈ 0.99995
      expect(conf).toBeGreaterThan(0.99);
    });

    it('returns 0.5 for zero logit', () => {
      const logits = new Float32Array([0, 0, 0]);
      expect(computeConfidence(logits)).toBe(0.5);
    });

    it('returns low confidence for large negative logit', () => {
      const logits = new Float32Array([-10, -5, -3]);
      const conf = computeConfidence(logits);
      // sigmoid(-3) ≈ 0.047
      expect(conf).toBeLessThan(0.05);
    });

    it('handles single element array', () => {
      const logits = new Float32Array([5]);
      const conf = computeConfidence(logits);
      expect(conf).toBeCloseTo(1 / (1 + Math.exp(-5)));
    });
  });

  describe('binarizeAndResize', () => {
    it('resizes 4x4 logits to 2x2 with threshold 0', () => {
      // 4x4 input, all positive
      const logits = new Float32Array(16).fill(1);
      const result = binarizeAndResize(logits, { width: 2, height: 2 }, 0);
      expect(result).toEqual(new Uint8Array([1, 1, 1, 1]));
    });

    it('applies threshold correctly', () => {
      // 4x4 input: first row positive, rest negative
      const logits = new Float32Array([
        1, 1, 1, 1,  // row 0: positive
        -1, -1, -1, -1, // row 1: negative
        -1, -1, -1, -1, // row 2: negative
        -1, -1, -1, -1, // row 3: negative
      ]);
      const result = binarizeAndResize(logits, { width: 2, height: 2 }, 0);
      // Each output pixel samples 2x2 input region
      // Top row samples rows 0-1, bottom row samples rows 2-3
      // With threshold 0, only top row should be 1
      expect(result).toEqual(new Uint8Array([1, 1, 0, 0]));
    });

    it('handles upscaling (smaller input to larger output)', () => {
      // 2x2 input -> 4x4 output
      const logits = new Float32Array([1, 0, 0, 1]); // diagonal
      const result = binarizeAndResize(logits, { width: 4, height: 4 }, 0);
      expect(result.length).toBe(16);
    });

    it('returns correct dimensions', () => {
      const logits = new Float32Array(64); // 8x8
      const result = binarizeAndResize(logits, { width: 10, height: 20 });
      expect(result.length).toBe(200);
    });
  });

  describe('handleNegativeClick', () => {
    const createMockState = (items: AISegmentedItem[], width: number, height: number): AICountingState => ({
      imageId: 'test',
      imageDimensions: { width, height },
      imageElement: null,
      isDecoderReady: true,
      isEncoderReady: true,
      isEncoderProcessing: false,
      imageEmbedding: null,
      items,
      totalCount: items.length,
      isAIModeEnabled: true,
      showAIOverlay: true,
      pendingAdoption: false,
      historyStack: [items],
      historyIndex: 0,
    });

    it('returns delete action when click hits mask', () => {
      // 4x4 image, mask at center (1,1) to (2,2)
      const mask = new Uint8Array(16).fill(0);
      mask[1 * 4 + 1] = 1; // (1,1)
      mask[1 * 4 + 2] = 1; // (2,1)
      mask[2 * 4 + 1] = 1; // (1,2)
      mask[2 * 4 + 2] = 1; // (2,2)

      const item: AISegmentedItem = {
        id: '1',
        index: 1,
        clickPoint: { x: 0.5, y: 0.5 },
        boundingBox: [0.25, 0.25, 0.5, 0.5],
        maskData: mask,
        areaPixels: 4,
        confidence: 0.9,
        createdAt: Date.now(),
      };

      const state = createMockState([item], 4, 4);
      // Click at normalized (0.375, 0.375) -> pixel (1,1) which is in mask
      const result = handleNegativeClick(state, 0.375, 0.375);

      expect(result).not.toBeNull();
      expect(result?.action).toBe('delete');
      expect(result?.index).toBe(0);
      expect(result?.item.id).toBe('1');
    });

    it('returns null when click misses mask', () => {
      const mask = new Uint8Array(16).fill(0);
      mask[1 * 4 + 1] = 1;

      const item: AISegmentedItem = {
        id: '1',
        index: 1,
        clickPoint: { x: 0.5, y: 0.5 },
        boundingBox: [0.25, 0.25, 0.5, 0.5],
        maskData: mask,
        areaPixels: 1,
        confidence: 0.9,
        createdAt: Date.now(),
      };

      const state = createMockState([item], 4, 4);
      // Click at (0,0) - top left, not in mask
      const result = handleNegativeClick(state, 0, 0);

      expect(result).toBeNull();
    });

    it('returns null for empty items array', () => {
      const state = createMockState([], 4, 4);
      const result = handleNegativeClick(state, 0.5, 0.5);
      expect(result).toBeNull();
    });

    it('handles click at boundary correctly', () => {
      // 4x4, mask covers entire image
      const mask = new Uint8Array(16).fill(1);
      const item: AISegmentedItem = {
        id: '1',
        index: 1,
        clickPoint: { x: 0.5, y: 0.5 },
        boundingBox: [0, 0, 1, 1],
        maskData: mask,
        areaPixels: 16,
        confidence: 0.9,
        createdAt: Date.now(),
      };

      const state = createMockState([item], 4, 4);
      // Click at normalized (0.875, 0.875) -> pixel (3,3) bottom right (valid index 0-3)
      const result = handleNegativeClick(state, 0.875, 0.875);
      expect(result).not.toBeNull();
      expect(result?.action).toBe('delete');
    });

    it('uses width for both x and y index calculation (matches source)', () => {
      // This test verifies the current implementation behavior
      // Note: Source uses `width` for both dimensions in index calculation
      const mask = new Uint8Array(16).fill(0);
      mask[1 * 4 + 2] = 1; // Set pixel at (2,1) in 4x4

      const item: AISegmentedItem = {
        id: '1',
        index: 1,
        clickPoint: { x: 0.5, y: 0.5 },
        boundingBox: [0.25, 0.25, 0.5, 0.5],
        maskData: mask,
        areaPixels: 1,
        confidence: 0.9,
        createdAt: Date.now(),
      };

      const state = createMockState([item], 4, 4);
      // Click at normalized (0.5, 0.25) -> x=2, y=1 -> idx = 1*4 + 2 = 6
      const result = handleNegativeClick(state, 0.5, 0.25);
      expect(result).not.toBeNull();
    });
  });
});