import type { Locale } from './i18n';
import type { NavigationConfigItem } from './navigation';

type GiscusFlag = '0' | '1';

interface GiscusCommentsConfig {
  enabled: boolean;
  provider: 'giscus';
  giscus: {
    repo: `${string}/${string}`;
    repoId: string;
    category: string;
    categoryId: string;
    mapping: 'pathname';
    strict: GiscusFlag;
    reactionsEnabled: GiscusFlag;
    emitMetadata: GiscusFlag;
    inputPosition: 'top' | 'bottom';
    theme: 'preferred_color_scheme' | 'light' | 'dark';
  };
}

interface AnalyticsConfig {
  enabled: boolean;
  provider: 'umami';
  umami: {
    src: string;
    websiteId: string;
    domains: string;
  };
}

interface GalleryConfig {
  defaultLayout: 'justified' | 'masonry' | 'grid';
  gap: number;
  targetRowHeight: number;
  lastRowBehavior: 'left' | 'center' | 'right' | 'fill' | 'hide';
  columnWidth: number;
  columns: number | 'auto';
}

interface PostConfig {
  relatedCount: number;
  license: {
    enabled: boolean;
    name: string;
    url: string;
    description: Record<Locale, string>;
  };
}

export const siteConfig = {
  name: 'Narrow-X',
  shortName: 'Narrow-X',
  description: {
    en: 'A quiet, content-first Astro blog theme: bilingual routing, self-hosted comments, and a full VPS deploy stack.',
    'zh-cn': '安静的内容优先 Astro 博客主题：双语路由、自托管评论与完整的 VPS 部署链路。'
  },
  // 1200×630 share card used when a page has no cover of its own.
  defaultOgImage: '/og-default.png',
  // Footer credit for the theme. Keep it as attribution, or repoint it if you
  // maintain your own fork.
  themeCredit: {
    name: 'Narrow-X',
    url: 'https://github.com/s1oopX/narrow-x'
  },
  author: {
    name: 'Your Name',
    title: {
      en: 'A one-line intro about you',
      'zh-cn': '一句话介绍你自己'
    },
    description: {
      en: 'Replace this with a short paragraph about who you are and what you build.',
      'zh-cn': '把这里换成一段你的自我介绍。'
    },
    avatar: '/avatar-thumb.webp',
    social: [
      { name: 'GitHub', url: 'https://github.com/your-github', icon: 'simple-icons:github' },
      { name: 'Telegram', url: 'https://t.me/your-handle', icon: 'simple-icons:telegram' },
      { name: 'Email', url: 'mailto:you@example.com', icon: 'lucide:mail' }
    ]
  },
  contentWidth: '56rem',
  ui: {
    navbar: {
      sticky: true
    },
    dock: {
      enabled: true
    }
  },
  nav: ['posts', 'projects', 'recommendations'],
  footerNav: ['archives', 'rss'],
  comments: {
    enabled: false,
    provider: 'giscus',
    giscus: {
      repo: 'your-github/your-repo',
      repoId: '',
      category: 'General',
      categoryId: '',
      mapping: 'pathname',
      strict: '1',
      reactionsEnabled: '0',
      emitMetadata: '0',
      inputPosition: 'top',
      theme: 'preferred_color_scheme'
    }
  },
  analytics: {
    enabled: false,
    provider: 'umami',
    umami: {
      src: '',
      websiteId: '',
      domains: ''
    }
  },
  gallery: {
    defaultLayout: 'justified',
    gap: 10,
    targetRowHeight: 220,
    lastRowBehavior: 'center',
    columnWidth: 220,
    columns: 'auto'
  },
  post: {
    relatedCount: 3,
    license: {
      enabled: true,
      name: 'CC BY-NC-SA 4.0',
      url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
      description: {
        en: 'This work is licensed under a Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License.',
        'zh-cn': '本作品采用知识共享署名-非商业性使用-相同方式共享 4.0 国际许可协议进行许可。'
      }
    }
  }
} satisfies {
  name: string;
  shortName: string;
  description: Record<Locale, string>;
  defaultOgImage: string;
  themeCredit: { name: string; url: string };
  author: {
    name: string;
    title: Record<Locale, string>;
    description: Record<Locale, string>;
    avatar: string;
    social: Array<{ name: string; url: string; icon: string }>;
  };
  contentWidth: `${number}rem`;
  ui: {
    navbar: {
      sticky: boolean;
    };
    dock: {
      enabled: boolean;
    };
  };
  nav: NavigationConfigItem[];
  footerNav: NavigationConfigItem[];
  comments: GiscusCommentsConfig;
  analytics: AnalyticsConfig;
  gallery: GalleryConfig;
  post: PostConfig;
};
