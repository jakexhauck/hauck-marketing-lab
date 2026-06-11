import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import App from "./App";
import { queryClient, PERSIST_CACHE_KEY } from "./lib/queryClient";
import "./index.css";

// Layer 1 of offline caching: persist the read-query cache to localStorage so
// previously loaded lists reappear instantly on relaunch, then revalidate when
// back online. maxAge caps how long stale data is treated as restorable (24h),
// so a rep does not mistake day-old leads for live. Only successful read
// queries are dehydrated (mutations are never persisted), so SMS send and
// lead/stage updates always re-run against the network.
const persister = createSyncStoragePersister({
  storage: window.localStorage,
  // Shared constant so clearAllCaches() provably wipes the same key.
  key: PERSIST_CACHE_KEY,
});

const TWENTY_FOUR_HOURS = 1000 * 60 * 60 * 24;

(function applyInitialTheme() {
  try {
    const stored = window.localStorage.getItem("theme");
    const pref = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
    const prefersDark =
      pref === "dark" ||
      (pref === "system" &&
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    const resolved = prefersDark ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", resolved);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", resolved === "dark" ? "#0b1220" : "#f8fafc");
  } catch {
    document.documentElement.setAttribute("data-theme", "light");
  }
})();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: TWENTY_FOUR_HOURS,
          dehydrateOptions: {
            // Only persist successful read queries. Errored/pending queries are
            // not worth restoring, and mutations are excluded by default.
            shouldDehydrateQuery: (query) => query.state.status === "success",
          },
        }}
      >
        <App />
      </PersistQueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
);
