import { getCollection } from 'astro:content';
import { entryLocale, localizedEntryPath, type ContentType } from '../../lib/content/entries';
import { localizedSeriesPath, seriesLocale } from '../../lib/content/series';

function searchableText(markdown: string) {
  return markdown
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/^\s*(```|~~~)[^\n]*$/gm, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-+*]\s+|\d+\.\s+)/gm, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\*\*|__|~~|`/g, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000);
}

export async function GET() {
  const collections: ContentType[] = ['posts', 'projects', 'recommendations', 'pages'];
  const items = [];

  for (const collection of collections) {
    const entries = await getCollection(collection, ({ data }) => !data.draft);
    for (const entry of entries) {
      items.push({
        title: entry.data.title,
        description: entry.data.description || '',
        url: localizedEntryPath(collection, entry as any),
        lang: entryLocale(entry as any),
        type: collection,
        tags: 'tags' in entry.data ? entry.data.tags : [],
        categories: 'categories' in entry.data ? entry.data.categories : [],
        date: entry.data.pubDate?.toISOString?.() || '',
        content: searchableText(entry.body || '')
      });
    }
  }

  const series = await getCollection('series', ({ data }) => !data.draft);
  for (const entry of series) {
    items.push({
      title: entry.data.title,
      description: entry.data.description || '',
      url: localizedSeriesPath(entry),
      lang: seriesLocale(entry),
      type: 'series',
      tags: [],
      categories: [],
      date: '',
      content: searchableText(entry.body || '')
    });
  }

  return new Response(JSON.stringify(items), {
    headers: {
      'content-type': 'application/json; charset=utf-8'
    }
  });
}
