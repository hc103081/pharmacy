/**
 * 共用錯誤型別定義
 * 避免在 Edge Functions 和 Server Actions 中使用 `any`
 */

export interface ApiError {
  message: string;
  statusCode?: number;
  code?: string;
  details?: unknown;
}

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType?: string;
  size?: string;
  createdTime?: string;
  parents?: string[];
}

export interface GoogleDriveFileList {
  files: GoogleDriveFile[];
  nextPageToken?: string;
}

export interface GoogleDriveQuota {
  limit: string;
  usage: string;
  usageInDrive?: string;
  usageInDriveTrash?: string;
}

export interface GoogleDriveAboutResponse {
  storageQuota: GoogleDriveQuota;
}

export interface SupabaseError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

/**
 * 類型保護：檢查是否為已知的 API 錯誤格式
 */
export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as Record<string, unknown>).message === 'string'
  );
}

/**
 * 類型保護：檢查是否為 Google Token 錯誤回應
 */
export function isGoogleTokenError(error: unknown): error is GoogleTokenResponse {
  return (
    typeof error === 'object' &&
    error !== null &&
    'error' in error &&
    typeof (error as Record<string, unknown>).error === 'string'
  );
}

/**
 * 安全取得錯誤訊息
 */
export function getErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return '未知錯誤';
}

/**
 * 安全取得狀態碼
 */
export function getErrorStatusCode(error: unknown): number | undefined {
  if (isApiError(error)) {
    return error.statusCode;
  }
  return undefined;
}