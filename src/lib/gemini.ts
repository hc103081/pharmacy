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
export async function createGeminiModel(): Promise<ReturnType<GoogleGenerativeAI['getGenerativeModel']>> {
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
 * - Markdown 標記清除
 * - 缺少逗號
 * - 輸出截斷（不完整的 JSON 陣列／物件自動閉合）
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
  const withCommas = cleaned.replace(/"\s*\n\s*"/g, '",\n"');
  try {
    JSON.parse(withCommas);
    return withCommas;
  } catch {}

  // 嘗試修復被截斷的 JSON：找到最後一個完整的物件或字串
  // 場景：Gemini 輸出 token 上限導致 items 陣列在結尾截斷
  cleaned = withCommas;

  // 步驟 1：找到最後一個完整的 "]" 或 "}"，在之後補上 "]}"
  // 移除截斷位置後的不完整字元，然後閉合
  try {
    JSON.parse(cleaned + ']}');
    return cleaned + ']}';
  } catch {}

  // 步驟 2：移除尾部不完整的物件（最後一個逗號後的內容），再補 "]}"
  const lastComma = cleaned.lastIndexOf(',');
  if (lastComma > 0) {
    try {
      const truncated = cleaned.slice(0, lastComma) + ']}';
      JSON.parse(truncated);
      return truncated;
    } catch {}
  }

  // 步驟 2.5：移除尾部不完整的連續物件（最後一個 ]} 之後的內容截斷）
  const lastItemEnd = cleaned.lastIndexOf('"}');
  if (lastItemEnd > 0) {
    try {
      const truncated = cleaned.slice(0, lastItemEnd + 2) + ']}';
      JSON.parse(truncated);
      return truncated;
    } catch {}
  }

  // 步驟 3：嘗試找最後一個完整的陣列元素，簡單閉合
  const lastBrace = cleaned.lastIndexOf('}');
  if (lastBrace > 0) {
    try {
      const truncated = cleaned.slice(0, lastBrace + 1) + ']}';
      JSON.parse(truncated);
      return truncated;
    } catch {}
  }

  // 完全無法修復
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