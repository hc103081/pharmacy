/**
 * Base64 / ArrayBuffer / Blob 轉換工具
 */

/**
 * ArrayBuffer → data URI (Base64)
 */
export function arrayBufferToDataUri(buffer: ArrayBuffer, mimeType: string = 'image/jpeg'): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return `data:${mimeType};base64,${base64}`;
}

/**
 * data URI (Base64) → Blob
 */
export function dataUriToBlob(dataUri: string): Blob {
  const parts = dataUri.split(',');
  const contentType = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
  const byteString = atob(parts[1]);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: contentType });
}