---
title: "Organizing Multilingual Content and Internal Links"
description: "Keep English and Chinese content, routes, taxonomy terms, and base-aware links predictable."
draft: false
pubDate: 2026-06-23
categories: ["Guides"]
tags: ["i18n", "Routing", "Astro"]
toc: "side"
---

Narrow-X uses English as the default locale and includes Simplified Chinese as an example second locale. The URL structure is intentionally asymmetric: English pages have no `/en/` prefix, while Chinese pages live below `/zh-cn/`.

## Mirror content by locale directory

Place translated entries in matching collection directories:

```text
src/content/posts/en/deploy-github-pages.md
src/content/posts/zh-cn/deploy-github-pages.md
```

Matching filenames make the relationship easy to understand, but each file remains a complete content entry with its own title, description, dates, body, categories, and tags. A translation can be added later without blocking the original article.

## Localize display taxonomy

Archive terms are local display values rather than cross-language IDs:

```yaml
# English
categories: ["Guides"]
tags: ["Routing", "Astro"]

# Simplified Chinese
categories: ["指南"]
tags: ["路由", "Astro"]
```

This keeps authoring simple and makes the filters read naturally. It also means the theme does not automatically infer that `Guides` and `指南` are the same entity; maintain naming consistency inside each locale.

## Generate internal paths through helpers

Use `getLocalePath(locale, path)` for system and content links. It handles both the default-locale rule and `ASTRO_BASE`:

```ts
getLocalePath('en', '/archives/')
// /archives/

getLocalePath('zh-cn', '/archives/')
// /zh-cn/archives/
```

On a project Pages deployment, both results also receive the configured repository base. Language switching uses `switchLocalePath()` so components do not need to split locale and base segments themselves.

## Verify both route shapes

After adding a locale or changing navigation, build once with `ASTRO_BASE=/narrow-x/`. Confirm that English paths do not gain `/en/`, Chinese paths keep `/zh-cn/`, and assets, Archives links, search results, RSS, and sitemap all stay inside the project base.
