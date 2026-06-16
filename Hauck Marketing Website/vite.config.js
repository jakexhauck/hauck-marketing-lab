import { defineConfig } from 'vite'

// Multi-page static site. index.html is the homepage (the Revenue Recovery System).
// Each pillar, the founder letter, the Command Center, and the booking page is its
// own self-contained page. Listing them as build inputs makes Vite emit them to
// dist/ (privacy.html and terms.html still ship from public/).
// https://vite.dev/config/
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        capture: 'capture-c.html',
        convert: 'convert-c.html',
        compound: 'compound-c.html',
        commandCenter: 'command-center.html',
        founder: 'founder.html',
        book: 'book.html',
      },
    },
  },
})
