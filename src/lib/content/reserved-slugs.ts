import type { CollectionEntry } from 'astro:content';
import { contentTypes } from '../../config/content';
import { locales } from '../../config/i18n';
import { entrySlug } from './entries';

/** 根路径 pages 不允许占用的首段：内容区块、系统路由、locale 前缀和保留文件名。 */
const reservedSegments = new Set<string>([
  ...Object.values(contentTypes).map((config) => config.path.replace(/\//g, '')),
  'series',
  'archives',
  'admin',
  'api',
  'rss.xml',
  'sitemap.xml',
  'robots.txt',
  ...locales
]);

/** 校验 pages entry 映射到根路径的 slug 不与保留段冲突，返回该 slug。 */
export function assertPageSlug(entry: CollectionEntry<'pages'>): string {
  const slug = entrySlug(entry);
  const firstSegment = slug.split('/')[0];
  if (firstSegment && reservedSegments.has(firstSegment)) {
    throw new Error(
      `Pages entry "${entry.id}" maps to reserved root segment "${firstSegment}" (slug "${slug}"). `
      + 'Rename the page so it does not collide with a system route.'
    );
  }
  return slug;
}
