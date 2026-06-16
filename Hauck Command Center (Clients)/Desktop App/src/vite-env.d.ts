/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Fontsource exposes CSS side-effect entry points without TS types. vite/client
// already covers `*.css`; these cover the bare variable-font specifiers.
declare module "@fontsource-variable/inter";
declare module "@fontsource-variable/archivo";
