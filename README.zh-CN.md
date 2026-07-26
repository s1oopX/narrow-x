# Narrow-X

安静的内容优先 Astro 博客主题：双语路由带内容回退、自托管 GitHub 评论与后台、以及一整套加固过的 VPS 部署链路。视觉语言承自 [Hugo Narrow](https://github.com/tom2almighty/hugo-narrow)，以 Astro 原生重建，并由 [s1oopX](https://github.com/s1oopX) 在生产环境持续打磨。

生产实例：[s1oopx.bond](https://s1oopx.bond)。

[English](README.md) · [简体中文](README.zh-CN.md)

## 特性

- 配置驱动：站点、导航、内容类型、配色主题全部集中在 `src/config/`
- 双语 i18n 带展示回退——切换语言不会藏起任何内容
- 内容集合：文章、作品、推荐、有序系列（构建期引用校验）与独立页面
- 多套配色 + 深色模式，强调色逐色相通过 WCAG 校验
- 搜索（fuse.js）、可筛选归档、目录、文章点赞、画廊灯箱、Mermaid、KaTeX、内容选项卡
- Giscus 评论深浅两套主题化样式，懒加载
- Sveltia CMS 后台页 + 自托管 GitHub OAuth 服务
- 加固部署链路：HMAC 校验 webhook、systemd 沙箱、CSP sha256 白名单、链接/资产/CSP/浏览器自检
- SEO：canonical + hreflang、`og:type=article` 与 JSON-LD、带 lastmod 的 sitemap、本地化 RSS

## 快速开始

```sh
pnpm install
pnpm dev
pnpm build
```

生产环境使用 `docs/vps.md` 中的 VPS webhook 部署流程。GitHub Actions 只负责校验，不再同时发布一份 GitHub Pages 站点。

RSS 地址为 `/rss.xml`，英文 feed 为 `/en/rss.xml`；页面头部也会提供 RSS 自动发现链接。文章默认开启 Giscus 评论，访客在评论框中使用 GitHub 登录后即可发表。单篇文章如需关闭评论，在 frontmatter 中设置 `comments: false`。评论按文章 pathname 严格匹配，因此文章发布后不得随意修改文件名或 URL slug；确需修改时应同步迁移对应 Discussion。仓库必须开启 Discussions，并安装 [Giscus GitHub App](https://github.com/apps/giscus) 后评论才会显示。

## 项目保存与发布流程

整个站点统一保存在 GitHub 仓库 `your-github/narrow-x` 的 `main` 分支中。Git 保存的是项目内所有已跟踪文件的版本快照，不是单个压缩包，也不使用文章数据库。

```text
src/content/       文章、作品、推荐、系列和普通页面
src/               Astro 组件、配置、样式和浏览器脚本
public/            项目截图、图标、上传目录和后台页面（封面在 src/assets/covers/）
server/            GitHub OAuth 与部署 webhook
deploy/            Nginx、systemd 和环境文件模板
scripts/           构建、检查、部署和回滚脚本
pnpm-lock.yaml     可重复安装的依赖版本
```

本地修改通过 Git 提交到同一仓库：

```text
修改文件 → git add → git commit → git push origin main
```

Sveltia CMS 使用 GitHub 后端，发布内容时会直接在 `main` 分支创建提交。每次 push 后，GitHub Actions 独立验证项目，生产 webhook 通知 VPS 拉取提交、构建新的 release，并把 `/var/www/narrow-x/current` 原子切换到新版本。

`dist/`、`.astro/`、`node_modules/` 和环境变量文件不会提交到 GitHub。生产密钥保存在 VPS 的 `/etc/narrow-x/oauth.env` 和 `/etc/narrow-x/deploy.env`，Cloudflare Tunnel 凭据也必须单独加密备份。

Git 克隆不包含 GitHub Discussions。出现真实评论后，应通过 GitHub API 定期导出 Discussion、评论和回复，并保存在 GitHub 之外的现有备份位置。

恢复到新 VPS 时，只需克隆 GitHub 仓库、恢复上述密钥、安装依赖并执行 `scripts/deploy-vps.sh`。详细步骤见 `docs/vps.md`。

## 主要配置文件

| 文件                    | 用途                             | 常用参数                                                                       |
| ----------------------- | -------------------------------- | ------------------------------------------------------------------------------ |
| `src/config/site.ts`    | 站点、作者和全局功能             | `contentWidth`, `nav`, `footerNav`, `comments`, `analytics`, `gallery`, `post` |
| `src/config/content.ts` | Posts、Projects 的列表和首页展示 | `cardStyle`, `listLayout`, `gridColumns`, `home.enabled`, `home.limit`         |
| `src/config/i18n.ts`    | 语言和显示名称                   | `defaultLocale`, `locales`, `localeMeta`                                       |
| `src/config/theme.ts`   | Dock 中的可选配色                | `themes`                                                                       |
| `src/content.config.ts` | 可用 frontmatter 字段            | 修改或增加内容字段时更新                                                       |

`cardStyle` 可使用 `article`、`showcase`、`compact`；`listLayout` 可使用 `stack`、`grid`；`gridColumns` 可设置为 `1`、`2`、`3`。

新增语言时，还需要同步更新 `astro.config.mjs` 的 `i18n.locales` 和 `src/content.config.ts` 的 `lang` 可选值。

导航可使用 `posts`、`series`、`projects`、`recommendations`、`archives`；页脚还可使用 `rss`：

```ts
nav: ["posts", "series", "projects", "archives"],
footerNav: ["archives", "rss"],
```

自定义导航项需要提供多语言名称、链接和 Lucide 图标：

```ts
{
  label: { en: "Docs", "zh-cn": "文档" },
  href: "https://example.com/docs/",
  icon: "lucide:book-open",
}
```

## 内容分类

Posts 使用 `categories` 和 `tags`，两者都是字符串数组：

```yaml
---
title: 使用 Narrow-X 编写文章
pubDate: 2026-07-10
categories: [指南]
tags: [Astro, Markdown]
---
```

- `categories`：文章所属分类，适合填写“指南”“随笔”等较宽泛的内容类型。
- `tags`：文章涉及的主题或技术，可填写多个。
- Projects 只使用 `tags`。
- Pages 不使用 `categories` 或 `tags`。

Archives 支持通过 URL 直接打开筛选结果：

```text
/archives/?category=Guides
/archives/?tag=Astro
/archives/?category=Guides&tag=Astro
```

## 有序系列

在 `src/content/series/<locale>/` 中创建 Markdown 文件，文件名会成为 Series 的 URL slug。Markdown 正文可用于编写系列导读。

```yaml
---
title: Narrow-X 实战指南
description: 从内容编写到生产部署。
draft: false
chapters:
  - zh-cn/authoring-content-collections
  - zh-cn/configure-series
  - zh-cn/deploy-github-pages
---
按照章节顺序阅读，可以从内容编写逐步完成站点部署。
```

请把示例中的章节 id 换成你自己已发布的文章——章节引用指向不存在或草稿文章时构建会直接失败。

| 参数          | 必填 | 用途                               |
| ------------- | ---- | ---------------------------------- |
| `title`       | 是   | Series 标题                        |
| `description` | 否   | 索引页和页面摘要                   |
| `chapters`    | 是   | 按阅读顺序填写的 Post ID，至少两篇 |
| `draft`       | 否   | 设为 `true` 时不生成公开 Series    |
| `lang`        | 否   | 通常由 `<locale>` 目录自动确定     |

Post ID 是 `src/content/posts/` 后的相对路径，不包含扩展名。Series 与所有章节必须使用同一语言，章节必须已经发布，并且一篇文章只能加入一个公开 Series。调整 `chapters` 数组顺序即可重新排序，不会改变文章 URL。

`/series/` 展示全部 Series，`/series/<slug>/` 展示导读和章节列表。不需要顶部入口时，从 `siteConfig.nav` 中移除 `"series"` 即可。

## Markdown Tabs

Tabs 使用 `remark-directive` 语法。外层容器使用四个冒号，因为内部还嵌套了 directive。

````md
::::tabs
:::tab{title="site.ts"}

```ts
export const siteConfig = {
  // 默认页面宽度，访客可在 Dock 的显示设置中调整。
  contentWidth: "56rem",
};
```

:::

:::tab{title="content.ts"}

```ts
export const contentTypes = {
  posts: { listLayout: "stack" },
};
```

:::
::::
````

## 项目路径兼容性

生产站点只通过 VPS webhook 发布，`.github/workflows/deploy.yml` 不负责发布 GitHub Pages。Actions 仍会额外构建一次 `ASTRO_BASE=/narrow-x/`，用于验证项目路径下的内部链接和静态资源；这只是可移植性检查，不需要配置仓库 Pages。

## 许可证

本项目基于 [GNU General Public License Version 3](LICENSE) 开源。
