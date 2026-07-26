---
title: "你好，Narrow-X"
description: "中文示例文章：演示默认语言之外的语种如何与英文内容并存。"
pubDate: 2026-01-02
tags: ["示例"]
categories: ["起步"]
draft: false
---

这是一篇中文示例文章。Narrow-X 按语言目录组织内容：`src/content/posts/en/` 与 `src/content/posts/zh-cn/` 互不干扰，各自生成独立路由。

没有对应译文的内容不会被藏起来——列表页会自动并入默认语言的条目，并链接到其原始地址。

把这篇文章换成你的第一篇中文内容，或者直接删除整个 `zh-cn` 目录、并在 `src/config/i18n.ts` 中移除该语言。
