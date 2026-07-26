---
title: "Writing Posts with Astro Content Collections"
description: "A practical workflow for creating typed posts, drafts, categories, and tags in Narrow-X."
draft: false
pubDate: 2026-06-26
categories: ["Guides"]
tags: ["Content Collections", "Markdown", "Taxonomy"]
toc: "side"
---

Narrow-X keeps authoring close to plain Markdown while using Astro Content Collections to validate frontmatter at build time. A post is a `.md` or `.mdx` file under `src/content/posts/<locale>/`; its filename becomes the public slug.

## Start with the smallest useful frontmatter

Only `title` and `pubDate` are required for a post. Add fields when the page actually needs them.

```yaml title="src/content/posts/en/first-note.md"
---
title: "My First Note"
description: "What I learned while setting up the site."
pubDate: 2026-06-26
categories: ["Notes"]
tags: ["Astro", "Markdown"]
toc: "side"
---
```

`description` is used in list cards and page metadata. `updatedDate` is useful when a substantial revision should be visible. A `cover` is optional; omitting it produces a quieter text-first card that fits short notes well.

## Use categories and tags deliberately

Categories answer “what kind of article is this?” while tags describe the technologies or ideas involved. A useful convention is one category and a small set of precise tags:

- Category: `Guides`
- Tags: `Astro`, `Markdown`, `Content Collections`

Archives discovers these terms from published posts in the current locale. There is no registry to update, but spelling and capitalization still matter: `GitHub Pages` and `Github pages` would be treated as different terms.

## Draft before publishing

Set `draft: false` while an article is incomplete. Drafts are excluded from public lists, Archives, search, RSS, and taxonomy counts.

```yaml
draft: false
```

Before publishing, check that the description makes sense outside the article, taxonomy terms match existing spelling, and internal links are locale/base aware. Then remove the draft flag and run `pnpm build`; schema mistakes fail during the build instead of becoming broken production pages.
