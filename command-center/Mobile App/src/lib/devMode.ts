let cached: boolean | null = null;

// Dev-only affordances (DevPanel, role/client switching). Hard-disabled in
// production builds: ?dev=1 must never unlock anything for a real client, and
// the localStorage flag must not survive into prod either.
export function devMode(): boolean {
  if (cached !== null) return cached;
  if (!import.meta.env.DEV || typeof window === "undefined") {
    cached = false;
    return cached;
  }
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("dev") === "1";
  const fromStorage = window.localStorage.getItem("devMode") === "1";
  if (fromQuery) {
    window.localStorage.setItem("devMode", "1");
  }
  cached = fromQuery || fromStorage;
  return cached;
}
