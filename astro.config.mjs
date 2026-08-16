import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://kakeru110.github.io',
  base: '/newthree',
  integrations: [mdx()],
});
