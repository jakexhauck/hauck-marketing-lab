import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
// One brand source: the manifest reads the same constant the app renders, so
// the home-screen label can never drift from the in-app identity.
import { APP_BRAND } from "./src/lib/appBrand";
import { version as pkgVersion } from "./package.json";
// Dev-only SMS copy generation via the local `claude` CLI. It lives here
// rather than in functions/ because Cloudflare's runtime cannot spawn a
// process; see the file's own header.
import { followupCopyPlugin } from "./vite-plugins/followupCopy";

export default defineConfig({
  // Expose the build version to the app (Settings shows it for support).
  define: {
    __APP_VERSION__: JSON.stringify(pkgVersion),
  },
  plugins: [
    react(),
    tailwindcss(),
    followupCopyPlugin(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: [
        "favicon-16.png",
        "favicon-32.png",
        "apple-touch-icon.png",
        "icon-192.png",
        "icon-512.png",
        "icon-512-maskable.png",
      ],
      manifest: {
        name: APP_BRAND.appName,
        short_name: APP_BRAND.appName,
        start_url: "/",
        display: "standalone",
        // Matches the logo's dark-green icon tile so the install splash blends
        // seamlessly with the app icon (no seam behind the mark).
        background_color: "#0b1b17",
        theme_color: "#0b1b17",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"],
        // 4 MiB, up from workbox's 2 MiB default. The main bundle had grown to
        // 2,095,380 bytes, which is 1,772 bytes under the default cap: the next
        // change of ANY size was going to fail the production build with
        // "Assets exceeding the limit", and the message reads like the change
        // did something wrong rather than like the app quietly reached a cliff.
        //
        // Raising it rather than excluding the bundle on purpose: this is a PWA
        // whose whole offline story is precaching the app shell, and dropping
        // the one file that IS the app would mean the installed app no longer
        // opens offline. If the bundle keeps growing the real answer is route
        // level code splitting, which is a build change, not a config bump.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Large brand source art is not offline-critical and blows past the
        // 2 MiB per-file precache cap; keep it out of the service worker.
        //
        // funnel/** and sites/** are pages loaded by GoHighLevel steps on
        // another origin: the intake and pre-call funnels, and whole client
        // websites like Made Better LC. Nobody using this app ever requests
        // them, and a cross-origin script tag is not served by our service
        // worker anyway, so precaching them only costs every staff member a
        // download they cannot use.
        globIgnores: ["**/hauck-mark.png", "funnel/**", "sites/**"],
      },
    }),
  ],
  server: {
    port: 5173,
    // host:true binds all interfaces so the dev build is reachable from a
    // phone on the same wifi (mobile-layout testing). Dev-only.
    host: true,
    proxy: {
      "/api": {
        // Dev only. Another checkout of this repo may already own the default
        // ports, and whoever grabs one first serves whatever branch it is on.
        // API_PORT lets a worktree run a fully isolated pair.
        target: `http://localhost:${process.env.API_PORT ?? 8788}`,
        changeOrigin: true,
      },
    },
  },
});
