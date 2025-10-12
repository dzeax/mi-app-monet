// Tailwind v4 needs the postcss plugin; force wasm fallback so native bindings aren't required
if (!process.env.TAILWIND_DISABLE_OXIDE) {
  process.env.TAILWIND_DISABLE_OXIDE = '1';
}
if (!process.env.TAILWIND_DISABLE_LIGHTNINGCSS) {
  process.env.TAILWIND_DISABLE_LIGHTNINGCSS = '1';
}

export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
