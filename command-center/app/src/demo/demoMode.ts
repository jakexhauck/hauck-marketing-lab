// Demo client view: a per-tab sandbox that renders the full client experience on
// fabricated, in-memory data. Activated by `?demo=1` (opened from the admin Build
// Lab) and persisted in sessionStorage so in-app navigation, which drops the query
// string, keeps the tab in demo. sessionStorage only: never a cookie or
// localStorage, so demo state dies with the tab and can never leak into a real
// client session. Demo mode also makes api() skip the network entirely, so it is
// physically incapable of reading or mutating a real client.

const STORAGE_KEY = "hml_demo";

let cached: boolean | null = null;

export function demoMode(): boolean {
  if (cached !== null) return cached;
  if (typeof window === "undefined") {
    cached = false;
    return cached;
  }
  let active = false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("demo") === "1") {
      active = true;
      window.sessionStorage.setItem(STORAGE_KEY, "1");
    } else if (window.sessionStorage.getItem(STORAGE_KEY) === "1") {
      active = true;
    }
  } catch {
    // sessionStorage unavailable (privacy mode): fall back to the URL only.
    active =
      new URLSearchParams(window.location.search).get("demo") === "1";
  }
  cached = active;
  return cached;
}

// Leave the demo: drop the per-tab flag so a reload returns to the real app.
export function clearDemoMode(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  cached = null;
}

// Test-only: reset the module cache between cases.
export function __resetDemoModeCache(): void {
  cached = null;
}
