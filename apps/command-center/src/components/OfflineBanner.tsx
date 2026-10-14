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

  // The element stays mounted and animates its height + opacity so going
  // offline fades the banner in and coming back online collapses it smoothly,
  // rather than snapping the layout. aria-hidden while online keeps it out of
  // the a11y tree until it actually has something to say.
  return (
    <div
      role="status"
      aria-live="polite"
      aria-hidden={online}
      style={{
        flexShrink: 0,
        overflow: "hidden",
        maxHeight: online ? 0 : "60px",
        opacity: online ? 0 : 1,
        transition: "max-height 260ms ease, opacity 260ms ease",
        textAlign: "center",
        fontSize: "0.75rem",
        fontWeight: 600,
        letterSpacing: "0.01em",
        padding: online ? "0 8px" : "4px 8px",
        paddingTop: online ? 0 : "calc(4px + env(safe-area-inset-top))",
        background: "#b45309",
        color: "#fff",
      }}
    >
      Offline. Showing last saved data.
    </div>
  );
}
