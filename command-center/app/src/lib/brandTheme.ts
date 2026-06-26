import type { CSSProperties } from "react";

// "Modern Motion" light theme for the login screen (repo-root design-kit.html).
// The rest of the app is already on the indigo Modern Motion tokens globally;
// the login overrides the CSS variables locally so it stays pinned to the kit's
// LIGHT values regardless of the user's saved light/dark theme (login is
// pre-auth) and renders the exact kit palette independent of any global drift.
export const MODERN_MOTION_VARS = {
  "--bg": "#f6f7fb",
  "--surface": "#ffffff",
  "--surface-2": "#f1f3f9",
  "--surface-3": "#e9ebf3",
  "--border": "#e7e9f1",
  "--border-strong": "#d4d8e6",
  "--divider": "#f1f3f9",
  "--text": "#14161f",
  "--text-muted": "#555a6b",
  "--text-faint": "#8a90a3",
  "--brand-primary": "#4f46e5",
  "--brand-primary-tint": "rgba(79,70,229,0.12)",
  "--brand-fg": "#ffffff",
  "--brand-text": "#4f46e5",
  "--ring": "#4f46e5",
} as CSSProperties;

// Indigo-to-violet brand gradient (kit --grad-brand) for the brand panel and
// the primary submit button.
export const MODERN_MOTION_GRADIENT =
  "linear-gradient(135deg, #4f46e5 0%, #7c73f0 100%)";

// The kit's three-radial mesh wash, painted behind the single-column mobile
// layout (the lg+ brand panel carries the gradient instead).
export const MODERN_MOTION_MESH =
  "radial-gradient(60rem 40rem at 12% -8%, rgba(124,115,240,0.16), transparent 60%)," +
  "radial-gradient(50rem 38rem at 100% 0%, rgba(79,70,229,0.12), transparent 55%)," +
  "radial-gradient(46rem 36rem at 50% 120%, rgba(99,102,241,0.10), transparent 60%)";
