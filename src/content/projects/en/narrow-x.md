---
title: "Narrow-X"
description: "An Astro-native content theme inspired by Hugo Narrow."
draft: false
pubDate: 2026-06-27
cover: "https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=1600&q=80"
tags: ["Astro", "Content"]
featured: true
links:
  - label: "Website"
    url: "https://astro.build/"
    icon: "lucide:external-link"
    variant: "primary"
  - label: "GitHub"
    url: "https://github.com/"
    icon: "simple-icons:github"
toc: "center"
---

## Overview

Narrow-X rebuilds the Hugo Narrow experience with Astro-native primitives.
The project keeps the content authoring experience simple while replacing Hugo
theme APIs with typed configuration, content collections, and small focused
components.

## Goals

- Keep Markdown authoring clean.
- Support multilingual content.
- Provide a strong default typography system.
- Keep theme colors configurable with CSS variables.
- Use mature libraries for search, code blocks, and gallery layout.

## Implementation Notes

The project uses `astro-icon` for icons, `fuse.js` for search,
`astro-expressive-code` for code blocks, and `smart-gallery` for gallery layout.

## Roadmap

| Area | Status |
| --- | --- |
| Content collections | Done |
| i18n | Done |
| Gallery | In progress |
| Comments | Provider interface |
| Analytics | Provider interface |
