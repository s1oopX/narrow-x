import http from 'node:http';
import assert from 'node:assert/strict';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const {
  OAUTH_GITHUB_CLIENT_ID,
  OAUTH_GITHUB_CLIENT_SECRET,
  OAUTH_GITHUB_ALLOWED_LOGIN = 'your-github',
  OAUTH_GITHUB_ALLOWED_ID = '185045939',
  OAUTH_GITHUB_SCOPE = 'public_repo',
  OAUTH_ALLOWED_ORIGIN = 'https://example.com',
  OAUTH_PORT = '4180'
} = process.env;

const STATE_COOKIE = 'astro_oauth_state';
const GITHUB_REQUEST_TIMEOUT_MS = 10_000;
const TOKEN_FORMAT = /^[\w.\-]+$/;

export function isValidTokenFormat(token) {
  return typeof token === 'string' && token.length > 0 && token.length <= 512 && TOKEN_FORMAT.test(token);
}

export function isAllowedUser(user, allowedLogin = OAUTH_GITHUB_ALLOWED_LOGIN, allowedId = OAUTH_GITHUB_ALLOWED_ID) {
  if (allowedId) return String(user.id) === String(allowedId);
  return String(user.login || '').toLowerCase() === String(allowedLogin || '').toLowerCase();
}

function requireEnv() {
  const missing = [];
  if (!OAUTH_GITHUB_CLIENT_ID) missing.push('OAUTH_GITHUB_CLIENT_ID');
  if (!OAUTH_GITHUB_CLIENT_SECRET) missing.push('OAUTH_GITHUB_CLIENT_SECRET');
  if (missing.length) throw new Error(`Missing env: ${missing.join(', ')}`);

  let origin;
  try {
    origin = new URL(OAUTH_ALLOWED_ORIGIN);
  } catch {
    throw new Error('OAUTH_ALLOWED_ORIGIN must be a valid origin');
  }
  if (!['https:', 'http:'].includes(origin.protocol) || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('OAUTH_ALLOWED_ORIGIN must be an origin URL');
  }
  if (origin.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(origin.hostname)) {
    throw new Error('OAUTH_ALLOWED_ORIGIN must use HTTPS outside local development');
  }
  if (OAUTH_GITHUB_SCOPE !== 'public_repo') {
    throw new Error('OAUTH_GITHUB_SCOPE must remain public_repo');
  }
}

function html(status, body, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      'content-type': 'text/html; charset=utf-8',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      ...headers
    }
  });
}

function redirect(location, headers = {}) {
  return new Response(null, {
    status: 302,
    headers: {
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      location,
      ...headers
    }
  });
}

export function cookieValue(cookieHeader, name) {
  const prefix = `${name}=`;
  return String(cookieHeader || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix))?.slice(prefix.length) || '';
}

export function statesMatch(expected, actual) {
  if (!expected || !actual) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
}

