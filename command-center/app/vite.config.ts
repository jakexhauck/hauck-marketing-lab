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
        globIgnores: ["**/hauck-mark.png"],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8788",
        changeOrigin: true,
      },
    },
  },
});
