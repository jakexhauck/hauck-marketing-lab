/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#080C10',
        surface: '#111820',
        accent: '#0EA5E9',
        'accent-warm': '#F97316',
        'text-primary': '#F0F4F8',
        'text-muted': '#6B7E8F',
        border: '#1E2D3D',
      },
      fontFamily: {
        syne: ['Syne', 'sans-serif'],
        fraunces: ['Fraunces', 'serif'],
        dm: ['DM Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}

