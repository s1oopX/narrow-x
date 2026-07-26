import { getCollection, getEntries, type CollectionEntry } from 'astro:content';
import { defaultLocale, getLocaleFromId, getLocalePath, stripLocaleFromId, type Locale } from '../../config/i18n';
import { entryDate, entryLocale } from './entries';

export type ResolvedSeries = {
  entry: CollectionEntry<'series'>;
  chapters: Array<CollectionEntry<'posts'>>;
  locale: Locale;
  slug: string;
  latestChapterDate: Date;
};

export type SeriesContext = {
  series: ResolvedSeries;
  position: number;
  previous?: CollectionEntry<'posts'>;
  next?: CollectionEntry<'posts'>;
};

/** Thrown when a series `chapters` list references post ids that no longer exist. */
export class SeriesChapterReferenceError extends Error {
  constructor(seriesId: string, missingIds: string[]) {
    super(
      `Series "${seriesId}" references unknown post id${missingIds.length > 1 ? 's' : ''} ` +
      `${missingIds.map((id) => `"${id}"`).join(', ')}. ` +
      'The post was probably deleted or renamed; update the series "chapters" list to match existing post ids.'
    );
    this.name = 'SeriesChapterReferenceError';
  }
}

export function seriesLocale(entry: CollectionEntry<'series'>) {
  return entry.data.lang || getLocaleFromId(entry.id);
}

export function seriesSlug(entry: CollectionEntry<'series'>) {
  return stripLocaleFromId(entry.id).replace(/\/index$/, '');
}

export function localizedSeriesPath(entry: CollectionEntry<'series'>) {
  // encodeURI keeps ASCII paths byte-identical and percent-encodes non-ASCII
  // slugs exactly once so sitemap/RSS URLs stay valid.
  return encodeURI(getLocalePath(seriesLocale(entry), `/series/${seriesSlug(entry)}/`));
}

async function resolvePublishedSeries() {
  const entries = await getCollection('series', ({ data }) => !data.draft);
  const claimedPosts = new Map<string, string>();
  const resolved: ResolvedSeries[] = [];

  for (const entry of entries) {
    const chapterRefs = entry.data.chapters;
    const chapters = await getEntries(chapterRefs);

    if (chapters.length !== chapterRefs.length || chapters.some((chapter) => !chapter)) {
      const resolvedIds = new Set(chapters.filter(Boolean).map((chapter) => chapter.id));
      const missingIds = [...new Set(chapterRefs.map((ref) => ref.id).filter((id) => !resolvedIds.has(id)))];
      throw new SeriesChapterReferenceError(entry.id, missingIds);
    }

    const locale = seriesLocale(entry);
    const chapterIds = new Set<string>();

    for (const chapter of chapters) {
      if (chapterIds.has(chapter.id)) {
        throw new Error(`Series "${entry.id}" references post "${chapter.id}" more than once.`);
      }
      chapterIds.add(chapter.id);

      if (entryLocale(chapter) !== locale) {
        throw new Error(`Series "${entry.id}" and post "${chapter.id}" must use the same locale.`);
      }
      if (chapter.data.draft) {
        throw new Error(`Published series "${entry.id}" cannot reference draft post "${chapter.id}".`);
      }

      const owner = claimedPosts.get(chapter.id);
      if (owner) {
        throw new Error(`Post "${chapter.id}" cannot belong to both series "${owner}" and "${entry.id}".`);
      }
      claimedPosts.set(chapter.id, entry.id);
    }

    const latestChapterDate = chapters.reduce(
      (latest, chapter) => entryDate(chapter).getTime() > latest.getTime() ? entryDate(chapter) : latest,
      new Date(0)
    );

    resolved.push({
      entry,
      chapters,
      locale,
      slug: seriesSlug(entry),
      latestChapterDate
    });
  }

  return resolved;
}

let publishedSeriesPromise: ReturnType<typeof resolvePublishedSeries> | undefined;

export function getPublishedSeries() {
  publishedSeriesPromise ||= resolvePublishedSeries().catch((error) => {
    // Do not memoize failures: let the next call retry instead of replaying
    // the same rejected promise forever.
    publishedSeriesPromise = undefined;
    throw error;
  });
  return publishedSeriesPromise;
}

export async function getLocalizedSeries(locale: Locale) {
  const series = await getPublishedSeries();
  const collator = new Intl.Collator(locale === 'zh-cn' ? 'zh-CN' : locale);

  return series
    .filter((item) => item.locale === locale)
    .sort((a, b) => b.latestChapterDate.getTime() - a.latestChapterDate.getTime()
      || collator.compare(a.entry.data.title, b.entry.data.title));
}

/** 列表展示用：非默认语言额外并入默认语言的系列（同 getDisplayEntries 的回退语义）。 */
export async function getDisplaySeries(locale: Locale) {
  const own = await getLocalizedSeries(locale);
  if (locale === defaultLocale) return own;
  const defaults = await getLocalizedSeries(defaultLocale);
  return [...own, ...defaults].sort((a, b) => b.latestChapterDate.getTime() - a.latestChapterDate.getTime());
}

export async function getSeriesContext(post: CollectionEntry<'posts'>): Promise<SeriesContext | undefined> {
  const series = await getPublishedSeries();

  for (const item of series) {
    const index = item.chapters.findIndex((chapter) => chapter.id === post.id);
    if (index >= 0) {
      return {
        series: item,
        position: index + 1,
        previous: index > 0 ? item.chapters[index - 1] : undefined,
        next: item.chapters[index + 1]
      };
    }
  }

  return undefined;
}
