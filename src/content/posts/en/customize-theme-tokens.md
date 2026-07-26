---
title: "Customizing Theme Colors without Breaking Dark Mode"
description: "Add or refine an Narrow-X color theme through semantic OKLCH tokens and paired dark-mode values."
featured: true

pubDate: 2026-06-24
categories: ["Customization"]
tags: ["Theme", "Tailwind CSS", "Design Tokens"]
toc: "side"
draft: false
---

Narrow-X styles components with semantic tokens such as `primary`, `background`, `muted`, and `border`. Components do not need to know the actual color palette, so one token update can consistently affect navigation, cards, prose, filters, and the dock.

## Register a selectable theme

The dock reads its options from `src/config/theme.ts`. Add a stable ID and a user-facing name:

```ts title="src/config/theme.ts"
export const themes = [
  { id: 'default', name: 'Default' },
  { id: 'ocean', name: 'Ocean' }
] as const
```

The ID becomes the value of the document's `data-theme` attribute, so it must match the CSS selector exactly.

## Define semantic colors

Add the light palette in `src/styles/themes.css` instead of changing component classes:

```css title="src/styles/themes.css"
[data-theme="ocean"] {
  --color-primary: oklch(0.58 0.13 235);
  --color-primary-foreground: oklch(0.98 0.01 235);
  --color-background: oklch(0.98 0.01 225);
  --color-foreground: oklch(0.25 0.03 235);
  --color-muted: oklch(0.93 0.02 225);
  --color-muted-foreground: oklch(0.48 0.04 235);
  --color-border: oklch(0.87 0.03 225);
  --color-card: oklch(1 0 0);
  --color-card-foreground: oklch(0.25 0.03 235);
}
```

Then provide a paired `[data-theme="ocean"].dark` block. Dark mode is not a mechanical inversion: muted text still needs sufficient contrast, borders should remain subtle, and cards must separate from the page background.

## Review real content surfaces

A palette is not finished after checking a color swatch. Review it on:

- a post with headings, links, code, and alerts;
- the Archives filters in selected, hover, and focus states;
- project cards with and without cover images;
- the dock and popover in both color modes.

Prefer adjusting semantic tokens over adding theme-specific selectors to individual components. This keeps new UI compatible with every palette and prevents a theme from becoming a parallel stylesheet.
