import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://kakeru110.github.io',
  base: '/tokeidokkai',
  integrations: [mdx(), sitemap()],
});
