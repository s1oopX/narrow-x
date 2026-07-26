import { createHmac, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import http from 'node:http';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { pathToFileURL } from 'node:url';

const {
  DEPLOY_PORT = '4181',
  DEPLOY_WEBHOOK_SECRET = '',
  DEPLOY_REPOSITORY = 'your-github/narrow-x',
  DEPLOY_SCRIPT = './scripts/deploy-vps.sh',
  DEPLOY_MAX_BODY_BYTES = '1048576',
  DEPLOY_TIMEOUT_MS = '600000'
} = process.env;

const configuredMaxBodyBytes = Number(DEPLOY_MAX_BODY_BYTES);
const maxBodyBytes = Number.isSafeInteger(configuredMaxBodyBytes) && configuredMaxBodyBytes > 0
  ? configuredMaxBodyBytes
  : 1024 * 1024;
const configuredTimeoutMs = Number(DEPLOY_TIMEOUT_MS);
const deployTimeoutMs = Number.isSafeInteger(configuredTimeoutMs) && configuredTimeoutMs > 0
  ? configuredTimeoutMs
  : 600_000;

// Only pass the deploy child what scripts/deploy-vps.sh actually reads, plus a
// minimal base environment. Never the full process env, and never the webhook secret.
const CHILD_ENV_ALLOWLIST = [
  'PATH',
  'HOME',
  'LANG',
  'LC_ALL',
  'APP_DIR',
  'REPO_DIR',
  'RELEASES_DIR',
  'CURRENT_LINK',
  'DEPLOY_REMOTE',
  'DEPLOY_BRANCH',
  'KEEP_RELEASES',
  'DEPLOY_LOCK_FILE',
  'DEPLOY_HEALTHCHECK_URL',
  'DEPLOY_HEALTHCHECK_HOST',
  'DEPLOY_SITE_CHECK_URL',
  'DEPLOY_HOME',
  'DEPLOY_ALLOW_MAINTENANCE',
  'DEPLOY_MIN_FREE_MB',
  'XDG_CONFIG_HOME',
  'ASTRO_TELEMETRY_DISABLED',
  'ASTRO_SITE'
];

export function buildChildEnv(env = process.env) {
  const childEnv = {};
  for (const key of CHILD_ENV_ALLOWLIST) {
    if (env[key] !== undefined) childEnv[key] = env[key];
  }
  return childEnv;
}

export function verifySignature(payload, signature, secret = DEPLOY_WEBHOOK_SECRET) {
  const normalizedSignature = Array.isArray(signature) ? signature[0] : signature;
  if (!secret || typeof normalizedSignature !== 'string' || !normalizedSignature.startsWith('sha256=')) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
  const actual = Buffer.from(normalizedSignature);
  const target = Buffer.from(expected);
  return actual.length === target.length && timingSafeEqual(actual, target);
}

export function isMainPush(event, payload, repository = DEPLOY_REPOSITORY) {
  return event === 'push' && payload?.ref === 'refs/heads/main' && payload?.repository?.full_name === repository;
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let rejected = false;
    req.on('data', (chunk) => {
      if (rejected) return;
      size += chunk.length;
      if (size > limit) {
        rejected = true;
        req.resume();
        const error = new Error('Request body too large');
        error.statusCode = 413;
        reject(error);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!rejected) resolve(Buffer.concat(chunks));
    });
    req.on('error', (error) => {
      if (!rejected) reject(error);
    });
  });
}

export function createSeenCache({ ttlMs, maxEntries, now = Date.now }) {
  const seen = new Map();
  return function hasSeen(key) {
    if (!key) return false;
    const current = now();
    for (const [entry, expiresAt] of seen) {
      if (expiresAt <= current) seen.delete(entry);
    }
    if (seen.has(key)) return true;
    seen.set(key, current + ttlMs);
    while (seen.size > maxEntries) {
      seen.delete(seen.keys().next().value);
    }
    return false;
  };
}

const hasSeenDelivery = createSeenCache({ ttlMs: 10 * 60 * 1000, maxEntries: 1024 });
// Replay hardening: a captured signed request keeps the same HMAC signature even
// when replayed with a fresh delivery id. Remember accepted signatures for ~24h.
const hasSeenSignature = createSeenCache({ ttlMs: 24 * 60 * 60 * 1000, maxEntries: 4096 });

