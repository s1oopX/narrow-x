export const defaultLocale = 'en';
export const locales = ['en', 'zh-cn'] as const;
/** Sections that exist as true 1:1 translations in every locale — used by the
 * language switcher and by BaseLayout's hreflang alternates. */
export const sharedSections = new Set(['about', 'archives', 'posts', 'projects', 'recommendations', 'series']);

export type Locale = (typeof locales)[number];

export const nonDefaultLocales: readonly Locale[] = locales.filter((locale) => locale !== defaultLocale);

export const localeMeta: Record<Locale, { label: string; htmlLang: string }> = {
  en: {
    label: 'English',
    htmlLang: 'en'
  },
  'zh-cn': {
    label: '简体中文',
    htmlLang: 'zh-CN'
  }
};

export function isLocale(value: string | undefined): value is Locale {
  return Boolean(value && locales.includes(value as Locale));
}

export function getLocalePath(locale: Locale, path = '/') {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const localized = locale === defaultLocale ? normalized : `/${locale}${normalized === '/' ? '/' : normalized}`;
  const base = import.meta.env.BASE_URL || '/';
  if (base === '/') return localized;
  return `${base.replace(/\/$/, '')}${localized}`.replace(/\/+/g, '/');
}

function stripBasePath(path: string) {
  const base = import.meta.env.BASE_URL || '/';
  if (base === '/') return path;

  const normalizedBase = base.replace(/\/$/, '');
  if (path === normalizedBase) return '/';
  if (path.startsWith(`${normalizedBase}/`)) return path.slice(normalizedBase.length) || '/';
  return path;
}

export function switchLocalePath(targetLocale: Locale, currentPath: string) {
  const withoutBase = stripBasePath(currentPath);
  const normalized = withoutBase.startsWith('/') ? withoutBase : `/${withoutBase}`;
  const segments = normalized.split('/').filter(Boolean);
  const currentLocale = isLocale(segments[0]) ? segments[0] : defaultLocale;
  const rest = currentLocale === defaultLocale ? segments : segments.slice(1);
  const currentLocalePath = `/${rest.join('/')}${rest.length > 0 ? '/' : ''}`.replace(/\/+/g, '/');
  const knownPath = rest.length === 0 || (rest[0] && sharedSections.has(rest[0]));

  if (targetLocale === currentLocale) return getLocalePath(targetLocale, knownPath ? currentLocalePath : '/');

  const section = rest[0];
  return getLocalePath(targetLocale, section && sharedSections.has(section) ? `/${section}/` : '/');
}

export function getLocaleFromId(id: string): Locale {
  const firstSegment = id.split('/')[0];
  return isLocale(firstSegment) ? firstSegment : defaultLocale;
}

export function stripLocaleFromId(id: string) {
  const [firstSegment, ...rest] = id.split('/');
  return isLocale(firstSegment) ? rest.join('/') : id;
}
