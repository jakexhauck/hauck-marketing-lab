import type { Client } from "../types";

type Brand = Client["brand"];

// Parse a hex color to RGB, tolerating shorthand (#abc) and a missing leading
// '#'. Returns null for anything that is not a valid 3- or 6-digit hex so the
// callers can leave a malformed brand color untouched instead of deriving
// "#NaNNaNNaN" from it.
function hexToRgb(hex: string): [number, number, number] | null {
  let m = hex.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(m)) {
    m = m.split("").map((c) => c + c).join("");
  }
  if (!/^[0-9a-f]{6}$/i.test(m)) return null;
  return [
    parseInt(m.slice(0, 2), 16),
    parseInt(m.slice(2, 4), 16),
    parseInt(m.slice(4, 6), 16),
  ];
}

function toHex(r: number, g: number, b: number): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function darken(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex; // unparseable input: leave it as-is, never emit NaN
  const [r, g, b] = rgb;
  return toHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

function lighten(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb;
  return toHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
}

// WCAG relative luminance of an sRGB hex, used to pick a legible foreground.
function relLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const lin = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

// The brand color is theme-independent as a *fill*, so its on-fill text can be
// set inline without fighting the light/dark CSS. A bright brand (our green)
// reads with near-black text like the internal site; a dark brand (navy) reads
// with white. Pick whichever has more contrast against the fill.
function bestForeground(hex: string): string {
  const l = relLuminance(hex);
  const onDark = (l + 0.05) / (relLuminance("#06140f") + 0.05);
  const onWhite = (1.05) / (l + 0.05);
  return onDark >= onWhite ? "#06140f" : "#ffffff";
}

export function applyBrandVars(brand: Brand): void {
  const root = document.documentElement;
  root.style.setProperty("--brand-primary", brand.color);
  root.style.setProperty("--brand-primary-dark", darken(brand.color, 0.15));
  root.style.setProperty("--brand-primary-tint", lighten(brand.color, 0.85));
  // On-fill text color for buttons / the brand mark. --brand-text (the deeper
  // on-light text shade) stays CSS-driven so it can follow the active theme.
  root.style.setProperty("--brand-fg", bestForeground(brand.color));
}
