import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const articles = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/articles' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: z.string(),
    tags: z.array(z.string()).default([]),
    publishedDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    sourceName: z.string(),
    sourceUrl: z.string().url(),
    dataAsOf: z.string(),
    href: z.string(),
  }),
});

export const collections = { articles };
