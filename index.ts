import type { ExecutionContext } from "@cloudflare/workers-types";

// 环境变量类型定义：缓存配置
export interface Env {
  CACHE_TTL_HOURS?: number; // 缓存时间（小时），默认744小时（31天）
  ORIGIN_DOMAIN?: string; // 原站域名
  BACKUP_DOMAIN?: string; // 备用域名
  ORIGIN_PROTOCOL?: string; // 原站协议（http 或 https）
}

// 支持自动转换的原图片格式（仅PNG/JPG/JPEG）
const SUPPORT_FORMATS = new Set(['png', 'jpg', 'jpeg']);
// 单源拉取超时时间：10秒（避免单个源超时阻塞请求）
const FETCH_TIMEOUT = 10000;
// 默认原站域名（从配置文件中读取）
const DEFAULT_ORIGIN = '';
// 默认协议
const DEFAULT_PROTOCOL = 'https';

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    
    // 获取协议（从环境变量或默认值）
    const protocol = env.ORIGIN_PROTOCOL || DEFAULT_PROTOCOL;
    
    // 获取原站域名（从环境变量或默认值）
    const originDomain = env.ORIGIN_DOMAIN || DEFAULT_ORIGIN;
    
    // 构建源站 URL 列表（原站 + 备用）
    const sources: string[] = [`${protocol}://${originDomain}${url.pathname}${url.search}`];
    if (env.BACKUP_DOMAIN) {
      sources.push(`${protocol}://${env.BACKUP_DOMAIN}${url.pathname}${url.search}`);
    }
    
    // 3. 获取文件后缀（转小写，兼容JPG/JPEG）
    const ext = url.pathname.split('.').pop()?.toLowerCase() || '';
    // 从配置读取缓存时间（小时），默认744小时（31天）
    const cacheTtlHours = env.CACHE_TTL_HOURS || 744;
    const CACHE_TTL = cacheTtlHours * 60 * 60; // 转换为秒
    
    // 4. 构造缓存 key
    const cacheKey = new Request(url.toString(), request);
    const cache = caches.default as any;
    
    // 5. 尝试从缓存获取
    let response = await cache.match(cacheKey);
    
    // 6. 缓存未命中，拉取源文件并处理
    if (!response) {
      console.log(`Cache miss for: ${url}`);
      
      // 尝试从多个源站拉取
      let originResponse: Response | null = null;
      let lastError: Error | null = null;
      
      for (const src of sources) {
        try {
          console.log(`尝试从源站拉取：${src}`);
          
          // 检查是否需要转换为 WebP
          const accept = request.headers.get('accept') || '';
          const isWebPSupported = /image\/webp/.test(accept);
          
          // 准备 fetch 选项
          const fetchOptions: RequestInit & { cf?: any } = {
            method: 'GET',
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; CDN/1.0)',
            },
            signal: AbortSignal.timeout(FETCH_TIMEOUT)
          };
          
          // 如果是PNG/JPG且客户端支持WebP，添加图片转换选项
          if (SUPPORT_FORMATS.has(ext) && isWebPSupported) {
            console.log(`Converting to WebP: ${src}`);
            fetchOptions.cf = {
              image: {
                format: 'webp',
                quality: 80, // 默认画质改为80
                fit: 'scale-down'
              }
            };
          }
          
          // 拉取源文件（Cloudflare 会自动转换）
          originResponse = await fetch(src, fetchOptions);
          
          // 源站返回非2xx状态码
          if (!originResponse.ok) {
            console.error(`源站返回错误状态码：${originResponse.status}`);
            throw new Error(`Source returned ${originResponse.status}`);
          }
          
          console.log(`源站拉取成功：${src}`);
          break; // 成功拉取，跳出循环
        } catch (err) {
          console.error(`从 ${src} 拉取失败：`, err);
          lastError = err as Error;
          originResponse = null;
          // 继续尝试下一个源站
        }
      }
      
      // 所有源站都失败
      if (!originResponse) {
        return new Response(`Failed to fetch from all sources: ${(lastError as Error).message}`, { status: 503 });
      }
      
      // 7. 创建新的响应对象
      const newHeaders = new Headers();
      
      // 复制原始headers（除了缓存相关的）
      for (const [key, value] of originResponse.headers.entries()) {
        if (key.toLowerCase() !== 'cache-control' && 
            key.toLowerCase() !== 'pragma' && 
            key.toLowerCase() !== 'expires') {
          newHeaders.set(key, value);
        }
      }
      
      // 设置缓存头
      newHeaders.set('Cache-Control', `public, max-age=${CACHE_TTL}`);
      
      // 创建新的响应
      response = new Response(originResponse.body, {
        status: originResponse.status,
        statusText: originResponse.statusText,
        headers: newHeaders
      });
      
      // 将文件存入缓存，不阻塞响应
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    } else {
      console.log(`Cache hit for: ${url}`);
    }
    
    // 8. 返回处理后的文件
    return response;
  },
};
