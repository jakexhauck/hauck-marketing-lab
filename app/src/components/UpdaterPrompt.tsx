import { useEffect, useState } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { checkForUpdates, installAndRestart } from "../lib/updater";

type Phase = "idle" | "available" | "installing" | "error";

export function UpdaterPrompt() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [update, setUpdate] = useState<Update | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(async () => {
      const result = await checkForUpdates();
      if (result.kind === "available") {
        setUpdate(result.update);
        setPhase("available");
      }
    }, 3000);
    return () => window.clearTimeout(t);
  }, []);

  if (dismissed || phase === "idle" || !update) return null;

  const install = async () => {
    setPhase("installing");
    setError(null);
    try {
      await installAndRestart(update);
    } catch (e) {
      setError(String(e));
      setPhase("error");
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        right: 20,
        bottom: 20,
        zIndex: 9999,
        maxWidth: 360,
        background: "var(--surface)",
        border: "1px solid var(--c-border-strong)",
        borderRadius: 10,
        boxShadow: "0 10px 30px rgba(var(--shadow-rgb),0.5)",
        padding: "14px 16px",
        color: "var(--c-text)",
        fontSize: 13,
      }}
    >
      <div style={{ fontSize: 11, opacity: 0.6, letterSpacing: 1, marginBottom: 4 }}>
        UPDATE AVAILABLE
      </div>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>
        Version {update.version} is ready
      </div>
      {update.body && (
        <div
          style={{
            opacity: 0.75,
            marginBottom: 10,
            maxHeight: 80,
            overflowY: "auto",
            whiteSpace: "pre-wrap",
          }}
        >
          {update.body}
        </div>
      )}
      {phase === "error" && error && (
        <div style={{ color: "var(--danger)", marginBottom: 8 }}>{error}</div>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          className="kpi-form-btn"
          onClick={() => setDismissed(true)}
          disabled={phase === "installing"}
          style={{ opacity: 0.7 }}
        >
          Later
        </button>
        <button
          className="kpi-form-btn"
          onClick={install}
          disabled={phase === "installing"}
        >
          {phase === "installing" ? "Installing…" : "Install & restart"}
        </button>
      </div>
    </div>
  );
}
