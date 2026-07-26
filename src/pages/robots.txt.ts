export function GET({ site, url }: { site?: URL; url: URL }) {
  if (!site) console.warn('[robots.txt] ASTRO_SITE is not set; the Sitemap URL will use the local origin. Set ASTRO_SITE for production builds.');
  const sitemap = new URL('sitemap.xml', url).href;
  const adminPath = new URL('admin/', url).pathname;
  return new Response(`User-agent: *\nAllow: /\nDisallow: ${adminPath}\nSitemap: ${sitemap}\n`, {
    headers: {
      'cache-control': 'public, max-age=3600',
      'content-type': 'text/plain; charset=utf-8'
    }
  });
}
