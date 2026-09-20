import imageCompression from 'browser-image-compression';

export async function compressImage(file: File): Promise<File> {
  const options = {
    maxWidthOrHeight: 1920,
    useWebWorker: true,
  };

  const compressed = await imageCompression(file, options);
  return new File([compressed], file.name, { type: compressed.type });
}
