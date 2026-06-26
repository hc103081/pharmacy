import imageCompression from 'browser-image-compression';

/**
 * 壓縮圖片檔案，目標大小不超過 100KB（0.1 MB）。
 * 若壓縮後仍大於上限，會嘗試以較低品質再次壓縮。
 */
export async function compressImage(file: File): Promise<File> {
  const MAX_SIZE_MB = 0.1; // 100KB
  const options = {
    maxSizeMB: MAX_SIZE_MB,
    maxWidthOrHeight: 1080, // 防止過大解析度
    useWebWorker: true,
  };

  let compressed = await imageCompression(file, options);

  // 若仍超過上限，使用更低品質與解析度再次壓縮
  if (compressed.size / 1024 / 1024 > MAX_SIZE_MB) {
    const fallbackOptions = {
      maxSizeMB: MAX_SIZE_MB,
      maxWidthOrHeight: 480, // 進一步降低解析度
      useWebWorker: true,
      initialQuality: 0.5,
    };
    compressed = await imageCompression(file, fallbackOptions);
  }

  // 產生新的 File 物件，保持原始檔名與類型
  return new File([compressed], file.name, { type: compressed.type });
}