export function createDeployRunner({ spawnDeploy, timeoutMs, killGraceMs = 10_000, log = console.log, logError = console.error }) {
  let running = false;
  let pending = false;

  const runOnce = () => {
    running = true;
    let settled = false;
    let timedOut = false;
    let hardKillTimer = null;
    const child = spawnDeploy();
    const timer = setTimeout(() => {
      timedOut = true;
      logError(`Deploy timed out after ${timeoutMs}ms; sending SIGTERM.`);
      try { child.kill('SIGTERM'); } catch { /* already gone */ }
      hardKillTimer = setTimeout(() => {
        logError('Deploy did not exit after SIGTERM; sending SIGKILL.');
        try { child.kill('SIGKILL'); } catch { /* already gone */ }
      }, killGraceMs);
    }, timeoutMs);

    const finish = (message) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (hardKillTimer) clearTimeout(hardKillTimer);
      running = false;
      if (message) logError(message);
      if (pending) {
        pending = false;
        log('Deploy finished with a push queued; starting follow-up deploy.');
        runOnce();
      }
    };

    child.on('exit', (code, signal) => {
      if (timedOut) finish(`Deploy killed after ${timeoutMs}ms timeout (code=${code}, signal=${signal}).`);
      else if (code) finish(`Deploy exited with ${code}`);
      else finish('');
    });
    child.on('error', (error) => {
      finish(`Deploy process failed: ${error?.message || error}`);
    });
  };

  return {
    // Returns 'started' when a deploy begins now, 'queued' when one is already
    // running; multiple queued pushes collapse into a single follow-up deploy.
    request() {
      if (running) {
        pending = true;
        return 'queued';
      }
      runOnce();
      return 'started';
    },
    get running() { return running; },
    get pending() { return pending; }
  };
}

const deployRunner = createDeployRunner({
  spawnDeploy: () => spawn('bash', [DEPLOY_SCRIPT], { stdio: 'inherit', env: buildChildEnv() }),
  timeoutMs: deployTimeoutMs
});

export function createServer() {
  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/healthz') {
      res.writeHead(200);
      res.end('ok');
      return;
    }

    if (req.method !== 'POST' || req.url !== '/deploy/github') {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const contentLength = Number(req.headers['content-length']);
    if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
      req.resume();
      res.writeHead(413);
      res.end('Request body too large');
      return;
    }

    let body;
    try {
      body = await readBody(req, maxBodyBytes);
    } catch (error) {
      res.writeHead(error.statusCode === 413 ? 413 : 400);
      res.end(error.statusCode === 413 ? 'Request body too large' : 'Unable to read request');
      return;
    }

    const signature = Array.isArray(req.headers['x-hub-signature-256'])
      ? req.headers['x-hub-signature-256'][0]
      : req.headers['x-hub-signature-256'];
    if (!verifySignature(body, signature)) {
      res.writeHead(401);
      res.end('Invalid signature');
      return;
    }

    let payload;
    try {
      payload = JSON.parse(body.toString('utf8'));
    } catch {
      res.writeHead(400);
      res.end('Invalid JSON');
      return;
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      res.writeHead(400);
      res.end('Invalid payload');
      return;
    }

    const delivery = Array.isArray(req.headers['x-github-delivery'])
      ? req.headers['x-github-delivery'][0]
      : req.headers['x-github-delivery'];
    if (hasSeenDelivery(delivery)) {
      res.writeHead(202);
      res.end('Duplicate delivery');
      return;
    }

    const event = Array.isArray(req.headers['x-github-event'])
      ? req.headers['x-github-event'][0]
      : req.headers['x-github-event'];
    if (!isMainPush(event, payload)) {
      res.writeHead(202);
      res.end('Ignored');
      return;
    }

    if (hasSeenSignature(signature)) {
      console.error(`Rejected replayed webhook signature (delivery ${delivery || 'unknown'}).`);
      res.writeHead(202);
      res.end('Duplicate request');
      return;
    }

    const outcome = deployRunner.request();
    console.log(`Deploy ${outcome} for delivery ${delivery || 'unknown'}.`);
    res.writeHead(202);
    res.end(outcome === 'started' ? 'Deploy accepted' : 'Deploy queued');
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  return server;
}

function createFakeChild() {
  const child = new EventEmitter();
  child.kills = [];
  child.kill = (signal) => { child.kills.push(signal); return true; };
  return child;
}

