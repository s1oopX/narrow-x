import { getCollection, type CollectionEntry } from 'astro:content';
import { getLocaleFromId, getLocalePath, locales, type Locale } from '../config/i18n';
import { localizedEntryPath } from '../lib/content/entries';
import { localizedSeriesPath } from '../lib/content/series';
import { escapeXml } from '../lib/xml';

type DatedData = { pubDate?: Date; updatedDate?: Date };

const entryDate = (data: DatedData): Date | undefined => data.updatedDate ?? data.pubDate;
const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const latest = (dates: Array<Date | undefined>): Date | undefined =>
  dates.reduce<Date | undefined>((max, date) => (date && (!max || date > max) ? date : max), undefined);

export async function GET({ site, url }: { site?: URL; url: URL }) {
  if (!site) console.warn('[sitemap.xml] ASTRO_SITE is not set; <loc> URLs will use the local origin. Set ASTRO_SITE for production builds.');
  const origin = (site?.origin || url.origin).replace(/\/$/, '');
  const posts = await getCollection('posts', ({ data }) => !data.draft);
  const projects = await getCollection('projects', ({ data }) => !data.draft);
  const recommendations = await getCollection('recommendations', ({ data }) => !data.draft);
  const pages = await getCollection('pages', ({ data }) => !data.draft);
  const series = await getCollection('series', ({ data }) => !data.draft);

  // path -> lastmod (undefined when nothing sensible is known)
  const urls = new Map<string, Date | undefined>();
  const add = (path: string, lastmod?: Date) => {
    const existing = urls.get(path);
    if (!urls.has(path) || (lastmod && (!existing || lastmod > existing))) urls.set(path, lastmod);
  };

  const ofLocale = <T extends { id: string }>(entries: T[], locale: Locale) =>
    entries.filter((entry) => getLocaleFromId(entry.id) === locale);

  for (const locale of locales) {
    const localePosts = ofLocale(posts, locale);
    const localeSections: Array<[string, Array<CollectionEntry<'posts' | 'projects' | 'recommendations'>>]> = [
      ['/posts/', localePosts],
      ['/projects/', ofLocale(projects, locale)],
      ['/recommendations/', ofLocale(recommendations, locale)]
    ];

    // Section indexes are listed only when the locale actually publishes
    // content there — empty shells stay reachable but out of the sitemap.
    for (const [path, entries] of localeSections) {
      if (entries.length === 0) continue;
      add(getLocalePath(locale, path), latest(entries.map((entry) => entryDate(entry.data))));
    }
    if (ofLocale(series, locale).length > 0) add(getLocalePath(locale, '/series/'));
    if (localePosts.length > 0) add(getLocalePath(locale, '/archives/'), latest(localePosts.map((entry) => entryDate(entry.data))));
    add(getLocalePath(locale, '/'), latest(localePosts.map((entry) => entryDate(entry.data))));
  }

  for (const entry of posts) add(localizedEntryPath('posts', entry), entryDate(entry.data));
  for (const entry of projects) add(localizedEntryPath('projects', entry), entryDate(entry.data));
  for (const entry of recommendations) add(localizedEntryPath('recommendations', entry), entryDate(entry.data));
  for (const entry of pages) add(localizedEntryPath('pages', entry), entryDate(entry.data));
  for (const entry of series) add(localizedSeriesPath(entry));

  const body = [...urls.entries()]
    .map(([path, lastmod]) =>
      `<url><loc>${escapeXml(`${origin}${path}`)}</loc>${lastmod ? `<lastmod>${isoDay(lastmod)}</lastmod>` : ''}</url>`)
    .join('');

  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`, {
    headers: {
      'content-type': 'application/xml; charset=utf-8'
    }
  });
}
