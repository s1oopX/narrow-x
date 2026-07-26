# AGENTS.md

本仓库是 `narrow-x`，一个从 `hugo-narrow` 迁移而来的 Astro 主题。基础迁移已经完成，后续开发应优先使用 Astro 原生能力实现功能，不再为 Hugo Narrow 做向后兼容。

## 项目定位

- 这是内容型 Astro 主题仓库，不是 Hugo 主题适配层。
- Hugo Narrow 只作为视觉和体验参考；实现方式以 Astro 7、Content Collections、Astro 路由、Astro 组件、remark/rehype 构建期转换为准。
- 不新增 Hugo shortcode、Hugo front matter 别名、Hugo taxonomy 兼容、模板语法兼容或迁移 shim。
- 用户可配置能力应沉淀在 `src/config/*` 和内容 schema 中，而不是要求用户修改内部组件。

## 技术栈

- 包管理器：`pnpm`
- Node：`>=22.13.0`
- 框架：Astro 7
- 样式：Tailwind CSS 4 + `src/styles/global.css` + `src/styles/themes.css`
- 图标：`astro-icon`，优先使用 `lucide:*`；品牌图标使用 `simple-icons:*`
- Markdown：`@astrojs/markdown-remark` + 自定义 remark/rehype 插件
- 代码块：`astro-expressive-code`
- 搜索：前端 `fuse.js` + `src/pages/api/search.json.ts`
- 图库：`smart-gallery`

## 常用命令

```sh
pnpm install
pnpm dev
pnpm build
pnpm preview
```

部署到 GitHub Pages 项目页时，必须验证 `base`：

```sh
ASTRO_BASE=/narrow-x/ pnpm build
```

如需验证站点绝对 URL，可同时设置：

```sh
ASTRO_SITE=https://<user>.github.io ASTRO_BASE=/narrow-x/ pnpm build
```

## 目录约定

- `src/config/site.ts`：站点信息、作者信息、导航、评论、统计、图库、license、全局 UI 开关。
- `src/config/content.ts`：内容类型定义，包括 path、label、icon、卡片样式、列表布局、首页区块。
- `src/config/i18n.ts`：语言、路径生成、语言切换路径。所有内部链接优先使用这里的 helper。
- `src/config/theme.ts`：主题切换选项。
- `src/content.config.ts`：Content Collections schema。
- `src/content/posts/<locale>`：文章内容。
- `src/content/projects/<locale>`：项目内容。
- `src/content/recommendations/<locale>`：推荐内容。
- `src/content/series/<locale>`：系列（章节引用文章）。
- `src/content/pages/<locale>`：普通页面内容。
- `src/pages`：Astro 文件路由，包括默认语言路由和 `[locale]` 本地化路由。
- `src/components/layout`：页面骨架。
- `src/components/content`：内容列表、元信息、taxonomy、面包屑、相关文章等内容组件。
- `src/components/features`：搜索、评论、统计、TOC 等功能组件。
- `src/components/ui`：通用 UI 组件。
- `src/scripts`：浏览器端增强脚本。
- `src/lib/content`：内容查询、排序、RSS 等内容逻辑。
- `src/lib/markdown`：Markdown 构建期转换插件。

## 路由和链接规则

- 默认语言是 `zh-cn`，不带 `/zh-cn/` 前缀；英文路径带 `/en/`。
- 生成内部链接时使用 `getLocalePath(locale, path)`，不要手写根路径绝对链接。
- GitHub Pages 项目页会设置 `ASTRO_BASE`。任何 `href="/..."` 都可能绕过 base，除非它确实是外部或根域需求。
- 语言切换路径使用 `switchLocalePath`，不要在组件里自行切分 base 和 locale。
- 导航项应通过 `src/config/navigation.ts` 解析，新增系统路由时扩展 route registry。
- sitemap/RSS/search 中的路径也要考虑 locale 和 base/site 的差异。

## 内容模型

- 内容集合包括 `posts`、`projects`、`recommendations`、`pages`、`series`。
- Posts 使用 `categories` 和 `tags`；Projects、Recommendations 使用 `tags`；Series 通过 `chapters` 引用文章。
- front matter 以 `src/content.config.ts` 为准。新增字段必须先更新 schema，再更新组件消费逻辑。
- 草稿使用 `draft` 字段；公开列表应继续过滤草稿。
- 多语言内容通过目录和 `lang`/路径约定处理，不要引入 Hugo bundle 规则。

## Markdown 功能

- 优先使用 Markdown 原生语义和 remark/rehype 构建期转换。
- Tabs 使用 `remark-directive`，实现位于 `src/lib/markdown/remark-tabs.mjs`。
- Alerts、heading anchors、image groups、Mermaid 位于 `src/lib/markdown/rehype-*.mjs`。
- 数学公式由 `remark-math` + `rehype-katex` 处理。
- 代码块能力优先交给 Expressive Code，不在组件中重复解析 fenced code。

## UI 和样式约定

- 保持主题的 compact reading layout：内容优先、布局克制、阅读密度适中。
- 新 UI 应复用现有 token、CSS 变量和 Tailwind utility，不引入新的重型 UI 框架。
- 主题颜色和设计 token 放在 `src/styles/themes.css` 或相关 config 中。
- 图标按钮优先使用 `astro-icon` + lucide 图标。
- 组件应支持浅色/深色主题，并避免写死只适合单一主题的颜色。
- 响应式布局必须覆盖移动端和桌面端。

## Astro Native 优先级

优先选择：

- Astro Content Collections schema 和 typed entries
- Astro 文件路由和 `getStaticPaths`
- Astro components 和 props
- `import.meta.env.BASE_URL`
- 构建期 remark/rehype 插件
- 配置驱动的主题能力

避免选择：

- Hugo template/shortcode 兼容层
- 为旧 Hugo front matter 添加隐式别名
- 在运行时解析 Markdown 字符串来模拟 Hugo 行为
- 复制 Hugo 的目录约定作为硬要求
- 为迁移期临时逻辑长期保留 shim

## 开发流程

- 修改前先读相关 config、组件和页面路由，确认现有模式。
- 保持变更范围小，避免顺手重构无关文件。
- 新增用户可见功能时同步考虑英文和简体中文文案。
- 新增路由或内部链接时，必须用带 `ASTRO_BASE` 的构建验证 GitHub Pages 项目页路径。
- 新增内容字段、配置项或行为时，同步更新 README 和示例内容，除非只是内部修复。
- 不要覆盖用户未要求修改的内容文件。

## 验证清单

基础验证：

```sh
pnpm build
```

提交前还应运行：

```sh
pnpm typecheck
pnpm oauth:self-test
pnpm deploy:self-test
pnpm run links:self-test
pnpm audit --prod
```

涉及链接、资源路径、导航、搜索、RSS、sitemap、语言切换时，还要验证：

```sh
ASTRO_BASE=/narrow-x/ pnpm build
```

构建后重点检查：

- 生成页面中内部链接是否包含正确 base。
- 默认语言路径是否不带 `/en/`。
- 默认语言（`zh-cn`）路径是否**不带**语言前缀，`en` 路径是否带 `/en/`。
- RSS、sitemap、search index 是否仍能生成。
- 静态资源路径是否没有绕过 `BASE_URL`。

## 维护原则

- Astro Native 优先。
- 配置优先于硬编码。
- 构建期转换优先于运行时补丁。
- 类型和 schema 优先于隐式约定。
- 主题体验可以继承 Hugo Narrow 的精神，但代码不背 Hugo 兼容包袱。