function stateCookie(value, maxAge = 600) {
  return `${STATE_COOKIE}=${value}; Path=/oauth/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

async function exchangeCode(code) {
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json'
    },
    signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      code,
      client_id: OAUTH_GITHUB_CLIENT_ID,
      client_secret: OAUTH_GITHUB_CLIENT_SECRET
    })
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error || !body.access_token) {
    throw new Error(body.error_description || body.error || `GitHub OAuth failed: ${response.status}`);
  }
  if (!isValidTokenFormat(body.access_token)) {
    throw new Error('GitHub returned an access token in an unexpected format');
  }
  return body.access_token;
}

async function githubUser(token) {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'user-agent': 'narrow-x-oauth'
    },
    signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`GitHub user lookup failed: ${response.status}`);
  return response.json().catch(() => { throw new Error('GitHub user response was invalid'); });
}

async function handle(request) {
  const url = new URL(request.url);

  if (url.pathname === '/healthz') {
    if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET' } });
    return new Response('ok', { headers: { 'cache-control': 'no-store' } });
  }

  if (url.pathname === '/oauth') {
    if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET' } });
    requireEnv();
    const state = randomBytes(32).toString('base64url');
    const params = new URLSearchParams({
      client_id: OAUTH_GITHUB_CLIENT_ID,
      scope: OAUTH_GITHUB_SCOPE,
      state
    });
    return redirect(`https://github.com/login/oauth/authorize?${params}`, { 'set-cookie': stateCookie(state) });
  }

  if (url.pathname === '/oauth/callback') {
    if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET' } });
    requireEnv();
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const expectedState = cookieValue(request.headers.get('cookie'), STATE_COOKIE);
    if (!statesMatch(expectedState, state)) return html(400, 'Invalid OAuth state');
    if (!code) return html(400, 'Missing GitHub OAuth code');

    const token = await exchangeCode(code);
    const user = await githubUser(token);
    const allowed = isAllowedUser(user);
    // Log the authentication outcome only; never log tokens.
    console.log(`OAuth ${allowed ? 'allow' : 'deny'}: GitHub user id=${user.id ?? 'unknown'} login=${user.login ?? 'unknown'}`);
    if (!allowed) return html(403, 'Forbidden');

    const content = JSON.stringify({ token, provider: 'github' });
    const successMessage = JSON.stringify(`authorization:github:success:${content}`);
    const allowedOrigin = JSON.stringify(OAUTH_ALLOWED_ORIGIN);
    return html(200, `<script>
const receiveMessage = (message) => {
  if (message.origin !== ${allowedOrigin}) return;
  window.opener.postMessage(${successMessage}, ${allowedOrigin});
  window.removeEventListener('message', receiveMessage, false);
};
window.addEventListener('message', receiveMessage, false);
window.opener.postMessage('authorizing:github', ${allowedOrigin});
</script>`, { 'set-cookie': stateCookie('', 0) });
  }

  return new Response('Not found', { status: 404 });
}

export function createServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
      const response = await handle(new Request(requestUrl, { method: req.method, headers: req.headers }));
      const headers = {};
      for (const [name, value] of response.headers) {
        if (name !== 'set-cookie') headers[name] = value;
      }
      const setCookies = response.headers.getSetCookie();
      if (setCookies.length) headers['set-cookie'] = setCookies;
      res.writeHead(response.status, headers);
      res.end(await response.text());
    } catch (error) {
      console.error(error);
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Internal Server Error');
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  return server;
}

function selfTest() {
  assert.equal(isAllowedUser({ login: 'your-github', id: 1 }, 'your-github', ''), true);
  assert.equal(isAllowedUser({ login: 'other', id: 1337 }, 'your-github', '1337'), true);
  assert.equal(isAllowedUser({ login: 'other', id: 1 }, 'your-github', '1337'), false);
  assert.equal(isAllowedUser({ login: 'your-github', id: 1 }, 'your-github', '1337'), false);
  assert.equal(cookieValue('one=1; astro_oauth_state=abc; two=2', STATE_COOKIE), 'abc');
  assert.equal(statesMatch('abc', 'abc'), true);
  assert.equal(statesMatch('abc', 'abd'), false);
  assert.equal(statesMatch('', ''), false);
  assert.equal(isValidTokenFormat('gho_16C7e42F292c6912E7710c838347Ae178B4a'), true);
  assert.equal(isValidTokenFormat('ghu_token.with-dots_and-dashes'), true);
  assert.equal(isValidTokenFormat('</script><script>alert(1)</script>'), false);
  assert.equal(isValidTokenFormat('token"with"quotes'), false);
  assert.equal(isValidTokenFormat(''), false);
  assert.equal(isValidTokenFormat('a'.repeat(513)), false);
  assert.equal(isValidTokenFormat(undefined), false);
}

if (process.argv.includes('--self-test')) selfTest();
else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    requireEnv();
  } catch (error) {
    console.error(`OAuth server refusing to start: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
  createServer().listen(Number(OAUTH_PORT), '127.0.0.1', () => {
    console.log(`OAuth server listening on 127.0.0.1:${OAUTH_PORT}`);
  });
}
