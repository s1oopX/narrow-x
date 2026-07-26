import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(process.argv[2] || 'dist');
const base = `/${String(process.env.ASTRO_BASE || '').replace(/^\/+|\/+$/g, '')}`.replace(/^\/$/, '');
const htmlFiles = [];

function collect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collect(path);
    else if (entry.name.endsWith('.html')) htmlFiles.push(path);
  }
}

function resolves(pathname) {
  const withoutBase = base && pathname.startsWith(`${base}/`) ? pathname.slice(base.length) : pathname;
  const path = withoutBase.replace(/^\//, '');
  return pathname.endsWith('/')
    ? existsSync(join(root, path, 'index.html'))
    : existsSync(join(root, path)) || existsSync(join(root, path, 'index.html'));
}

collect(root);

function checkUrl(broken, file, url, label = '') {
  if (!url.startsWith('/') || url.startsWith('//')) return;
  const pathname = url.split(/[?#]/, 1)[0];
  if (pathname && !resolves(pathname)) broken.push(`${relative(root, file)} -> ${label}${url}`);
}

const broken = [];
for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  for (const match of html.matchAll(/\s(?:href|src)\s*=\s*["']([^"']+)["']/g)) {
    checkUrl(broken, file, match[1]);
  }
  for (const match of html.matchAll(/\ssrcset\s*=\s*["']([^"']+)["']/g)) {
    for (const candidate of match[1].split(',')) {
      const url = candidate.trim().split(/\s+/, 1)[0];
      if (url) checkUrl(broken, file, url, 'srcset ');
    }
  }
}

if (broken.length) {
  console.error(broken.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Checked ${htmlFiles.length} HTML files: all local links and assets resolve.`);
}
