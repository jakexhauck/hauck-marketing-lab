import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 24 * 60 * 60 * 1000,
      refetchOnWindowFocus: true,
      // Never retry 4xx responses (an expired session 401 will not heal by
      // asking again); allow one retry for network failures and 5xx.
      retry: (count, err) =>
        !(err instanceof ApiError && err.status >= 400 && err.status < 500) &&
        count < 1,
    },
    mutations: {
      retry: 0,
    },
  },
});

// localStorage key the persisted query cache lives under (see main.tsx).
export const PERSIST_CACHE_KEY = "hml_query_cache";

// Version stamp for the persisted cache. Bump this whenever a persisted query's
// shape changes so every client discards its old snapshot on next load instead
// of rehydrating a stale, partial payload. This is what recovered clients stuck
// on a pre-fix `["ads","insights"] = { configured: false }` entry (no `totals`),
// which rehydrated before any refetch and crashed the Paid Ads render.
export const PERSIST_CACHE_BUSTER = "2026-07-02.ads-normalize";

// Runtime cache names the service worker writes to (see sw.ts).
const SW_RUNTIME_CACHES = ["api-get", "api-detail"];

// One hammer for every cache layer: react-query memory, the persisted
// localStorage snapshot, and the service worker's runtime caches. Called on
// sign-out, on sign-in (the previous session may have been the other mode),
// and on a forced 401 sign-out, so no account/mode ever sees another's data.
export async function clearAllCaches(): Promise<void> {
  queryClient.clear();
  try {
    localStorage.removeItem(PERSIST_CACHE_KEY);
  } catch {
    // storage unavailable; nothing persisted to clear
  }
  if (typeof caches !== "undefined") {
    await Promise.all(
      SW_RUNTIME_CACHES.map((name) => caches.delete(name).catch(() => false)),
    );
  }
}
