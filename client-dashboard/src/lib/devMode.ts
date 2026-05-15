let cached: boolean | null = null;

export function devMode(): boolean {
  if (cached !== null) return cached;
  if (typeof window === "undefined") {
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
