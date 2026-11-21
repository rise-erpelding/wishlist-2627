// @ts-check
import { defineConfig, envField } from 'astro/config';
import netlify from '@astrojs/netlify';

export default defineConfig({
  output: 'server',
  // Claims must show up quickly: never cache list pages on the CDN.
  adapter: netlify({ cacheOnDemandPages: false, imageCDN: false }),
  env: {
    // All Contentful values are server-only secrets. Never use client/public here.
    // Optional for now so the scaffold runs before the new tokens exist.
    schema: {
      CONTENTFUL_SPACE_ID: envField.string({ context: 'server', access: 'secret', optional: true }),
      CONTENTFUL_ENVIRONMENT: envField.string({ context: 'server', access: 'secret', default: 'master' }),
      CONTENTFUL_DELIVERY_TOKEN: envField.string({ context: 'server', access: 'secret', optional: true }),
      CONTENTFUL_MANAGEMENT_TOKEN: envField.string({ context: 'server', access: 'secret', optional: true }),
    },
  },
});
