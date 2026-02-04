# CDN Indoorplayground - 网站镜像与图片优化服务

基于 Cloudflare Workers 的 CDN 服务，为 indoorplayground.com.cn 网站提供全球镜像加速，支持 PNG/JPG 图片自动转换为 WebP 格式，其他文件直接镜像，保持完全一致的 URL 路径。

## 功能特性

- ✅ 完全镜像原站内容，保持 URL 路径一致
- ✅ PNG/JPG 图片自动转换为 WebP 格式（80% 画质）
- ✅ 利用 Cloudflare 边缘缓存，减少重复转换
- ✅ 智能缓存控制（31 天缓存时间）
- ✅ 全球 CDN 加速
- ✅ 支持自定义域名
- ✅ 错误处理与日志记录

## 前置要求

- [Node.js](https://nodejs.org/) 18+ 
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
- [Cloudflare 账号](https://dash.cloudflare.com/sign-up)

## 部署步骤

### 1. 安装 Wrangler CLI

```bash
npm install -g wrangler
```

### 2. 登录 Cloudflare

```bash
wrangler login
```

浏览器会打开 Cloudflare 授权页面，完成登录授权。

### 3. 配置原站域名

编辑 `wrangler.toml` 文件，修改原站域名：

```toml
[vars]
ORIGIN_DOMAIN = "indoorplayground.com.cn"  # 原站域名
CACHE_TTL_HOURS = 744  # 缓存时间（小时），默认31天=744小时
```

### 4. 配置自定义域名

在 `wrangler.toml` 中配置：

```toml
routes = [
  { pattern = "cdn.indoorplayground.com.cn/*", custom_domain = true }
]
```

### 5. 安装项目依赖

```bash
npm install
```

### 6. 本地测试（可选）

```bash
wrangler dev
```

访问 `http://localhost:8787/wp-content/uploads/2025/10/example.jpg` 测试功能。

### 7. 部署到 Cloudflare

```bash
wrangler deploy
```

部署成功后会显示 Worker 的访问地址，例如：
```
Published cdn-indoorplayground (X.XX sec)
  https://cdn-indoorplayground.你的账号.workers.dev
```

## 使用方法

### URL 格式

保持与原站完全一致的路径：

```
# 原站 URL
https://indoorplayground.com.cn/wp-content/uploads/2025/10/image.jpg

# CDN URL
https://cdn.indoorplayground.com.cn/wp-content/uploads/2025/10/image.jpg
```

### 示例

**图片（会自动转换为 WebP）：**
- 原站：`https://indoorplayground.com.cn/wp-content/uploads/2025/10/image.jpg`
- CDN：`https://cdn.indoorplayground.com.cn/wp-content/uploads/2025/10/image.jpg`

**其他文件（直接镜像）：**
- 原站：`https://indoorplayground.com.cn/css/style.css`
- CDN：`https://cdn.indoorplayground.com.cn/css/style.css`

### 转换逻辑

- **PNG/JPG 文件** - 自动转换为 WebP 格式（80% 画质）
- **其他文件** - 直接镜像，保持原格式

## 配置说明

### 环境变量

| 变量 | 说明 | 示例 |
|------|------|------|
| ORIGIN_DOMAIN | 原站域名 | `indoorplayground.com.cn` |
| CACHE_TTL_HOURS | 缓存时间（小时） | `744`（31天） |

### 转换参数

可在 `src/index.ts` 中调整以下参数：

```typescript
// 支持的图片格式
const SUPPORT_FORMATS = new Set(['png', 'jpg', 'jpeg']);

// WebP 转换配置
fetchOptions.cf = {
  image: {
    format: 'webp',
    quality: 80, // 默认画质
    fit: 'scale-down'
  }
};
```

## 技术架构

- **运行环境**：Cloudflare Workers
- **转换引擎**：Cloudflare Images API
- **缓存策略**：Cloudflare Edge Cache
- **语言**：TypeScript
- **部署方式**：Wrangler CLI

## 注意事项

1. 确保 Cloudflare 账号已启用 Images 功能
2. 原站需要允许跨域访问
3. 首次访问会有转换延迟，后续请求直接从缓存返回
4. 对于较大的图片，Cloudflare 可能会选择返回原始格式以保持较小文件大小

## 故障排查

### 部署失败
- 检查 `wrangler.toml` 配置是否正确
- 确认已登录 Cloudflare 账号

### 文件无法访问
- 检查原站是否可访问
- 确认原站允许跨域访问
- 查看 Worker 日志：`wrangler tail`

### 转换失败
- 确认 Cloudflare Images 功能已启用
- 检查图片格式是否为 PNG/JPG
- 查看响应头中的 `warning` 信息

## 许可证

MIT
