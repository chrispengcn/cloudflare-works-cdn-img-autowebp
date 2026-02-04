import type { ExecutionContext } from "@cloudflare/workers-types";

// 环境变量类型定义：缓存配置
export interface Env {
  CACHE_TTL_HOURS?: number; // 缓存时间（小时），默认744小时（31天）
  ORIGIN_DOMAIN?: string; // 原站域名
}

// 支持自动转换的原图片格式（仅PNG/JPG/JPEG）
const SUPPORT_FORMATS = new Set(['png', 'jpg', 'jpeg']);
// 单源拉取超时时间：10秒（避免单个源超时阻塞请求）
const FETCH_TIMEOUT = 10000;
// 默认原站域名
const DEFAULT_ORIGIN = 'indoorplayground.com.cn';

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    
    // 获取原站域名（从环境变量或默认值）
    const originDomain = env.ORIGIN_DOMAIN || DEFAULT_ORIGIN;
    
    // 构建源站 URL
    const src = `https://${originDomain}${url.pathname}${url.search}`;
    
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
      
      try {
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
        const originResponse = await fetch(src, fetchOptions);
        
        // 源站返回非2xx状态码
        if (!originResponse.ok) {
          console.error(`源站返回错误状态码：${originResponse.status}`);
          return new Response(`Source returned ${originResponse.status}`, { status: originResponse.status });
        }
        
        console.log(`源站拉取成功：${src}`);
        
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
      } catch (err) {
        console.error('拉取源文件失败：', err);
        return new Response(`Failed to fetch source: ${(err as Error).message}`, { status: 503 });
      }
    } else {
      console.log(`Cache hit for: ${url}`);
    }
    
    // 8. 返回处理后的文件
    return response;
  },
};