function tick(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function selfTest() {
  const payload = Buffer.from('{"ref":"refs/heads/main"}');
  const sig = `sha256=${createHmac('sha256', 'secret').update(payload).digest('hex')}`;
  assert.equal(verifySignature(payload, sig, 'secret'), true);
  assert.equal(verifySignature(payload, sig, 'wrong'), false);
  assert.equal(verifySignature(payload, 'sha256=bad', 'secret'), false);
  assert.equal(verifySignature(payload, [sig], 'secret'), true);
  const mainPush = { ref: 'refs/heads/main', repository: { full_name: 'your-github/narrow-x' } };
  assert.equal(isMainPush('push', mainPush), true);
  assert.equal(isMainPush('push', { ...mainPush, ref: 'refs/heads/dev' }), false);
  assert.equal(isMainPush('push', { ...mainPush, repository: { full_name: 'other/repository' } }), false);

  // Seen cache: duplicates, TTL expiry, and bounded size.
  let fakeNow = 0;
  const seen = createSeenCache({ ttlMs: 100, maxEntries: 2, now: () => fakeNow });
  assert.equal(seen('a'), false);
  assert.equal(seen('a'), true);
  fakeNow = 101;
  assert.equal(seen('a'), false, 'entries expire after the TTL');
  assert.equal(seen('b'), false);
  assert.equal(seen('c'), false);
  assert.equal(seen('a'), false, 'oldest entries are evicted once maxEntries is exceeded');
  assert.equal(seen(''), false);
  assert.equal(seen(undefined), false);

  // Env allowlist: secrets and unrelated vars never reach the deploy child.
  const childEnv = buildChildEnv({
    PATH: '/usr/bin',
    HOME: '/var/lib/deploy',
    DEPLOY_BRANCH: 'main',
    DEPLOY_WEBHOOK_SECRET: 'hunter2',
    DEPLOY_PORT: '4181',
    SSH_AUTH_SOCK: '/tmp/agent.sock'
  });
  assert.deepEqual(childEnv, { PATH: '/usr/bin', HOME: '/var/lib/deploy', DEPLOY_BRANCH: 'main' });
  assert.equal('DEPLOY_WEBHOOK_SECRET' in childEnv, false);

  // Runner: queueing collapses multiple pushes into one follow-up deploy.
  const spawned = [];
  const quiet = () => {};
  const runner = createDeployRunner({
    spawnDeploy: () => {
      const child = createFakeChild();
      spawned.push(child);
      return child;
    },
    timeoutMs: 60_000,
    log: quiet,
    logError: quiet
  });
  assert.equal(runner.request(), 'started');
  assert.equal(spawned.length, 1);
  assert.equal(runner.request(), 'queued');
  assert.equal(runner.request(), 'queued', 'pending pushes collapse into one');
  assert.equal(runner.pending, true);
  spawned[0].emit('exit', 0, null);
  await tick();
  assert.equal(spawned.length, 2, 'queued deploy starts when the running one finishes');
  assert.equal(runner.pending, false);
  spawned[1].emit('exit', 1, null);
  await tick();
  assert.equal(runner.running, false);
  assert.equal(runner.request(), 'started', 'runner accepts new deploys after failure');
  spawned[2].emit('exit', 0, null);

  // Runner: timeout sends SIGTERM, then SIGKILL, and clears the running flag on exit.
  const slow = [];
  const slowRunner = createDeployRunner({
    spawnDeploy: () => {
      const child = createFakeChild();
      slow.push(child);
      return child;
    },
    timeoutMs: 20,
    killGraceMs: 20,
    log: quiet,
    logError: quiet
  });
  assert.equal(slowRunner.request(), 'started');
  await tick(30);
  assert.deepEqual(slow[0].kills, ['SIGTERM']);
  await tick(30);
  assert.deepEqual(slow[0].kills, ['SIGTERM', 'SIGKILL']);
  assert.equal(slowRunner.running, true, 'still running until the child actually exits');
  slow[0].emit('exit', null, 'SIGKILL');
  await tick();
  assert.equal(slowRunner.running, false, 'running flag clears after a timed-out child exits');
  assert.equal(slowRunner.request(), 'started');
  slow[1].emit('exit', 0, null);
}

if (process.argv.includes('--self-test')) await selfTest();
else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createServer().listen(Number(DEPLOY_PORT), '127.0.0.1', () => {
    console.log(`Deploy webhook listening on 127.0.0.1:${DEPLOY_PORT}`);
  });
}
