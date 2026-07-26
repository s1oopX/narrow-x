import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.argv[2] || 'dist');
const base = `/${String(process.env.ASTRO_BASE || '').replace(/^\/+|\/+$/g, '')}`.replace(/^\/$/, '');
const failures = [];

let home;
try {
  home = readFileSync(join(root, 'index.html'), 'utf8');
} catch {
  console.error(`Cannot read ${join(root, 'index.html')}; run the build first (or pass the dist directory as an argument).`);
  process.exit(1);
}

function attribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] || '';
}

function fileSize(path, label) {
  try {
    return statSync(path).size;
  } catch {
    failures.push(`${label} is missing or unreadable: ${path}`);
    return 0;
  }
}

function assetSize(url) {
  const pathname = new URL(url, 'https://build.invalid').pathname;
  const relativePath = base && pathname.startsWith(`${base}/`)
    ? pathname.slice(base.length + 1)
    : pathname.replace(/^\//, '');
  return fileSize(join(root, ...relativePath.split('/')), `homepage srcset asset ${url}`);
}

const coverTags = [...home.matchAll(/<img\b(?=[^>]*\bsrcset=)[^>]*>/g)].map((match) => match[0]);
const priorityCovers = coverTags.filter((tag) => attribute(tag, 'fetchpriority') === 'high');
if (coverTags.length === 0) failures.push('homepage has no responsive cover images');
if (priorityCovers.length !== 1) failures.push(`homepage must have exactly one high-priority cover, found ${priorityCovers.length}`);
if (home.includes('/covers/')) failures.push('homepage still references unoptimized public cover images');

const totals = new Map();
for (const tag of coverTags) {
  const candidates = attribute(tag, 'srcset').split(',').map((candidate) => candidate.trim());
  const widths = new Set();
  for (const candidate of candidates) {
    const match = candidate.match(/^(\S+)\s+(\d+)w$/);
    if (!match) continue;
    const width = Number(match[2]);
    widths.add(width);
    totals.set(width, (totals.get(width) || 0) + assetSize(match[1]));
  }
  if (!widths.has(360) || !widths.has(720)) failures.push(`cover is missing 360w or 720w candidates: ${attribute(tag, 'src')}`);
}

const limits = new Map([[360, 250 * 1024], [720, 500 * 1024]]);
for (const [width, limit] of limits) {
  const total = totals.get(width) || 0;
  if (total > limit) failures.push(`${width}w homepage covers total ${Math.ceil(total / 1024)} KiB, limit is ${limit / 1024} KiB`);
}

const searchBytes = fileSize(join(root, 'api', 'search.json'), 'search index');
// Lazy-loaded only when search opens and served gzipped (~1/3 of raw size).
if (searchBytes > 300 * 1024) failures.push(`search index is ${Math.ceil(searchBytes / 1024)} KiB, limit is 300 KiB`);

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Asset budgets passed: ${coverTags.length} responsive covers, 360w ${Math.ceil((totals.get(360) || 0) / 1024)} KiB, 720w ${Math.ceil((totals.get(720) || 0) / 1024)} KiB, search ${Math.ceil(searchBytes / 1024)} KiB.`);
}
