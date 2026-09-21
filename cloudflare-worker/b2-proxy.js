/**
 * Cloudflare Worker: B2 S3 代理（CORS 全開版本）
 */

const B2_S3_ENDPOINT = 's3.us-west-004.backblazeb2.com';

// CORS 標頭 - 全開寫法
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Authorization, Content-Type, X-Amz-*',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, ETag, Last-Modified',
    'Access-Control-Max-Age': '86400',
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // 處理 OPTIONS 預檢請求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    // 只允許 GET/HEAD
    if (!['GET', 'HEAD'].includes(request.method)) {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders() });
    }

    // 建構回源 URL：保持 path + query 完整轉發
    const upstreamUrl = `https://${B2_S3_ENDPOINT}${url.pathname}${url.search}`;

    // 複製請求標頭，但強制覆寫 Host
    const upstreamHeaders = new Headers(request.headers);
    upstreamHeaders.set('Host', B2_S3_ENDPOINT);
    
    // 移除可能干擾的標頭
    upstreamHeaders.delete('cf-connecting-ip');
    upstreamHeaders.delete('cf-ray');
    upstreamHeaders.delete('cf-visitor');
    upstreamHeaders.delete('x-forwarded-for');

    // 發送回源請求
    const upstreamRequest = new Request(upstreamUrl, {
      method: request.method,
      headers: upstreamHeaders,
      redirect: 'follow',
    });

    try {
      const upstreamResponse = await fetch(upstreamRequest, { cf: { cacheEverything: true, cacheTtl: 31536000 } });

      // 建立回應，注入 CORS
      const responseHeaders = new Headers(upstreamResponse.headers);
      
      // 確保快取標頭（若上游無則補上）
      if (!responseHeaders.has('Cache-Control')) {
        responseHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');
      }
      
      // 移除上游可能帶的限制性 CORS
      responseHeaders.delete('access-control-allow-origin');
      responseHeaders.delete('access-control-allow-credentials');

      // 透傳關鍵標頭
      const allowedPassthrough = [
        'content-type', 'content-length', 'content-range', 'accept-ranges',
        'etag', 'last-modified', 'cache-control', 'expires',
        'x-amz-request-id', 'x-amz-id-2', 'x-amz-version-id',
      ];
      
      const finalHeaders = new Headers();
      allowedPassthrough.forEach(h => {
        if (responseHeaders.has(h)) finalHeaders.set(h, responseHeaders.get(h));
      });
      
      // 注入全開的 CORS 標頭
      Object.entries(corsHeaders()).forEach(([k, v]) => finalHeaders.set(k, v));

      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: finalHeaders,
      });

    } catch (err) {
      console.error('[B2 Proxy] Upstream fetch failed:', err);
      return new Response('Bad Gateway', { 
        status: 502, 
        headers: corsHeaders() 
      });
    }
  },
};