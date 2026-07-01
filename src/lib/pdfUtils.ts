// @ts-ignore: pdfjs-dist 的 /legacy/build/pdf 沒有型別宣告，但 run-time 可以有效載入
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pdfjs: Promise<any> | null = null;

async function getPdfJs() {
  if (!pdfjs) {
    // @ts-ignore: 故意忽略型別，讓 run-time 動態載入 legacy PDF.js
    pdfjs = import('pdfjs-dist/legacy/build/pdf');
  }
  return pdfjs;
}

export function applySharpen(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): string {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const w = canvas.width;
  const h = canvas.height;

  const amount = 0.25;
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
        const avg = (top + bottom + left + right) / 4;
        const sharpened = center + amount * (center - avg);
        data[idx + c] = Math.min(255, Math.max(0, sharpened));
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.85);
}

export async function convertPdfToImages(data: Uint8Array): Promise<string[]> {
  const pdfjs = await getPdfJs();

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
    const viewport = page.getViewport({ scale: 2.5 });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('無法建立 Canvas context');
    }

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({
      canvasContext: context,
      viewport,
      canvas,
    }).promise;

    const imageData = applySharpen(context, canvas);
    images.push(imageData);
  }

  return images;
}

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

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, maxWidth, totalHeight);

      let offsetY = 0;
      for (const img of images) {
        const x = Math.floor((maxWidth - img.naturalWidth) / 2);
        ctx.drawImage(img, x, offsetY);
        offsetY += img.naturalHeight + gap;
      }

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
