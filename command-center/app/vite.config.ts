import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
// One brand source: the manifest reads the same constant the app renders, so
// the home-screen label can never drift from the in-app identity.
import { APP_BRAND } from "./src/lib/appBrand";
import { version as pkgVersion } from "./package.json";

export default defineConfig({
  // Expose the build version to the app (Settings shows it for support).
  define: {
    __APP_VERSION__: JSON.stringify(pkgVersion),
  },
  plugins: [
    react(),
    tailwindcss(),
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
        // Large brand source art is not offline-critical and blows past the
        // 2 MiB per-file precache cap; keep it out of the service worker.
        //
        // funnel/intake.js is the client intake form, loaded by a GoHighLevel
        // page on another origin. Nobody using this app ever requests it, and a
        // cross-origin script tag is not served by our service worker anyway, so
        // precaching it only costs every staff member a download they cannot use.
        globIgnores: ["**/hauck-mark.png", "funnel/**"],
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
