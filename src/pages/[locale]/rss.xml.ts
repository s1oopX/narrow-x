import { nonDefaultLocales, type Locale } from '../../config/i18n';
import { rssResponse } from '../../lib/rss-route';

export function getStaticPaths() {
  return nonDefaultLocales.map((locale) => ({ params: { locale } }));
}

export async function GET({ params, site, url }: { params: { locale: Locale }; site?: URL; url: URL }) {
  return rssResponse(params.locale, site, url);
}
