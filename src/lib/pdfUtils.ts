import type * as PDFJS from 'pdfjs-dist';

// Configure worker for browser environment
// Removed top-level configuration to avoid SSR issues

/**
 * 對 Canvas 內容進行輕度銳化（USM - Unsharp Masking）。
 * 強化文字邊緣對比，有助於 OCR 辨識。
 */
export function applySharpen(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): string {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const w = canvas.width;
  const h = canvas.height;
  
  // 3x3 銳化核：中心加權、周圍取負值（輕量版）
  const amount = 0.25; // 銳化強度（0~1），值越低越保守

  // 拷貝原始像素
  const copy = new Uint8ClampedArray(data);
  
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const center = copy[idx + c];
        const top = copy[idx - w * 4 + c];
        const bottom = copy[idx + w * 4 + c];
        const left = copy[idx - 4 + c];
        const right = copy[idx + 4 + c];
        // 銳化：原值 + amount * (原值 - 周圍平均)
        const avg = (top + bottom + left + right) / 4;
        const sharpened = center + amount * (center - avg);
        data[idx + c] = Math.min(255, Math.max(0, sharpened));
      }
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.85);
}

/**
 * 將 PDF 的每一頁轉換為 Base64 編碼的 JPEG 圖片字串。
 * 適用於瀏覽器環境。
 */
export async function convertPdfToImages(data: Uint8Array): Promise<string[]> {
  // @ts-expect-error: pdf.js internal type mismatch // Import legacy PDF.js without type declarations
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf');

  if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString();
  }

  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;
  const images: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.5 }); // 2.5x 縮放：平衡圖片體積與中文 OCR 辨識精準度

    // 建立一個隱藏的 canvas 來進行渲染
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('無法建立 Canvas context');
    }

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({
      canvasContext: context,
      viewport: viewport,
      canvas: canvas,
    }).promise;

    // 銳化增強以提升中文字符邊緣清晰度
    const imageData = applySharpen(context, canvas);
    images.push(imageData);
  }

  return images;
}

/**
 * 將多張 Base64 圖片垂直拼接成一張。
 * 用於減少 Gemini API 請求次數。
 * @param base64Images - base64 圖片字串陣列（含 data:image/... 前綴）
 * @param gap - 頁與頁之間的白色間隔像素（預設 20px）
 * @returns 拼接後的 base64 JPEG 圖片
 */
export function mergeImagesVertically(base64Images: string[], gap: number = 20): Promise<string> {
  return new Promise((resolve, reject) => {
    if (base64Images.length === 0) {
      reject(new Error('沒有圖片可供合併'));
      return;
    }
    if (base64Images.length === 1) {
      resolve(base64Images[0]);
      return;
    }

    const images: HTMLImageElement[] = [];
    let loadedCount = 0;

    const onAllLoaded = () => {
      // 計算總高度與最大寬度
      let totalHeight = gap * (images.length - 1);
      let maxWidth = 0;
      for (const img of images) {
        totalHeight += img.naturalHeight;
        if (img.naturalWidth > maxWidth) maxWidth = img.naturalWidth;
      }

      const canvas = document.createElement('canvas');
      canvas.width = maxWidth;
      canvas.height = totalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('無法建立 Canvas context'));
        return;
      }

      // 白色背景
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, maxWidth, totalHeight);

      // 垂直繪製每一張圖片
      let offsetY = 0;
      for (const img of images) {
        // 水平置中
        const x = Math.floor((maxWidth - img.naturalWidth) / 2);
        ctx.drawImage(img, x, offsetY);
        offsetY += img.naturalHeight + gap;
      }

      // 對拼接後的大圖再次輕度銳化
      const result = applySharpen(ctx, canvas);
      resolve(result);
    };

    for (const base64 of base64Images) {
      const img = new Image();
      img.onload = () => {
        loadedCount++;
        if (loadedCount === base64Images.length) onAllLoaded();
      };
      img.onerror = () => reject(new Error('圖片載入失敗'));
      img.src = base64;
      images.push(img);
    }
  });
}