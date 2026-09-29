# Pal AI Lab

简洁的深灰、白色和绿色官网。首屏以原创 C 形伙伴解释“感知 → 连接 → 回应”，展示 Cortico、Coopanion、Cortina 三个公开项目。动画是概念演示，页面不运行 AI 模型。

## 环境与运行

Node **26.8.1**（`.node-version`）、pnpm **11.11.0**（`packageManager`）。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | Astro 开发服务器，默认 4321 |
| `pnpm check` | Astro / 严格 TypeScript 检查 |
| `pnpm build` | 生成纯静态 `dist/` |
| `pnpm preview` | 预览已有构建，默认 4321 |
| `pnpm preview:cf` | 构建并用 Wrangler 预览，默认 8787 |
| `pnpm test:e2e` | Playwright 浏览器验收；先构建 |
| `pnpm deploy:dry` | 构建并执行 Wrangler dry-run，不上线 |
| `pnpm deploy` | 检查、构建并部署 Workers Static Assets |

测试优先使用本机 Chrome；无 Chrome 时运行 `pnpm exec playwright install chromium`。设置 `BASE_URL` 可对现有服务器或真实线上地址验收，例如 `BASE_URL=http://127.0.0.1:8787 pnpm test:e2e`。

## 内容与视觉维护

- `src/data/projects.ts`：项目名称、描述、入口、图片尺寸、公开来源与许可。页面不请求 GitHub API。
- `src/data/site.ts`：站点文案与 `SITE_URL` 构建时环境变量。没有真实地址时省略绝对 canonical/OG 字段和 sitemap 条目；获得真实地址后重新构建部署。
- `src/pages/index.astro`：首屏、项目、理念三段结构，主要文案与链接都在 HTML 中。
- `src/styles/global.css`、`projects.css`：布局、配色、响应式。背景 `#262626`，官方绿色 `#00A870`；深色面上的绿字使用更亮的颜色保证对比度。
- `src/components/LivingCore.astro`：静态图、简短阶段说明、发送信号与暂停控件。
- `src/scripts/core-shape.ts`：原创曲面。`node scripts/generate-core.mjs` 用相同几何生成静态 WebP。
- `src/scripts/core-webgl.ts`：可选 Three 场景与 12 秒周期；2 秒接收、3 秒连接、2 秒回应，其余时间休息。`core.ts` 管理移动端演示、减少动态与交互事件。
- `node scripts/generate-og.mjs`：生成同风格的本地 OG 图片（使用 Chrome）。
- `public/images/ATTRIBUTION.txt`：官方 Cortico / Coo 的固定来源与 MIT 许可；Pal 像素标识是用户提供的原图。

桌面首屏后才动态加载 Three；单 Canvas、DPR≤1.5、最多 30fps，无全屏后处理。离屏、后台与主动暂停都会停止绘制；初始化失败或 context lost 回到同形静态图。手机用静态造型与轻量信号演示；减少动态时点击直接显示结果。不依赖 hover，不滚动劫持，不隐藏鼠标。项目进入视口仅做一次轻微位移，正文初始可见。

## Cloudflare Workers Static Assets

`wrangler.jsonc` 固定 Worker 名 `pal-homepage`，只部署 `dist`；没有 `main`、ASSETS binding、SSR adapter 或 Pages 配置。`404.html` 配合 `404-page` 返回真正 404。`compatibility_date=2026-09-26` 与锁定 Wrangler 内置 workerd 对齐。

`public/_headers` 构建时复制；安全响应头作用于静态文件。只有内容哈希路径 `/_astro/*` 使用一年 immutable，HTML 与普通图片不设长期 immutable。

部署步骤：先 `pnpm exec wrangler whoami` 确认账户；需要时使用官方 OAuth，不把 Token 写入聊天、Git 或前端。确认同名 Worker 属于本项目后执行验收、dry-run 和部署。取得真实地址后设置 `SITE_URL`，重新构建部署并复验根路径、资源、真实 404、响应头、移动端和静态降级。

### Workers Builds

仅配置这一套持续部署流程；首次 CLI 部署不依赖它。

