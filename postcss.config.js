/**
 * PostCSS config for Tailwind CSS v4 (Next.js)
 *
 * Tailwind v4 requires the `@tailwindcss/postcss` plugin so that
 * `@import "tailwindcss"`, `@theme`, `@layer`, etc. are processed at build time.
 */
// Lightning CSS binaries are optional and may not be present in every CI
// environment. Disable its usage so Tailwind falls back to the JS pipeline.
process.env.TAILWIND_DISABLE_LIGHTNINGCSS = '1';
process.env.TAILWIND_DISABLE_OXIDE = '1';

module.exports = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
