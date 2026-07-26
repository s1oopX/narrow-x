---
title: "Deploying Narrow-X to GitHub Pages"
description: "Configure GitHub Pages, project base paths, and local production builds without broken links."
draft: false
pubDate: 2026-06-25
categories: ["Deployment"]
tags: ["GitHub Pages", "Deployment", "Astro"]
toc: "side"
---

Narrow-X includes `.github/workflows/deploy.yml`, which builds the example site on pushes to `main` and also supports manual runs. The workflow handles both user sites and repository project sites, where URL bases differ.

## Enable GitHub Actions as the Pages source

Before the first deployment, open the repository settings and choose **Pages → Build and deployment → GitHub Actions**. The workflow needs the existing `pages: write` and `id-token: write` permissions to publish the generated artifact.

## Understand `ASTRO_SITE` and `ASTRO_BASE`

For a user site named `<owner>.github.io`, the public base is `/`. For a project repository, the base is `/<repository-name>/`. The included workflow derives both values automatically:

```text
ASTRO_SITE=https://<owner>.github.io
ASTRO_BASE=/<repository-name>
```

`ASTRO_SITE` supplies the absolute origin used by sitemap and RSS output. `ASTRO_BASE` keeps internal links and built assets inside the project path.

> [!WARNING]
> A hard-coded link such as `href="/archives/"` skips a project base. Theme code should generate internal paths with `getLocalePath()` or another existing locale helper.

## Reproduce the deployment build locally

Run the same path-sensitive build before pushing:

```sh
ASTRO_SITE=https://example.github.io ASTRO_BASE=/narrow-x/ pnpm build
```

After it succeeds, inspect `dist/sitemap.xml` and one generated content page. URLs should include `/narrow-x/`, while English routes remain unprefixed and Chinese routes include `/zh-cn/`.

## Diagnose common failures

- A Pages `Not Found` error often means GitHub Actions has not been selected as the Pages source.
- Missing styles on project pages usually indicate an incorrect or missing `ASTRO_BASE`.
- Incorrect sitemap origins point to `ASTRO_SITE` rather than routing logic.
- A page that works locally but fails only under a repository path usually contains a hand-written root-relative URL.

Treat the base-path build as part of deployment verification whenever navigation, assets, RSS, sitemap, or localized links change.
