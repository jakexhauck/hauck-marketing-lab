import { FlaskConical, X } from "lucide-react";
import { clearDemoMode, demoMode } from "../demo/demoMode";

/**
 * App-wide banner shown only in a demo client-view tab (opened from the admin
 * Build Lab with `?demo=1`). Makes it unmistakable that the data is fabricated,
 * so a demo is never confused with a real client. Exit clears the per-tab demo
 * flag and closes the tab (it was script-opened); if the browser blocks close,
 * it falls back to navigating back to the Build Lab.
 */
export default function DemoBanner() {
  if (!demoMode()) return null;

  const onExit = () => {
    clearDemoMode();
    window.close();
    // window.close() is a no-op for tabs the script did not open; fall back.
    // The old /admin/build target is a retired route and dead-ended here.
    window.location.href = "/admin";
  };

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "12px",
        fontSize: "0.78rem",
        fontWeight: 600,
        letterSpacing: "0.01em",
        padding: "6px 12px",
        paddingTop: "calc(6px + env(safe-area-inset-top))",
        background: "#b45309",
        color: "#fff",
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
        <FlaskConical size={14} />
        Demo client view, fabricated data. Nothing here is real.
      </span>
      <button
        type="button"
        onClick={onExit}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "5px",
          borderRadius: "9999px",
          border: "1px solid rgba(255,255,255,0.5)",
          padding: "2px 10px",
          fontSize: "0.72rem",
          fontWeight: 700,
          color: "#fff",
          background: "rgba(255,255,255,0.12)",
          cursor: "pointer",
        }}
      >
        <X size={12} />
        Exit demo
      </button>
    </div>
  );
}
