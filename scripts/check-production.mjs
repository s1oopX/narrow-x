import assert from 'node:assert/strict';

const base = new URL(process.env.SMOKE_BASE_URL || 'https://example.com');
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 15000);
const attempts = Number(process.env.SMOKE_ATTEMPTS || 2);

if (!['http:', 'https:'].includes(base.protocol) || base.pathname !== '/' || base.search || base.hash) {
  throw new Error('SMOKE_BASE_URL must be an origin URL');
}

if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000) {
  throw new Error('SMOKE_TIMEOUT_MS must be an integer of at least 1000');
}

if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 5) {
  throw new Error('SMOKE_ATTEMPTS must be an integer from 1 to 5');
}

function endpoint(pathname) {
  return new URL(pathname, base).href;
}

function isChallenge(response) {
  const marker = response.headers.get('cf-mitigated')?.toLowerCase();
  return marker === 'challenge' || (response.status === 403 && /challenge|just a moment|verify you are human/i.test(response.body));
}

const authHostSuffix = process.env.SMOKE_AUTH_HOST || 'cloudflareaccess.com';

// Protected means an explicit denial (401/403) or a redirect to a known auth
// host. Any other redirect (including to the site itself) is NOT protection.
function isProtected(response, authHost = authHostSuffix) {
  if ([401, 403].includes(response.status)) return true;
  if (response.status < 300 || response.status >= 400) return false;
  const location = response.headers.get('location') || '';
  let host;
  try {
    host = new URL(location, base).hostname;
  } catch {
    return false;
  }
  return host === authHost || host.endsWith(`.${authHost}`);
}

function hasHtmlAttributes(body, attributes) {
  return Object.entries(attributes).every(([name, value]) => body.includes(`${name}="${value}"`));
}

function parseSearchIndex(body) {
  const items = JSON.parse(body);
  if (!Array.isArray(items)) throw new TypeError('search index must be an array');
  return items;
}

function isSearchItem(item) {
  return item && typeof item === 'object'
    && ['title', 'url', 'lang', 'type', 'content'].every((key) => typeof item[key] === 'string')
    && Array.isArray(item.tags)
    && Array.isArray(item.categories);
}

async function request(pathname, options = {}) {
  const headers = new Headers(options.headers);
  headers.set('user-agent', headers.get('user-agent') || 'narrow-x-production-smoke/1');

  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(endpoint(pathname), {
        ...options,
        headers,
        redirect: 'manual',
        signal: controller.signal
      });
      return {
        body: await response.text(),
        headers: response.headers,
        status: response.status
      };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 250));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

function report(failures, label, condition, detail = '') {
  if (condition) {
    console.log(`ok  ${label}`);
    return;
  }
  const message = detail ? `${label}: ${detail}` : label;
  failures.push(message);
  console.error(`FAIL ${message}`);
}

async function probe(failures, label, pathname, options) {
  try {
    return await request(pathname, options);
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? `: ${error.cause.message}` : '';
    report(failures, label, false, error instanceof Error ? `${error.message}${cause}` : String(error));
    return null;
  }
}

