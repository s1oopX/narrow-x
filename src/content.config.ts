import { defineCollection, reference, z, type ImageFunction } from 'astro:content';
import { glob } from 'astro/loaders';

const taxonomyTerm = z.string().trim().min(1);
const externalUrl = z.string().url().refine((value) => {
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}, 'URL must use http or https');
// Sveltia CMS uploads land in public/uploads/ and are referenced by site path.
const uploadPath = z.string().regex(/^\/uploads\//, 'Local cover paths must start with /uploads/');

const baseSchema = (image: ImageFunction) => z.object({
  title: z.string(),
  description: z.string().optional(),
  pubDate: z.coerce.date().optional(),
  updatedDate: z.coerce.date().optional(),
  draft: z.boolean().default(false),
  cover: z.union([image(), externalUrl, uploadPath]).optional(),
  lang: z.enum(['en', 'zh-cn']).optional(),
  toc: z.union([z.boolean(), z.enum(['center', 'side'])]).optional(),
  comments: z.boolean().optional()
});

const showcaseFields = {
  tags: z.array(taxonomyTerm).default([]),
  links: z.array(z.object({
    label: z.string(),
    url: externalUrl,
    icon: z.string().optional(),
    variant: z.enum(['primary', 'secondary']).default('secondary')
  })).default([]),
  featured: z.boolean().default(false),
  comments: z.boolean().default(true)
};

const posts = defineCollection({
  loader: glob({ base: './src/content/posts', pattern: '**/*.md' }),
  schema: ({ image }) => baseSchema(image).extend({
    pubDate: z.coerce.date(),
    tags: z.array(taxonomyTerm).default([]),
    categories: z.array(taxonomyTerm).default([]),
    featured: z.boolean().default(false),
    comments: z.boolean().default(true)
  })
});

const projects = defineCollection({
  loader: glob({ base: './src/content/projects', pattern: '**/*.md' }),
  schema: ({ image }) => baseSchema(image).extend(showcaseFields)
});

const recommendations = defineCollection({
  loader: glob({ base: './src/content/recommendations', pattern: '**/*.md' }),
  schema: ({ image }) => baseSchema(image).extend(showcaseFields)
});

const pages = defineCollection({
  loader: glob({ base: './src/content/pages', pattern: '**/*.md' }),
  schema: ({ image }) => baseSchema(image).extend({
    layout: z.enum(['page', 'timeline']).default('page')
  })
});

const series = defineCollection({
  loader: glob({ base: './src/content/series', pattern: '**/*.md' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    draft: z.boolean().default(false),
    lang: z.enum(['en', 'zh-cn']).optional(),
    chapters: z.array(reference('posts')).min(2)
  })
});

export const collections = {
  posts,
  projects,
  recommendations,
  pages,
  series
};
