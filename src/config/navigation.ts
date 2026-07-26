import { getLocalePath, type Locale } from './i18n';
import { contentTypes, type ContentTypeId } from './content';
import { siteConfig } from './site';
import type { UiKey } from '../i18n/ui';

export interface NavigationRoute {
  label: Record<Locale, string>;
  href: string;
  icon: string;
}

const systemRoutes = {
  archives: {
    label: { en: 'Archives', 'zh-cn': '归档' },
    href: '/archives/',
    icon: 'lucide:archive'
  },
  rss: {
    label: { en: 'RSS', 'zh-cn': 'RSS' },
    href: '/rss.xml',
    icon: 'lucide:rss'
  },
  series: {
    label: { en: 'Series', 'zh-cn': '系列' },
    href: '/series/',
    icon: 'lucide:list-ordered'
  }
} satisfies Record<string, NavigationRoute>;

export type NavigationRouteId = ContentTypeId | keyof typeof systemRoutes;

export type NavigationConfigItem = NavigationRouteId | NavigationRoute;

const contentRoutes = Object.fromEntries(
  Object.entries(contentTypes).map(([id, config]) => [id, {
    label: config.label,
    href: config.path,
    icon: config.icon
  }])
) as Record<ContentTypeId, NavigationRoute>;

const routeRegistry = {
  ...contentRoutes,
  ...systemRoutes
} satisfies Record<NavigationRouteId, NavigationRoute>;

function resolveNavigationItem(item: NavigationConfigItem): NavigationRoute {
  if (typeof item !== 'string') return item;
  const route = routeRegistry[item];
  if (!route) {
    throw new Error(
      `Unknown navigation id "${item}" in siteConfig.nav/footerNav. Known ids: ${Object.keys(routeRegistry).join(', ')}.`
    );
  }
  return route;
}

function resolveHref(locale: Locale, href: string) {
  if (/^(https?:)?\/\//.test(href) || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('#')) {
    return href;
  }
  return getLocalePath(locale, href);
}

export function getNavigation(locale: Locale, items: NavigationConfigItem[] = siteConfig.nav) {
  return items
    .map(resolveNavigationItem)
    .map((item) => ({
      href: resolveHref(locale, item.href),
      label: item.label[locale],
      icon: item.icon
    }));
}

export function getFooterNavigation(locale: Locale) {
  return getNavigation(locale, siteConfig.footerNav);
}

/** Primary navigation shared by the sidebar and the mobile header menu. */
export function getPrimaryNavigation(locale: Locale, t: (key: UiKey) => string) {
  return [
    { href: getLocalePath(locale, '/'), label: t('dock.home'), icon: 'lucide:home' },
    ...getNavigation(locale),
    { href: getLocalePath(locale, '/about/'), label: t('nav.about'), icon: 'lucide:circle-user-round' }
  ];
}

/**
 * Shared active-state check for navigation links. The home link only matches
 * exactly; other links also match their sub-paths.
 */
export function isActiveNavPath(href: string, currentPath: string, homeHref: string) {
  const normalize = (path: string) => path.replace(/\/+$/, '') || '/';
  const current = normalize(currentPath);
  const target = normalize(href);
  if (target === normalize(homeHref)) return current === target;
  return current === target || current.startsWith(`${target}/`);
}
