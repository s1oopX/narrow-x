import type Fuse from 'fuse.js';
import { focusFirst, rememberFocus, restoreFocus, trapFocus } from './modal-focus';

type SearchItem = {
  title: string;
  description?: string;
  url: string;
  lang: string;
  type: string;
  tags?: string[];
  categories?: string[];
  content?: string;
};

type MatchRange = readonly [number, number];
type SearchMatch = {
  indices: ReadonlyArray<MatchRange>;
  key?: string;
};

const modal = document.getElementById('search-modal');
const overlay = document.getElementById('search-overlay');
const input = document.getElementById('search-input') as HTMLInputElement | null;
const closeButton = document.getElementById('search-close');
const empty = document.getElementById('search-empty');
const loading = document.getElementById('search-loading');
const noResults = document.getElementById('search-no-results');
const error = document.getElementById('search-error');
const results = document.getElementById('search-results');
const locale = modal?.dataset.locale || 'en';
const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
const typeLabels: Record<string, string> = JSON.parse(modal?.dataset.typeLabels || '{}');
let fuse: Fuse<SearchItem> | null = null;
let indexPromise: Promise<Fuse<SearchItem>> | null = null;
let indexFailed = false;
let previousOverflow = '';
let previousFocus: HTMLElement | null = null;
const statusElements = [empty, loading, noResults, error];

function show(element: HTMLElement | null) {
  element?.classList.remove('hidden');
}

function hide(element: HTMLElement | null) {
  element?.classList.add('hidden');
}

function showStatus(target: HTMLElement | null) {
  for (const element of statusElements) {
    if (element === target) show(element);
    else hide(element);
  }
}

function clipRanges(indices: ReadonlyArray<MatchRange>, start: number, length: number) {
  const end = start + length - 1;
  const clipped = indices
    .map(([from, to]) => [Math.max(from, start) - start, Math.min(to, end) - start] as [number, number])
    .filter(([from, to]) => from <= to)
    .sort(([left], [right]) => left - right);

  return clipped.reduce<Array<[number, number]>>((ranges, range) => {
    const previous = ranges.at(-1);
    if (previous && range[0] <= previous[1] + 1) previous[1] = Math.max(previous[1], range[1]);
    else ranges.push(range);
    return ranges;
  }, []);
}

function appendHighlighted(container: HTMLElement, value: string, indices: ReadonlyArray<MatchRange> = []) {
  const ranges = clipRanges(indices, 0, value.length);
  let cursor = 0;

  for (const [start, end] of ranges) {
    if (start > cursor) container.append(document.createTextNode(value.slice(cursor, start)));
    const mark = document.createElement('mark');
    mark.className = 'search-highlight';
    mark.textContent = value.slice(start, end + 1);
    container.append(mark);
    cursor = end + 1;
  }

  if (cursor < value.length) container.append(document.createTextNode(value.slice(cursor)));
}

function excerpt(value: string, indices: ReadonlyArray<MatchRange>, maxLength = 180) {
  if (value.length <= maxLength) return { value, indices: clipRanges(indices, 0, value.length), prefix: false, suffix: false };

  const firstMatch = indices[0]?.[0] ?? 0;
  let start = Math.max(0, firstMatch - Math.floor(maxLength * 0.35));
  let end = Math.min(value.length, start + maxLength);
  if (end === value.length) start = Math.max(0, end - maxLength);

  const previousSpace = value.lastIndexOf(' ', start);
  if (previousSpace >= Math.max(0, start - 24)) start = previousSpace + 1;
  const nextSpace = value.indexOf(' ', end);
  if (nextSpace > end && nextSpace <= end + 24) end = nextSpace;

  return {
    value: value.slice(start, end),
    indices: clipRanges(indices, start, end - start),
    prefix: start > 0,
    suffix: end < value.length
  };
}

function matchFor(matches: ReadonlyArray<SearchMatch>, key: string) {
  return matches.find((match) => match.key === key);
}

function exactMatch(value: string, query: string): ReadonlyArray<MatchRange> | undefined {
  const index = value.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  return index < 0 ? undefined : [[index, index + query.length - 1]];
}

function openSearch(trigger?: HTMLElement) {
  if (modal?.getAttribute('aria-hidden') === 'false') return;
  previousFocus = trigger || rememberFocus();
  previousOverflow = document.body.style.overflow;
  modal?.removeAttribute('inert');
  modal?.classList.remove('pointer-events-none', 'opacity-0', 'scale-95');
  modal?.classList.add('opacity-100', 'scale-100');
  modal?.setAttribute('aria-hidden', 'false');
  overlay?.classList.remove('pointer-events-none', 'opacity-0');
  overlay?.classList.add('opacity-100');
  document.body.style.overflow = 'hidden';
  // Allow one fresh fetch attempt per modal open after a failed index load.
  indexFailed = false;
  window.setTimeout(() => {
    if (modal) focusFirst(modal);
  }, 30);
  void ensureIndex().then((ready) => {
    if (ready) renderSearch(input?.value || '');
  });
}

