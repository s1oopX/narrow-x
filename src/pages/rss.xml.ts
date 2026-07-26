import { defaultLocale } from '../config/i18n';
import { rssResponse } from '../lib/rss-route';

export async function GET({ site, url }: { site?: URL; url: URL }) {
  return rssResponse(defaultLocale, site, url);
}
