import { getLocalePath, type Locale } from '../config/i18n';
import { getLocalizedEntries } from './content/entries';
import { renderRss } from './content/rss';

/** 渲染指定 locale 的 RSS 路由响应，默认语言路由与 [locale] 路由共用。 */
export async function rssResponse(locale: Locale, site: URL | undefined, url: URL): Promise<Response> {
  const posts = await getLocalizedEntries('posts', locale);
  if (!site) console.warn('[rss.xml] ASTRO_SITE is not set; feed URLs will use the local origin. Set ASTRO_SITE for production builds.');
  const origin = site?.origin || url.origin;

  return new Response(renderRss(posts, origin, getLocalePath(locale, '/'), locale), {
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8'
    }
  });
}
