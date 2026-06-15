import type * as PDFJS from 'pdfjs-dist';

// Configure worker for browser environment
// Removed top-level configuration to avoid SSR issues


/**
 * 將 PDF 的每一頁轉換為 Base64 編碼的 JPEG 圖片字串。
 * 適用於瀏覽器環境。
 */
export async function convertPdfToImages(data: Uint8Array): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist');

  if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString();
  }

  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;
  const images: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 }); // 使用 2.0 倍縮放以提升 OCR 準確度

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
    }).promise;

    // 轉換為 Base64 JPEG 格式
    const imageData = canvas.toDataURL('image/jpeg', 0.8);
    images.push(imageData);
  }

  return images;
}