| 字段 | 值 |
| --- | --- |
| 仓库 / 根目录 | `Pal-AI-Lab/pal-homepage` / `/` |
| 依赖安装 | `pnpm install --frozen-lockfile` |
| 构建命令 | `pnpm check && pnpm build` |
| 部署命令 | `pnpm exec wrangler deploy` |
| `NODE_VERSION` / `PNPM_VERSION` | `26.8.1` / `11.11.0` |
| `SITE_URL` | 部署后核实的真实公开 origin |

提交锁文件；自动安装依赖时也使用冻结锁文件。未自动建立 Builds 连接、push、merge、改 DNS 或仓库可见性。

官方依据：[Astro 静态配置](https://developers.cloudflare.com/workers/framework-guides/web-apps/astro/)、[Static Assets](https://developers.cloudflare.com/workers/static-assets/)、[SSG 路由](https://developers.cloudflare.com/workers/static-assets/routing/static-site-generation/)、[Headers](https://developers.cloudflare.com/workers/static-assets/headers/)、[Builds](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)。

## 本版验收与状态

2026-09-29 在 macOS、本机 Chrome 153 和 Wrangler Static Assets 本地预览中完成本版验收：

- `pnpm check`：18 个文件，0 错误、警告和提示。
- `pnpm deploy:dry`：完整静态构建及 Wrangler dry-run 成功；不代表已部署。17 个发布文件共约 744 KiB，不含 `.env`、Git 信息、源码或 source map。
- `BASE_URL=http://127.0.0.1:8787 pnpm test:e2e`：**16 / 16 通过**。覆盖 1440、1024、390、320px，手机菜单与键盘、无 JS、减少动态、WebGL 不可用及 context lost、完整信号阶段、暂停/恢复、离屏/后台停帧、控制台和资源错误、axe 与真实 404。
- 本地 HTTP 验证：首页 200，不存在路径 404；安全响应头生效，哈希资源 immutable，HTML 不长期缓存。

Lighthouse 13.5.0 CLI 实测（桌面 `--preset=desktop`；手机默认模拟网络与 4 倍 CPU 降速）：

| 本地测试 | Performance / Accessibility / Best Practices / SEO | LCP | TBT | CLS | 页面传输量 |
| --- | --- | --- | --- | --- | --- |
| 桌面 | 100 / 100 / 100 / 100 | 0.39s | 0ms | 0.00015 | 218 KiB |
| 手机 | 100 / 100 / 100 / 100 | 1.59s | 0ms | 0 | 83 KiB |

初始非 3D JavaScript 合计约 **2.9 KiB gzip**。Three 为独立延迟加载模块，约 536 KiB 原始大小 / 133 KiB gzip，构建保留体积提示；手机不请求该模块。这是每种设备配置各一次的本地实验数据，不代表线上长期体验。报告仍提示图片可进一步压缩、Three 部分代码未使用；本版没有为消除提示而牺牲静态降级图清晰度。`artifacts/simplified-performance-summary.json` 保存完整环境与指标。

截图和录屏（本地验收产物，不进入 `dist`）：

- `artifacts/simplified-desktop-1440.png`、`artifacts/simplified-mobile-390.png`：完整页面。
- `artifacts/simplified-hero-final.png`：实际 WebGL 首屏；`artifacts/simplified-signal-demo.webm`：完整信号交互录屏。
- `artifacts/simplified-tablet-1024.png`、`artifacts/simplified-narrow-320.png` 及同前缀的降级截图。
- `artifacts/playwright-report/index.html`、`artifacts/simplified-lighthouse-desktop.report.html`、`artifacts/simplified-lighthouse-mobile.report.html`：原始报告。

旧版截图和性能报告仅作历史记录，不代表本版数据。当前本地预览为 `http://127.0.0.1:8787/`，需保持 Wrangler 进程运行。

**线上仍未部署。** 本次再次执行 `pnpm exec wrangler whoami --json`，返回 `{"loggedIn":false}`；此前最小权限 OAuth 等待授权超时。需要账户持有人完成授权，然后核实账户和目标 Worker、部署并回填真实 SITE_URL；当前没有经过验证的线上 URL。进度见 `DECISIONS.md`。
