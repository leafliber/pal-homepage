# Pal AI Lab

以 Pal AI 的像素眼睛为起点，自动生成一个开源游戏世界。五幕依次介绍品牌、Cortico、Coopanion、Cortina，并发出共建邀请。动画是视觉表达，页面不运行 AI 模型。

## 环境与运行

Node **26.8.1**（`.node-version`）、pnpm **11.11.0**（`packageManager`）。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

| 命令                                  | 用途                                   |
| ------------------------------------- | -------------------------------------- |
| `pnpm check`                          | Astro / 严格 TypeScript 检查           |
| `pnpm build`                          | 生成纯静态 `dist/`                     |
| `pnpm preview`                        | 预览已有构建，默认 4321                |
| `pnpm exec astro preview --port 4337` | 其他项目占用默认端口时的独立预览       |
| `pnpm test:e2e`                       | Playwright 浏览器验收；先构建          |
| `pnpm preview:cf`                     | 构建并用 Wrangler 预览，默认 8787      |
| `pnpm deploy:dry`                     | 构建并执行 Wrangler dry-run            |
| `pnpm deploy`                         | 检查、构建并部署 Workers Static Assets |

测试优先使用本机 Chrome；无 Chrome 时可运行 `pnpm exec playwright install chromium`。对现有预览执行测试：

```sh
BASE_URL=http://127.0.0.1:4337 pnpm test:e2e
```

## 五幕像素旅程

- **序章**：约 8.6 秒的自动开场：空场 → 一双眼睛苏醒、张望 → 角色发出种子 → 岛屿形成 → 植物生长与晶体亮起 → 新伙伴出现并回应。正文在约 2.25 秒出现，不需要等待完整剧情才能导航。之后以 14 秒的因果动作循环和停顿延续故事。
- **Cortico**：常驻事件核心，表现感知、连接上下文与行动。
- **Coopanion**：桌面上的伙伴，带有自动跳跃、气泡与日常物件。
- **Cortina**：扩展建造台，将想法转为新能力。
- **共建**：打开的传送门，邀请代码、设计、文档和想法贡献。

背景、页眉与底部章节导航固定。同一个像素主角从睁眼开始，按照各章 SVG 锚点跨场景移动，内容使用离散步进位移切换，取消平滑滚动。滚轮、触屏滑动、键盘和链接均可翻页；保留深链接及浏览器前进/后退。短屏或文字放大时，先滚动当前章节的内容，再前往下一章。

所有动画采用本地 SVG/CSS，无远程字体、Canvas 或 Three 运行时加载。后台和非当前场景暂停动画；页面提供可选暂停开关，并遵循系统的减少动态效果设置。没有 JavaScript 时，内容恢复为可直接浏览的连续文档。

## 维护位置

| 文件                              | 职责                                     |
| --------------------------------- | ---------------------------------------- |
| `src/pages/index.astro`           | 五幕文案、结构、项目链接、共建与章节导航 |
| `src/components/PixelWorld.astro` | 五种像素游戏场景与自动动画               |
| `src/components/PixelText.astro`  | 本地 5×7 像素字形，装饰文字使用 SVG      |
| `src/components/Header.astro`     | 品牌与响应式导航                         |
| `src/scripts/pixel-journey.ts`    | 离散翻页、触屏、键盘、历史与焦点管理     |
| `src/styles/global.css`           | 固定舞台、步进转场、配色与响应式         |
| `src/data/projects.ts`            | 已核实的项目事实与公开来源               |
| `src/data/site.ts`                | 站点元数据与 `SITE_URL` 构建时配置       |
| `tests/home.spec.ts`              | 浏览器验收                               |

分享封面复用 Hero 像素场景，可在构建后运行 `node scripts/generate-og.mjs` 更新 `public/images/og.png`，再重新构建将图片复制到发布目录。

`src/scripts/pixel-story.ts` 控制一次性开场、暂停/后台计时和角色锚点；`src/styles/story.css` 管理主角动作与登场。装饰性英文、场景编号、阶段标签和说明字幕已移除。无 JS 时用 `public/images/pixel-pal.svg` 补足主角。

旧版 `LivingCore.astro`、`core*.ts`、素材与生成脚本保留供参考，当前首页不引用这些代码。旧测试在本地原样备份于 `artifacts/pre-pixel-home.spec.ts`。

## 本版验收

2026-09-29 本地检查与静态构建通过，20 项浏览器验收全部通过。验收覆盖 1440、1024、390、320px 的全部五幕、自动生成动画、暂停恢复、固定背景、滚轮/键盘导航、深链接与历史、手机菜单、无 JS、减少动态效果、逐幕 WCAG、资源错误与真实 404。

截图：`artifacts/pixel-{desktop-1440,tablet-1024,mobile-390,narrow-320}-{home,projects,coopanion,cortina,join}.png`。报告：`artifacts/playwright-report/index.html`。旧版 Lighthouse 分数仅作为历史资料，不代表本次改版的测量结果。

## Cloudflare Workers Static Assets

`wrangler.jsonc` 使用 Worker 名 `pal-homepage`，发布目录为 `dist`；保持纯静态构建，不增加 SSR 或服务端。`404.html` 配合 `404-page` 返回真正 404。`public/_headers` 随构建复制；只有带哈希的 `/_astro/*` 路径使用长期 immutable 缓存。

部署前核实账户、目标 Worker 与真实站点地址。通过 `SITE_URL` 配置公开 HTTPS origin；未配置时省略绝对 canonical/OG 字段与 sitemap 条目。本次只完成本地改版和验收，未执行部署。

两个 GitHub 远端已配置：`origin` 获取主仓库内容，推送同时发送到 `Pal-AI-Lab/pal-homepage` 与 `leafliber/pal-homepage`。新增的 `leafliber` 远端可以独立获取个人仓库的更新。
