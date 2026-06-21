import type { CSSProperties } from "react";

// Hauck internal dark-green theme, applied by OVERRIDING the existing CSS
// variables on a wrapping element (the admin shell, the login screen) rather
// than editing the global theme. Existing var-based Tailwind classes
// (bg-[var(--surface)], var(--brand-primary), etc.) then render green with no
// per-component changes. Palette taken from the internal SOP site / logo.
export const GREEN_THEME_VARS = {
  "--bg": "#081512",
  "--surface": "#0c211c",
  "--surface-2": "#102a23",
  "--surface-3": "#0e2620",
  "--border": "#1c3a31",
  "--divider": "rgba(28,58,49,0.5)",
  "--text": "#ffffff",
  "--text-muted": "#90a89e",
  "--text-faint": "#54695f",
  "--brand-primary": "#4dbb83",
  "--brand-primary-tint": "rgba(77,187,131,0.12)",
  "--brand-fg": "#06140f",
  "--brand-text": "#4dbb83",
  "--ring": "#4dbb83",
} as CSSProperties;

export const BRAND_GRADIENT = "linear-gradient(165deg, #0c2820 0%, #061410 100%)";
