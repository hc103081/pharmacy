'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * 從 process.env 取得並驗證 GOOGLE_API_KEY
 */
export async function getGeminiKey(): Promise<string> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('伺服器未配置 GOOGLE_API_KEY，請在 Vercel 環境變數中設定');
  }
  return apiKey;
}

/**
 * 建立 Gemini model 實例
 */
export async function createGeminiModel(): Promise<any> {
  const apiKey = await getGeminiKey();
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });
}

/**
 * 輔助函數：從 URL 獲取圖片並轉換為 Base64
 */
export async function fetchImageAsBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * 修復 Gemini 回傳 JSON 的常見格式錯誤
 * 例如：缺少冒號、值為空、重複逗號等
 */
export async function repairGeminiJson(text: string): Promise<string> {
  // 移除可能的 markdown 標記
  let cleaned = text.replace(/```json|```/g, '').trim();
  // 嘗試直接解析
  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch {}
  // 嘗試在換行處插入逗號
  cleaned = cleaned.replace(/"\s*\n\s*"/g, '",\n"');
  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch {}
  return '{}';
}

/**
 * 將 Gemini 原始錯誤轉為友善訊息
 */
export async function friendlyGeminiError(rawMessage: string): Promise<string> {
  if (rawMessage.includes('503') || rawMessage.includes('Service Unavailable') || rawMessage.includes('high demand')) {
    return 'AI 服務暫時過載 (503)，請稍後 1-2 分鐘再試。若持續發生，請聯絡管理員。';
  }
  if (rawMessage.includes('429') || rawMessage.includes('rate') || rawMessage.includes('quota')) {
    return 'AI API 配額已用盡或請求過於頻繁 (429)，請稍後再試。';
  }
  if (rawMessage.includes('500') || rawMessage.includes('Internal Error')) {
    return 'AI 服務內部錯誤 (500)，請稍後再試。';
  }
  return rawMessage;
}