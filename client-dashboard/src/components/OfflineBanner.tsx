import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getSnapshot() {
  return navigator.onLine;
}

/**
 * App-wide offline indicator (Layer 3 of offline caching). While the device is
 * offline we show a thin fixed banner so a rep knows the lists they are reading
 * came from cache, not from live data. It hides itself the moment connectivity
 * returns and the cached lists revalidate.
 */
export default function OfflineBanner() {
  // Server snapshot returns true so SSR/first paint never flashes the banner.
  const online = useSyncExternalStore(subscribe, getSnapshot, () => true);

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        textAlign: "center",
        fontSize: "0.75rem",
        fontWeight: 600,
        letterSpacing: "0.01em",
        padding: "4px 8px",
        paddingTop: "calc(4px + env(safe-area-inset-top))",
        background: "#b45309",
        color: "#fff",
      }}
    >
      Offline. Showing last saved data.
    </div>
  );
}
