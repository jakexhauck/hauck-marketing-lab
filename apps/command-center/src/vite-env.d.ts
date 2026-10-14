/// <reference types="vite/client" />

// Injected at build time from package.json (see vite.config.ts `define`). Shown
// in Settings so a client can read the build to support against.
declare const __APP_VERSION__: string;