async function run() {
  const failures = [];
  const publicPaths = ['/', '/projects/', '/posts/', '/robots.txt', '/sitemap.xml', '/rss.xml', '/api/search.json', '/favicon.svg', '/giscus-light.css?v=2', '/giscus-dark.css?v=2'];
  let home = null;
  let searchIndex = null;

  for (const pathname of publicPaths) {
    const response = await probe(failures, `GET ${pathname}`, pathname);
    if (!response) continue;
    report(failures, `GET ${pathname} returns 200`, response.status === 200, `received ${response.status}`);
    report(failures, `GET ${pathname} is not challenged`, !isChallenge(response));
    if (pathname.startsWith('/giscus-')) {
      report(failures, `GET ${pathname} allows Giscus`, response.headers.get('access-control-allow-origin') === 'https://giscus.app');
    }
    if (pathname === '/') home = response;
    if (pathname === '/api/search.json') searchIndex = response;
  }

  if (searchIndex) {
    try {
      const items = parseSearchIndex(searchIndex.body);
      report(failures, 'search index contains valid entries', items.length > 0 && items.every(isSearchItem), `received ${items.length} entries`);
      const representative = items.find((item) => item.url === '/posts/site-stack-selection/' && item.lang === 'zh-cn');
      report(failures, 'search index contains representative searchable content', Boolean(representative && /Astro|WordPress/.test(representative.content)));
    } catch (error) {
      report(failures, 'search index contains valid JSON', false, error instanceof Error ? error.message : String(error));
    }
  }

  if (home) {
    const asset = home.body.match(/(?:src|href)=["']([^"']*\/_astro\/[^"']+)["']/)?.[1];
    report(failures, 'home page exposes an Astro asset', Boolean(asset));
    if (asset) {
      const assetPath = new URL(asset, base).pathname;
      const response = await probe(failures, `GET ${assetPath}`, assetPath);
      if (response) {
        report(failures, `GET ${assetPath} returns 200`, response.status === 200, `received ${response.status}`);
        report(failures, `GET ${assetPath} is not challenged`, !isChallenge(response));
      }
    }
  }

  const commentsPage = await probe(failures, 'GET representative comments page', '/posts/site-stack-selection/');
  if (commentsPage) {
    report(failures, 'representative comments page returns 200', commentsPage.status === 200, `received ${commentsPage.status}`);
    report(failures, 'representative comments page is not challenged', !isChallenge(commentsPage));
    report(failures, 'representative comments page exposes expected Giscus config', hasHtmlAttributes(commentsPage.body, {
      'data-giscus-loader': 'true',
      'data-client-src': 'https://giscus.app/client.js',
      'data-repo': 'your-github/narrow-x',
      'data-repo-id': 'R_kgDOTfNl7A',
      'data-category-id': 'DIC_kwDOTfNl7M4DB8Y4',
      'data-mapping': 'pathname',
      'data-strict': '1',
      'data-reactions-enabled': '0',
      'data-input-position': 'top',
      'data-theme': 'preferred_color_scheme',
      'data-lang': 'zh-CN'
    }));
    // Version-agnostic: the cache-busting query bumps on every theme change.
    report(failures, 'representative comments page exposes custom Giscus themes',
      /data-giscus-theme-light="\/giscus-light\.css\?v=\d+"/.test(commentsPage.body) &&
      /data-giscus-theme-dark="\/giscus-dark\.css\?v=\d+"/.test(commentsPage.body));
    const likeIndex = commentsPage.body.indexOf('data-post-like');
    const commentsIndex = commentsPage.body.indexOf('data-comments');
    report(failures, 'comments follow the article like control', likeIndex >= 0 && commentsIndex > likeIndex);
  }

  const interactiveContentPages = [
    ['project detail', '/projects/domain-price/', 'narrow-x:post-like:projects:'],
    ['recommendation detail', '/recommendations/tool-cloudflare/', 'narrow-x:post-like:recommendations:']
  ];
  for (const [label, pathname, likeKeyPrefix] of interactiveContentPages) {
    const page = await probe(failures, `GET ${label}`, pathname);
    if (!page) continue;
    report(failures, `${label} returns 200`, page.status === 200, `received ${page.status}`);
    report(failures, `${label} is not challenged`, !isChallenge(page));
    report(failures, `${label} exposes an independent like control`, page.body.includes(`data-like-key="${likeKeyPrefix}`));
    const likeIndex = page.body.indexOf('data-post-like');
    const commentsIndex = page.body.indexOf('data-comments');
    report(failures, `${label} exposes comments after the like control`, likeIndex >= 0 && commentsIndex > likeIndex);
  }

  const admin = await probe(failures, 'GET /admin/index.html', '/admin/index.html');
  if (admin) {
    report(failures, 'admin remains protected', isProtected(admin), `received ${admin.status}`);
    report(failures, 'admin challenge is not leaked as a public page', admin.status !== 200 || isChallenge(admin));
  }

  const oauth = await probe(failures, 'GET /oauth', '/oauth');
  if (oauth) {
    const location = oauth.headers.get('location') || '';
    report(failures, 'OAuth endpoint is not challenged', !isChallenge(oauth));
    report(failures, 'OAuth endpoint redirects to GitHub', oauth.status === 302 && location.startsWith('https://github.com/login/oauth/authorize?'), `received ${oauth.status}`);
  }

  const webhook = await probe(failures, 'POST /deploy/github without signature', '/deploy/github', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}'
  });
  if (webhook) {
    report(failures, 'webhook rejects unsigned requests at the origin', webhook.status === 401, `received ${webhook.status}`);
    report(failures, 'webhook is not challenged', !isChallenge(webhook));
  }

  const health = await probe(failures, 'GET /healthz', '/healthz');
  if (health) report(failures, 'health endpoint is healthy', health.status === 200 && health.body.trim() === 'ok', `received ${health.status} ${JSON.stringify(health.body.trim())}`);

  if (failures.length) {
    console.error(`\n${failures.length} production smoke check(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log(`\nProduction smoke checks passed for ${base.origin}.`);
  }
}

function selfTest() {
  const headers = new Headers();
  assert.equal(isChallenge({ status: 200, headers, body: 'ok' }), false);
  assert.equal(isChallenge({ status: 403, headers, body: 'Just a moment...' }), true);
  assert.equal(isProtected({ status: 401, headers, body: '' }), true);
  assert.equal(isProtected({ status: 403, headers, body: '' }), true);
  assert.equal(isProtected({ status: 302, headers: new Headers({ location: 'https://myteam.cloudflareaccess.com/cdn-cgi/access/login' }), body: '' }), true);
  assert.equal(isProtected({ status: 302, headers: new Headers({ location: 'https://sso.corp.example/login' }), body: '' }, 'sso.corp.example'), true);
  assert.equal(isProtected({ status: 302, headers: new Headers({ location: 'https://login.example.test/' }), body: '' }), false, 'redirects to unknown hosts are not protection');
  assert.equal(isProtected({ status: 302, headers: new Headers({ location: 'https://evilcloudflareaccess.com/' }), body: '' }), false, 'suffix must match on a host-label boundary');
  assert.equal(isProtected({ status: 302, headers: new Headers({ location: '/' }), body: '' }), false);
  assert.equal(isProtected({ status: 302, headers: new Headers(), body: '' }), false, 'a redirect without a Location is not protection');
  assert.equal(isProtected({ status: 200, headers, body: '' }), false);
  assert.equal(hasHtmlAttributes('<script data-strict="1" data-input-position="top"></script>', {
    'data-strict': '1',
    'data-input-position': 'top'
  }), true);
  assert.equal(hasHtmlAttributes('<script data-strict="0"></script>', { 'data-strict': '1' }), false);
  assert.equal(isSearchItem({ title: 'Title', url: '/post/', lang: 'en', type: 'posts', content: 'Body', tags: [], categories: [] }), true);
  assert.equal(isSearchItem({ title: 'Title', url: '/post/' }), false);
  assert.equal(parseSearchIndex('[]').length, 0);
  assert.throws(() => parseSearchIndex('{}'), /array/);
  console.log('Production smoke helper self-test passed.');
}

if (process.argv.includes('--self-test')) selfTest();
else await run();
