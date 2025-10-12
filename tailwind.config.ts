import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Si quieres seguir extendiendo otras utilidades, hazlo aquí.
      // Los colores y la fuente Inter ya se definen en @theme de globals.css,
      // así que no hace falta declararlos aquí.
    },
  },
  plugins: [],
}

export default config
