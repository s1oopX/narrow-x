#!/usr/bin/env node
/**
 * Enumerate executable inline <script> blocks in dist/ and keep the Nginx CSP
 * hash allowlist in sync.
 *
 *   node scripts/gen-csp-hashes.mjs          # report unique hashes and sources
 *   node scripts/gen-csp-hashes.mjs --check  # fail when deploy/nginx.conf drifts
 *
 * The site CSP uses sha256 hashes instead of 'unsafe-inline', so every change
 * to an inline script (e.g. the theme-init bootstrap) must land in
 * deploy/nginx.conf. --check runs in the deploy pipeline to catch drift before
 * a stale policy would block a freshly built page in production.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const distDir = join(root, 'dist');
const nginxConf = join(root, 'deploy', 'nginx.conf');
const check = process.argv.includes('--check');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stats = statSync(path);
    if (stats.isDirectory()) walk(path, out);
    else if (name.endsWith('.html')) out.push(path);
  }
  return out;
}

const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const executableType = (attrs) => {
  const type = attrs.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1]?.trim().toLowerCase();
  return !type || type === 'module' || type === 'text/javascript';
};

let files;
try {
  files = walk(distDir);
} catch {
  console.error('dist/ not found — run `pnpm build` first.');
  process.exit(1);
}

const hashes = new Map(); // hash -> { snippet, files: Set }
for (const file of files) {
  const html = readFileSync(file, 'utf-8');
  for (const match of html.matchAll(scriptRe)) {
    const [, attrs, body] = match;
    if (/\bsrc\s*=/i.test(attrs) || !executableType(attrs)) continue;
    const hash = `sha256-${createHash('sha256').update(body, 'utf-8').digest('base64')}`;
    if (!hashes.has(hash)) {
      hashes.set(hash, { snippet: body.trim().slice(0, 80).replace(/\s+/g, ' '), files: new Set() });
    }
    hashes.get(hash).files.add(relative(distDir, file));
  }
}

const needed = [...hashes.keys()].sort();

if (!check) {
  console.log(`${files.length} HTML files, ${needed.length} unique inline script hash(es):`);
  for (const hash of needed) {
    const { snippet, files: where } = hashes.get(hash);
    console.log(`  '${hash}'  (${where.size} page(s))  ${snippet}...`);
  }
  process.exit(0);
}

const conf = readFileSync(nginxConf, 'utf-8');
// The admin CSP (Sveltia needs 'unsafe-inline') is out of scope; every other
// script-src line must carry exactly the hash set of the built pages.
const cspLines = conf.split('\n').filter((line) => line.includes('Content-Security-Policy') && line.includes('script-src') && !line.includes('github.com'));
if (cspLines.length === 0) {
  console.error('Could not locate any site CSP line in deploy/nginx.conf.');
  process.exit(1);
}

let failed = false;
for (const line of cspLines) {
  const scriptSrc = line.match(/script-src ([^;]*)/)?.[1] ?? '';
  const declared = [...scriptSrc.matchAll(/'(sha256-[^']+)'/g)].map((m) => m[1]).sort();
  const missing = needed.filter((hash) => !declared.includes(hash));
  const stale = declared.filter((hash) => !needed.includes(hash));
  if (scriptSrc.includes("'unsafe-inline'")) {
    console.error("A site script-src still contains 'unsafe-inline'; replace it with the hash allowlist.");
    failed = true;
  }
  for (const hash of missing) {
    const { snippet, files: where } = hashes.get(hash);
    console.error(`Missing from nginx.conf script-src: '${hash}' (${where.size} page(s): ${[...where][0]} …) ${snippet}...`);
    failed = true;
  }
  for (const hash of stale) {
    console.error(`Stale hash in nginx.conf script-src (no longer in dist): '${hash}'`);
    failed = true;
  }
}
if (failed) {
  console.error('Update deploy/nginx.conf, install it on the VPS, and reload Nginx (maintenance deployment).');
  process.exit(1);
}
console.log(`CSP hash allowlist matches dist across ${cspLines.length} policy line(s): ${needed.length} inline script hash(es).`);
