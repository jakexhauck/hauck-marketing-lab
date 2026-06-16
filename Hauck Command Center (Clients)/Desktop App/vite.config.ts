import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": r("./src"),
      // Consume the shared core's raw TS source directly so types never drift
      // and there's no build step between packages.
      "@hauck/core": r("../../packages/core/src/index.ts"),
    },
  },
  server: {
    port: 5174,
    // Mirror the mobile app: proxy /api to the local Wrangler functions server.
    // In production, VITE_API_BASE points at the deployed API instead.
    proxy: {
      "/api": {
        target: "http://localhost:8788",
        changeOrigin: true,
      },
    },
  },
});
