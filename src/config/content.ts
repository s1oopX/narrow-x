import type { Locale } from './i18n';

export type ContentCollection = 'posts' | 'projects' | 'recommendations' | 'pages';
export type EntryCardStyle = 'article' | 'showcase' | 'compact';
export type EntryListLayout = 'stack' | 'grid';
export type EntryGridColumns = 1 | 2 | 3;
export type HomeSectionConfig = {
  enabled: boolean;
  limit: number;
  featuredOnly?: boolean;
  title: Record<Locale, string>;
};

export const contentTypes = {
  posts: {
    collection: 'posts',
    path: '/posts/',
    icon: 'lucide:file-text',
    label: {
      en: 'Posts',
      'zh-cn': '文章'
    },
    showMeta: true,
    cardStyle: 'article',
    listLayout: 'stack',
    gridColumns: 1,
    home: {
      enabled: true,
      limit: 5,
      title: {
        en: 'Recent Posts',
        'zh-cn': '最近文章'
      }
    }
  },
  projects: {
    collection: 'projects',
    path: '/projects/',
    icon: 'lucide:layers',
    label: {
      en: 'Works',
      'zh-cn': '作品'
    },
    showMeta: true,
    cardStyle: 'showcase',
    listLayout: 'grid',
    gridColumns: 3,
    home: {
      enabled: true,
      limit: 3,
      featuredOnly: true,
      title: {
        en: 'Featured Works',
        'zh-cn': '精选作品'
      }
    }
  },
  recommendations: {
    collection: 'recommendations',
    path: '/recommendations/',
    icon: 'lucide:bookmark',
    label: {
      en: 'Recommendations',
      'zh-cn': '推荐'
    },
    showMeta: true,
    cardStyle: 'article',
    listLayout: 'stack',
    gridColumns: 1,
    home: {
      enabled: true,
      limit: 3,
      featuredOnly: true,
      title: {
        en: 'Recent Recommendations',
        'zh-cn': '最近推荐'
      }
    }
  }
} satisfies Record<string, {
  collection: ContentCollection;
  path: string;
  icon: string;
  label: Record<Locale, string>;
  showMeta: boolean;
  cardStyle: EntryCardStyle;
  listLayout: EntryListLayout;
  gridColumns: EntryGridColumns;
  home?: HomeSectionConfig;
}>;

export type ContentTypeId = keyof typeof contentTypes;
