import type { CollectionEntry } from 'astro:content';
import { localeMeta, type Locale } from '../../config/i18n';
import { siteConfig } from '../../config/site';
import { escapeXml } from '../xml';
import { localizedEntryPath } from './entries';

export function renderRss(posts: Array<CollectionEntry<'posts'>>, origin: string, basePath: string, locale: Locale) {
  const siteUrl = origin.replace(/\/$/, '');
  const channelUrl = `${siteUrl}${basePath}`;
  const feedUrl = `${channelUrl.replace(/\/$/, '')}/rss.xml`;

  const items = posts
    .map((entry) => {
      const url = `${siteUrl}${localizedEntryPath('posts', entry as any)}`;
      const date = entry.data.pubDate.toUTCString();
      return [
        '<item>',
        `<title>${escapeXml(entry.data.title)}</title>`,
        `<link>${escapeXml(url)}</link>`,
        `<guid>${escapeXml(url)}</guid>`,
        `<pubDate>${escapeXml(date)}</pubDate>`,
        `<description>${escapeXml(entry.data.description || '')}</description>`,
        '</item>'
      ].join('');
    })
    .join('');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '<channel>',
    `<title>${escapeXml(siteConfig.name)}</title>`,
    `<link>${escapeXml(channelUrl)}</link>`,
    `<atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml"/>`,
    `<description>${escapeXml(siteConfig.description[locale])}</description>`,
    `<language>${escapeXml(localeMeta[locale].htmlLang.toLowerCase())}</language>`,
    items,
    '</channel>',
    '</rss>'
  ].join('');
}