function closeSearch() {
  modal?.classList.add('pointer-events-none', 'opacity-0', 'scale-95');
  modal?.classList.remove('opacity-100', 'scale-100');
  modal?.setAttribute('aria-hidden', 'true');
  modal?.setAttribute('inert', '');
  overlay?.classList.add('pointer-events-none', 'opacity-0');
  overlay?.classList.remove('opacity-100');
  document.body.style.overflow = previousOverflow;
  restoreFocus(previousFocus);
  previousFocus = null;
}

async function ensureIndex() {
  if (fuse) return true;

  // After a failed fetch, don't refire the request on every keystroke.
  if (indexFailed) {
    showStatus(error);
    return false;
  }

  if (!indexPromise) {
    results?.replaceChildren();
    showStatus(loading);
    indexPromise = Promise.all([
      fetch(`${base}api/search.json`).then(async (response) => {
        if (!response.ok) throw new Error(`Search index returned ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error('Search index is not an array');
        return data as SearchItem[];
      }),
      import('fuse.js')
    ]).then(([data, { default: FuseSearch }]) => {
      // Non-default locales search their own items plus the default locale's,
      // mirroring the list surfaces' fallback so no content is unreachable.
      const fallbackLocale = modal?.dataset.fallbackLocale;
      const items = locale === fallbackLocale || !fallbackLocale
        ? data.filter((item) => item.lang === locale)
        : data.filter((item) => item.lang === locale || item.lang === fallbackLocale);
      return new FuseSearch(items, {
      keys: [
        { name: 'title', weight: 0.7 },
        { name: 'tags', weight: 0.1 },
        { name: 'categories', weight: 0.08 },
        { name: 'description', weight: 0.08 },
        { name: 'content', weight: 0.04 }
      ],
      threshold: 0.32,
      ignoreLocation: true,
      includeMatches: true
      });
    });
  }

  try {
    fuse = await indexPromise;
    return true;
  } catch (cause) {
    console.error('[search] Failed to load the search index.', cause);
    indexPromise = null;
    indexFailed = true;
    showStatus(error);
    return false;
  }
}

function renderSearch(query: string) {
  if (!results) return;
  results.replaceChildren();
  hide(empty);
  hide(noResults);

  if (!query.trim()) {
    showStatus(empty);
    return;
  }

  const normalizedQuery = query.trim();
  const items = fuse?.search(normalizedQuery, { limit: 12 }) || [];
  if (items.length === 0) {
    showStatus(noResults);
    return;
  }

  showStatus(null);

  for (const result of items) {
    const { item } = result;
    const matches = (result.matches || []) as ReadonlyArray<SearchMatch>;
    const link = document.createElement('a');
    link.href = item.url;
    link.className = 'block rounded-md px-3 py-2.5 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none';

    const heading = document.createElement('div');
    heading.className = 'flex min-w-0 items-baseline gap-3';
    const title = document.createElement('div');
    title.className = 'min-w-0 flex-1 truncate font-medium';
    appendHighlighted(title, item.title, exactMatch(item.title, normalizedQuery) || matchFor(matches, 'title')?.indices);
    heading.appendChild(title);

    const category = item.categories?.[0] || typeLabels[item.type] || item.type;
    if (category) {
      const label = document.createElement('span');
      label.className = 'hidden max-w-32 shrink-0 truncate text-xs text-muted-foreground sm:block';
      label.textContent = category;
      heading.appendChild(label);
    }
    link.appendChild(heading);

    const contentMatch = matchFor(matches, 'content');
    const descriptionMatch = matchFor(matches, 'description');
    const exactDescription = item.description && exactMatch(item.description, normalizedQuery);
    const exactContent = item.content && exactMatch(item.content, normalizedQuery);
    const source = exactDescription
      ? item.description || ''
      : exactContent
        ? item.content || ''
        : contentMatch && item.content
          ? item.content
          : item.description || item.content || '';
    const sourceIndices = exactDescription || exactContent || (contentMatch && item.content ? contentMatch.indices : descriptionMatch?.indices) || [];
    if (source) {
      const snippet = excerpt(source, sourceIndices, 100);
      const description = document.createElement('div');
      description.className = 'mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground';
      if (snippet.prefix) description.append(document.createTextNode('…'));
      appendHighlighted(description, snippet.value, snippet.indices);
      if (snippet.suffix) description.append(document.createTextNode('…'));
      link.appendChild(description);
    }

    results.appendChild(link);
  }
}

document.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  const trigger = target.closest<HTMLElement>('[data-search-open]');
  if (trigger) openSearch(trigger);
});

document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    openSearch();
  }
  if (modal?.getAttribute('aria-hidden') === 'false') {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSearch();
    } else {
      trapFocus(event, modal);
    }
  }
});

closeButton?.addEventListener('click', closeSearch);
overlay?.addEventListener('click', closeSearch);

let inputDebounce = 0;
input?.addEventListener('input', () => {
  window.clearTimeout(inputDebounce);
  inputDebounce = window.setTimeout(() => {
    void ensureIndex().then((ready) => {
      if (ready) renderSearch(input.value);
    });
  }, 150);
});
