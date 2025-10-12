/**
 * PostCSS config for Tailwind CSS v4 (Next.js)
 *
 * Tailwind v4 requires the `@tailwindcss/postcss` plugin so that
 * `@import "tailwindcss"`, `@theme`, `@layer`, etc. are processed at build time.
 */
module.exports = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

