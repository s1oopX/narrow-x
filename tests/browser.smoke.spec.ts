import { expect, test, type Page } from '@playwright/test';

const LOCAL_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

test.beforeEach(async ({ page }) => {
  // Block every non-local request so the suite never depends on external services.
  await page.route('**/*', (route) => {
    const { hostname } = new URL(route.request().url());
    if (LOCAL_HOSTNAMES.has(hostname)) return route.continue();
    return route.abort();
  });
});

// Derive real posts from the list page instead of hardcoding slugs or titles.
async function collectPostCards(page: Page, count: number) {
  await page.goto('/posts/');
  const cards = page.locator('main article a[href*="/posts/"]:has(h2)');
  const posts: Array<{ href: string; title: string }> = [];
  for (let index = 0; index < count; index += 1) {
    const card = cards.nth(index);
    const href = await card.getAttribute('href');
    const title = (await card.locator('h2').innerText()).trim();
    expect(href).toBeTruthy();
    expect(title.length).toBeGreaterThan(0);
    posts.push({ href: href!, title });
  }
  return posts;
}

test('mobile layout and search remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.locator('[data-layout-width]')).toBeHidden();

  const [post] = await collectPostCards(page, 1);

  await page.keyboard.press('Control+K');
  const modal = page.locator('#search-modal');
  await expect(modal).toHaveAttribute('aria-hidden', 'false');
  await expect(modal).not.toHaveAttribute('inert', '');

  await page.locator('#search-input').fill(post.title);
  await expect(page.locator('#search-results a', { hasText: post.title }).first()).toBeVisible();
  await expect(page.locator('#search-results mark').first()).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(modal).toHaveAttribute('aria-hidden', 'true');
  await expect(modal).toHaveAttribute('inert', '');
});

test('theme persists across routes and English has an explicit state', async ({ page }) => {
  const [post] = await collectPostCards(page, 1);

  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('color-mode', 'light'));
  await page.reload();
  await page.locator('header [data-display-menu]').click();
  await page.locator('header [data-color-mode]').click();
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);

  await page.goto(post.href);
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);

  await page.goto('/en/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
});

test('likes remain scoped to each article', async ({ page }) => {
  const [first, second] = await collectPostCards(page, 2);

  await page.goto(first.href, { waitUntil: 'domcontentloaded' });
  const firstButton = page.locator('[data-like-button]');
  const firstCount = Number(await page.locator('[data-like-count]').textContent());
  await firstButton.click();
  await expect(firstButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-like-count]')).toHaveText(String(firstCount + 1));

  await page.goto(second.href, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-like-button]')).toHaveAttribute('aria-pressed', 'false');

  await page.goto(first.href, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-like-button]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-like-count]')).toHaveText(String(firstCount + 1));
});

test('dock display controls switch palette and color mode persistently', async ({ page }) => {
  await page.goto('/');
  await page.locator('header [data-display-menu]').click();

  const option = page.locator('header [data-theme-value][aria-pressed="false"]').first();
  const paletteId = await option.getAttribute('data-theme-value');
  expect(paletteId).toBeTruthy();
  await option.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', paletteId!);

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', paletteId!);

  await page.locator('header [data-display-menu]').click();
  await page.locator('header [data-color-mode]').click();
  const darkAfterToggle = await page.evaluate(() => document.documentElement.classList.contains('dark'));

  await page.reload();
  expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(darkAfterToggle);
  await expect(page.locator('html')).toHaveAttribute('data-theme', paletteId!);
});

test('archives honor the category query parameter', async ({ page }) => {
  await page.goto('/archives/');
  await expect(page.locator('[data-archive-filter-root]')).toBeVisible();

  const filterButton = page
    .locator('[data-archive-filter-kind="category"]:not([data-archive-filter-value=""])')
    .first();
  const category = await filterButton.getAttribute('data-archive-filter-value');
  expect(category).toBeTruthy();

  await page.goto(`/archives/?category=${encodeURIComponent(category!)}`);
  // The filter root only becomes visible once the script has applied the state.
  await expect(page.locator('[data-archive-filter-root]')).toBeVisible();
  await expect(
    page.locator('[data-archive-filter-kind="category"][aria-pressed="true"]').first()
  ).toHaveAttribute('data-archive-filter-value', category!);

  const visibleEntries = page.locator('[data-archive-entry]:not([hidden])');
  const count = await visibleEntries.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const terms = JSON.parse((await visibleEntries.nth(index).getAttribute('data-categories')) ?? '[]') as string[];
    expect(terms).toContain(category);
  }
});

test('search surfaces an error state when the index fails to load', async ({ page }) => {
  let indexRequests = 0;
  await page.route('**/api/search.json', (route) => {
    indexRequests += 1;
    return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
  });

  await page.goto('/');
  await page.keyboard.press('Control+K');
  const modal = page.locator('#search-modal');
  await expect(modal).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#search-error')).toBeVisible();

  // Typing must not refire the failed fetch within the same modal session.
  await page.locator('#search-input').fill('anything');
  await page.waitForTimeout(400);
  await expect(page.locator('#search-error')).toBeVisible();
  expect(indexRequests).toBe(1);

  await page.keyboard.press('Escape');
  await expect(modal).toHaveAttribute('aria-hidden', 'true');
  await expect(modal).toHaveAttribute('inert', '');
});
