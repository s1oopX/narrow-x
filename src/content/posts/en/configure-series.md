---
title: "Building Ordered Article Series"
description: "Define a typed reading path with Astro references while keeping posts, Archives, and taxonomy independent."
draft: false
pubDate: 2026-06-25
categories: ["Guides"]
tags: ["Series", "Content Collections", "Astro"]
toc: "side"
---

Narrow-X models a series as an ordered reading path, not as another taxonomy term. Categories and tags help readers find related posts; a series defines the exact order in which a group of posts should be read.

## Create a Series entry

Series entries live in `src/content/series/<locale>/`. Each entry contains its public title, a short description, an optional Markdown introduction, and an ordered list of typed post references.

```yaml title="src/content/series/en/narrow-x-practical-guide.md"
---
title: "Narrow-X Practical Guide"
description: "From content authoring to customization and deployment."
chapters:
  - en/authoring-content-collections
  - en/configure-series
  - en/customize-theme-tokens
  - en/multilingual-content-routing
  - en/deploy-github-pages
---
```

The position in `chapters` is the chapter order. Reordering the array changes the reading path without renaming post files or changing their public URLs.

## Keep relationships in one place

Posts do not repeat a series name or chapter number in their own frontmatter. This avoids conflicting order values and spelling differences between entries. Astro's `reference('posts')` schema also prevents projects or pages from being used as chapters.

Published series follow a strict content contract:

- at least two chapters;
- no duplicated chapter reference;
- all chapters use the same locale as the series;
- a published series cannot reference a draft post;
- a post can belong to only one published series.

These checks run while Astro builds the static site.

## Localize the reading path

Create a separate entry under `src/content/series/zh-cn/` for the Chinese version. It can use a localized title, introduction, and chapter list. Matching filenames keep language switching predictable, but the two entries remain independent content.

## Understand the public pages

`/series/` lists available reading paths. `/series/<slug>/` renders the introduction and ordered chapters. A chapter displays a small Series link above its title, and its bottom navigation follows the series order instead of publication dates.

Archives remains chronological and continues to filter only by categories and tags. RSS remains posts-only, while Search and Sitemap can discover the public Series pages.
