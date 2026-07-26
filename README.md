# Narrow-X

A quiet, content-first Astro blog theme: bilingual routing with content fallback, self-hosted GitHub comments and admin, and a complete hardened VPS deploy stack. The visual language descends from [Hugo Narrow](https://github.com/tom2almighty/hugo-narrow), rebuilt Astro-native and extended in production by [s1oopX](https://github.com/s1oopX).

In production at [s1oopx.bond](https://s1oopx.bond).

[English](README.md) · [简体中文](README.zh-CN.md)

## Features

- Config-driven: site, navigation, content types, and color themes all live in `src/config/`
- Bilingual i18n with display fallback — switching locales never hides your content
- Content collections: posts, projects, recommendations, ordered series (with build-time reference validation), and pages
- Multiple color palettes with dark mode, per-hue WCAG-checked accents
- Search (fuse.js), filterable archives, TOC, per-article likes, gallery lightbox, Mermaid, KaTeX, content tabs
- Giscus comments restyled to match the theme (light/dark), lazy-loaded
- Sveltia CMS admin page plus a self-hosted GitHub OAuth backend
- Hardened deploy pipeline: HMAC-verified webhook, sandboxed systemd units, CSP sha256 hash allowlist, link/asset/CSP/browser self-tests
- SEO: canonical + hreflang, `og:type=article` with JSON-LD, sitemap with lastmod, localized RSS

## Quick Start

```sh
pnpm install
pnpm dev
pnpm build
```

Production uses the VPS webhook deployment in `docs/vps.md`. The GitHub Actions workflow verifies the site; it does not publish a second GitHub Pages copy.

RSS feeds are available at `/rss.xml` and `/en/rss.xml`, and each page advertises its localized feed for automatic discovery. Giscus comments are disabled in the template; fill in `comments.giscus` in `src/config/site.ts` and set `enabled: true` to turn them on. Visitors sign in with GitHub inside the comment box to publish. Set `comments: false` in a post's frontmatter to disable comments for that post. Comments use strict pathname matching, so published filenames and URL slugs must remain stable; migrate the matching Discussion before changing one. The repository must have Discussions enabled and the [Giscus GitHub App](https://github.com/apps/giscus) installed before comments can load.

## Repository and Deployment Flow

The complete site is stored in the `main` branch of the `your-github/narrow-x` GitHub repository. Git stores versioned snapshots of every tracked project file; the site is not kept as one archive and does not use an article database.

```text
src/content/       Posts, projects, recommendations, series, and pages
src/               Astro components, configuration, styles, and browser scripts
public/            Project screenshots, icons, uploads, and the admin page (covers live in src/assets/covers/)
server/            GitHub OAuth and deployment webhook services
deploy/            Nginx, systemd, and environment file templates
scripts/           Build, check, deployment, and rollback scripts
pnpm-lock.yaml     Reproducible dependency versions
```

Local changes enter the same repository through Git:

```text
edit files → git add → git commit → git push origin main
```

Sveltia CMS uses the GitHub backend and creates commits directly on `main`. After each push, GitHub Actions verifies the project independently, while the production webhook tells the VPS to fetch the commit, build a release, and atomically switch `/var/www/narrow-x/current` to the new version.

`dist/`, `.astro/`, `node_modules/`, and environment files are not committed. Production secrets live in `/etc/narrow-x/oauth.env` and `/etc/narrow-x/deploy.env` on the VPS, and Cloudflare Tunnel credentials must also be backed up separately in encrypted storage.

A Git clone does not include GitHub Discussions. After real comments appear, periodically export Discussions, comments, and replies through the GitHub API and keep that export in the existing backup location outside GitHub.

To recover on a new VPS, clone the GitHub repository, restore those secrets, install dependencies, and run `scripts/deploy-vps.sh`. See `docs/vps.md` for the complete procedure.

## Main Config Files

| File                    | Purpose                                        | Common options                                                                 |
| ----------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------ |
| `src/config/site.ts`    | Site, author, and global features              | `contentWidth`, `nav`, `footerNav`, `comments`, `analytics`, `gallery`, `post` |
| `src/config/content.ts` | Lists and home sections for Posts and Projects | `cardStyle`, `listLayout`, `gridColumns`, `home.enabled`, `home.limit`         |
| `src/config/i18n.ts`    | Locales and display names                      | `defaultLocale`, `locales`, `localeMeta`                                       |
| `src/config/theme.ts`   | Palettes available in the Dock                 | `themes`                                                                       |
| `src/content.config.ts` | Available frontmatter fields                   | Update when adding or changing content fields                                  |

`cardStyle` accepts `article`, `showcase`, or `compact`; `listLayout` accepts `stack` or `grid`; `gridColumns` accepts `1`, `2`, or `3`.

When adding a locale, also update `i18n.locales` in `astro.config.mjs` and the allowed `lang` values in `src/content.config.ts`.

Navigation supports `posts`, `series`, `projects`, `recommendations`, and `archives`; the footer also accepts `rss`:

```ts
nav: ["posts", "series", "projects", "archives"],
footerNav: ["archives", "rss"],
```

A custom item requires localized labels, a URL, and a Lucide icon:

```ts
{
  label: { en: "Docs", "zh-cn": "文档" },
  href: "https://example.com/docs/",
  icon: "lucide:book-open",
}
```

## Content Taxonomy

Posts use `categories` and `tags`, both as string arrays:

```yaml
---
title: Writing with Narrow-X
pubDate: 2026-07-10
categories: [Guides]
tags: [Astro, Markdown]
---
```

- `categories`: broad content groups such as `Guides` or `Essays`.
- `tags`: topics or technologies covered by the post; multiple values are allowed.
- Projects only use `tags`.
- Pages do not use `categories` or `tags`.

Archives filter URLs can be shared directly:

```text
/archives/?category=Guides
/archives/?tag=Astro
/archives/?category=Guides&tag=Astro
```

## Ordered Series

Create a Markdown file under `src/content/series/<locale>/`. Its filename becomes the Series URL slug, and its Markdown body can provide an introduction.

```yaml
---
title: Narrow-X Practical Guide
description: From content authoring to deployment.
draft: false
chapters:
  - en/authoring-content-collections
  - en/configure-series
  - en/deploy-github-pages
---
Follow the chapters in order to move from writing content to deploying the site.
```

Replace the chapter ids with your own published posts — a series fails the build when a chapter reference points at a missing or draft post.

| Option        | Required | Purpose                                        |
| ------------- | -------- | ---------------------------------------------- |
| `title`       | Yes      | Series title                                   |
| `description` | No       | Summary shown on index and detail pages        |
| `chapters`    | Yes      | Post IDs in reading order; at least two        |
| `draft`       | No       | Set to `true` to hide the public Series        |
| `lang`        | No       | Usually inferred from the `<locale>` directory |

A Post ID is the path relative to `src/content/posts/`, without its extension. A Series and all its chapters must use the same locale, chapters must be published, and a post can belong to only one public Series. Reorder the `chapters` array without changing post URLs.

`/series/` lists all Series, and `/series/<slug>/` shows the introduction and chapter list. Remove `"series"` from `siteConfig.nav` when a primary navigation entry is not needed.

## Markdown Tabs

Tabs use `remark-directive` syntax. The outer container uses four colons because it contains nested directives.

````md
::::tabs
:::tab{title="site.ts"}

```ts
export const siteConfig = {
  // Default page width; visitors can override it from Dock display settings.
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

## Project-base compatibility

Production is published only through the VPS webhook; `.github/workflows/deploy.yml` does not deploy a GitHub Pages copy. Actions still build once with `ASTRO_BASE=/narrow-x/` to verify project-path links and assets. This is a portability check, not a Pages deployment, and requires no Pages configuration.

## License

This project is licensed under the [GNU General Public License Version 3](LICENSE).
