import React from "react";
import { resetAndReload } from "../lib/appRecovery";

// The last thing standing when the app cannot render.
//
// Wrapped around everything in main.tsx, outside the providers, so a throw while
// a context is setting up is caught too. That placement is the whole point: an
// error boundary inside the tree it is meant to rescue is no boundary at all.
//
// The fallback is not an apology, it is the fix. Everything below is the same
// sequence we have twice pasted into somebody's console by hand: drop the
// worker, drop the caches, drop the persisted query snapshot, go back to the
// top. One button, given to whoever is actually looking at the screen.
//
// It styles itself inline and imports no CSS. A bundle broken badly enough to
// land here cannot be trusted to have loaded a stylesheet, and a recovery screen
// that renders as unstyled white text on white is not a recovery screen.

interface State {
  error: Error | null;
  resetting: boolean;
}

export default class RecoveryBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { error: null, resetting: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // No telemetry pipeline here yet, and the console is where anybody
    // debugging this will look first.
    console.error("App crashed; recovery screen shown.", error, info.componentStack);
  }

  private reset = () => {
    this.setState({ resetting: true });
    void resetAndReload();
  };

  render() {
    const { error, resetting } = this.state;
    if (!error) return this.props.children;

    return (
      <div style={S.page}>
        <div style={S.card}>
          <div style={S.kicker}>Hauck Command Center</div>
          <h1 style={S.title}>This page did not load</h1>
          <p style={S.body}>
            Almost always a version of the app left over on this device after an
            update. Resetting clears it and fetches the current one. Nothing on
            the server is touched, and you will not be signed out of anything but
            this device.
          </p>

          <button type="button" onClick={this.reset} disabled={resetting} style={S.button}>
            {resetting ? "Resetting..." : "Reset this device and reload"}
          </button>

          <details style={S.details}>
            <summary style={S.summary}>What went wrong</summary>
            <pre style={S.pre}>{error.message || String(error)}</pre>
          </details>
        </div>
      </div>
    );
  }
}

// Inline so the screen never depends on a stylesheet that may not have loaded.
// Dark, because the shell is dark and a white flash reads as a second failure.
const S: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    background: "#0b1220",
    color: "#e8edf5",
    font: '15px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  },
  card: {
    width: "100%",
    maxWidth: "440px",
    background: "#111a2b",
    border: "1px solid #1f2b40",
    borderRadius: "14px",
    padding: "28px",
  },
  kicker: {
    fontSize: "11.5px",
    fontWeight: 700,
    letterSpacing: "0.09em",
    textTransform: "uppercase",
    color: "#7c8ba3",
  },
  title: {
    margin: "10px 0 0",
    fontSize: "23px",
    lineHeight: 1.2,
    fontWeight: 650,
    letterSpacing: "-0.015em",
  },
  body: {
    margin: "12px 0 0",
    fontSize: "14px",
    color: "#a7b4c8",
  },
  button: {
    marginTop: "22px",
    width: "100%",
    padding: "12px 16px",
    borderRadius: "10px",
    border: "none",
    background: "#3b82f6",
    color: "#fff",
    fontSize: "14.5px",
    fontWeight: 600,
    cursor: "pointer",
  },
  details: {
    marginTop: "18px",
    fontSize: "12.5px",
    color: "#7c8ba3",
  },
  summary: {
    cursor: "pointer",
  },
  pre: {
    margin: "10px 0 0",
    padding: "10px 12px",
    background: "#0b1220",
    border: "1px solid #1f2b40",
    borderRadius: "8px",
    fontSize: "12px",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    color: "#c2ccdb",
  },
};
