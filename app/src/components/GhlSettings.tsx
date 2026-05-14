import { useEffect, useRef, useState } from "react";
import { api } from "../lib/tauri";

type LoadState = "loading" | "ready";

type Draft = {
  token: string;
  location: string;
};

const EMPTY_DRAFT: Draft = { token: "", location: "" };

function mask(value: string): string {
  if (!value) return "";
  const tail = value.slice(-4);
  return `••••••••${tail}`;
}

export function GhlSettings() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [configured, setConfigured] = useState(false);
  const [storedLocation, setStoredLocation] = useState<string>("");
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealToken, setRevealToken] = useState(false);
  const [testResult, setTestResult] = useState<
    | { kind: "idle" }
    | { kind: "testing" }
    | { kind: "ok"; count: number }
    | { kind: "err"; message: string }
  >({ kind: "idle" });
  const tokenRef = useRef<HTMLInputElement | null>(null);

  const load = async () => {
    setError(null);
    try {
      const status = await api.ghlGetConfigStatus();
      setConfigured(status.configured);
      setStoredLocation(status.locationId ?? "");
      setDraft(EMPTY_DRAFT);
      setEditing(!status.configured);
      setRevealToken(false);
      setTestResult({ kind: "idle" });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadState("ready");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const isDirty =
    editing &&
    draft.token.trim().length > 0 &&
    draft.location.trim().length > 0;

  const handleSave = async () => {
    if (!isDirty) return;
    setBusy(true);
    setError(null);
    setTestResult({ kind: "idle" });
    try {
      await api.ghlSetCredentials(draft.token.trim(), draft.location.trim());
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = () => {
    setDraft(EMPTY_DRAFT);
    setEditing(false);
    setError(null);
    setRevealToken(false);
  };

  const handleTest = async () => {
    setTestResult({ kind: "testing" });
    setError(null);
    try {
      const pipelines = await api.ghlListPipelines();
      setTestResult({ kind: "ok", count: pipelines.length });
    } catch (e) {
      setTestResult({ kind: "err", message: String(e) });
    }
  };

  const handleRotate = () => {
    setEditing(true);
    setDraft(EMPTY_DRAFT);
    setRevealToken(true);
    requestAnimationFrame(() => tokenRef.current?.focus());
  };

  const handleDisconnect = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.ghlClearCredentials();
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="hml-panel set-panel">
      <style>{ghlCSS}</style>
      <div className="hml-panel-header">
        <div className="hml-panel-title">
          <span
            className="hml-dot"
            style={{ background: "var(--hml-orange, #ff9f43)" }}
          />
          GoHighLevel
        </div>
        <span className="hml-panel-action">
          {configured ? "Connected" : "Not connected"}
        </span>
      </div>
      <div className="hml-panel-body set-body">
        <div className="ghl-trust">
          <span className="ghl-trust-eye">STORED LOCALLY · PER MACHINE</span>
          <code className="set-code">app config / ghl_config.json</code>
          <span className="ghl-trust-warn">
            Token never crosses into the renderer; only command results do.
          </span>
        </div>

        {loadState === "loading" && (
          <div className="ghl-loading">Loading…</div>
        )}

        {error && <div className="hml-error-banner">{error}</div>}

        {loadState === "ready" && editing && (
          <div className="ghl-fields">
            <div className="ghl-field">
              <label className="hml-form-label">Private Integration Token</label>
              <div className="ghl-field-row">
                <input
                  ref={tokenRef}
                  className="hml-form-input ghl-input"
                  type={revealToken ? "text" : "password"}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="pit-…"
                  value={draft.token}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, token: e.target.value }))
                  }
                  disabled={busy}
                />
                <button
                  type="button"
                  className="hml-btn hml-ghost ghl-mini"
                  onClick={() => setRevealToken((v) => !v)}
                  disabled={busy}
                >
                  {revealToken ? "Hide" : "Reveal"}
                </button>
              </div>
              <div className="hml-form-help">
                GHL → Settings → Private Integrations → New. Grant{" "}
                <code>opportunities.readonly</code>,{" "}
                <code>opportunities.write</code>, <code>contacts.readonly</code>
                , <code>contacts.write</code>.
              </div>
            </div>

            <div className="ghl-field">
              <label className="hml-form-label">Location ID</label>
              <input
                className="hml-form-input ghl-input"
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder="e.g. ve9EPM428h8vShlRW1KT"
                value={draft.location}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, location: e.target.value }))
                }
                disabled={busy}
              />
              <div className="hml-form-help">
                Sub-account ID from the GHL URL (
                <code>app.gohighlevel.com/v2/location/&lt;id&gt;/…</code>).
              </div>
            </div>
          </div>
        )}

        {loadState === "ready" && !editing && configured && (
          <dl className="ghl-meta">
            <div className="ghl-meta-row">
              <dt>Token</dt>
              <dd>
                <code className="ghl-display">{mask("set")}</code>
                <span className="ghl-meta-note">
                  not displayed for safety
                </span>
              </dd>
            </div>
            <div className="ghl-meta-row">
              <dt>Location</dt>
              <dd>
                <code className="ghl-display">{storedLocation || "—"}</code>
              </dd>
            </div>
          </dl>
        )}

        {loadState === "ready" && configured && testResult.kind !== "idle" && (
          <div
            className={`ghl-test-status ghl-test-${testResult.kind}`}
            role="status"
          >
            {testResult.kind === "testing" && "Testing connection…"}
            {testResult.kind === "ok" &&
              `OK · ${testResult.count} pipeline${testResult.count === 1 ? "" : "s"} reachable in this location`}
            {testResult.kind === "err" && (
              <>Test failed · {testResult.message}</>
            )}
          </div>
        )}

        <div className="ghl-actions">
          {editing ? (
            <>
              <button
                type="button"
                className="hml-btn hml-accent"
                onClick={handleSave}
                disabled={busy || !isDirty}
              >
                {busy ? "Saving…" : "Save credentials"}
              </button>
              {configured && (
                <button
                  type="button"
                  className="hml-btn hml-ghost"
                  onClick={handleCancel}
                  disabled={busy}
                >
                  Cancel
                </button>
              )}
            </>
          ) : configured ? (
            <>
              <button
                type="button"
                className="hml-btn"
                onClick={handleTest}
                disabled={busy || testResult.kind === "testing"}
              >
                {testResult.kind === "testing"
                  ? "Testing…"
                  : "Test connection"}
              </button>
              <button
                type="button"
                className="hml-btn"
                onClick={handleRotate}
                disabled={busy}
              >
                Rotate token
              </button>
              <button
                type="button"
                className="hml-btn hml-danger"
                onClick={handleDisconnect}
                disabled={busy}
                title="Delete ghl_config.json from app config dir"
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              type="button"
              className="hml-btn"
              onClick={() => setEditing(true)}
              disabled={busy}
            >
              Connect GoHighLevel
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

const ghlCSS = `
.ghl-trust {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 9px 11px;
  margin-bottom: 14px;
  background: var(--hml-amber-bg);
  border: 1px solid var(--hml-amber-border);
  border-radius: 7px;
  font-size: 11.5px;
  color: var(--hml-text-secondary);
}

.ghl-trust-eye {
  font-family: var(--hml-font-mono);
  font-size: 9.5px;
  letter-spacing: 0.10em;
  color: var(--hml-amber);
  text-transform: uppercase;
  font-weight: 600;
}

.ghl-trust-warn {
  font-family: var(--hml-font-mono);
  font-size: 10px;
  color: var(--hml-text-tertiary);
  letter-spacing: 0.04em;
  margin-left: auto;
}

.ghl-loading {
  font-size: 12.5px;
  color: var(--hml-text-tertiary);
  padding: 4px 0 8px;
}

.ghl-fields {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ghl-field-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.ghl-input { flex: 1; min-width: 240px; }

.ghl-mini {
  font-size: 11.5px;
  padding: 6px 9px;
}

.ghl-meta {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ghl-meta-row {
  display: grid;
  grid-template-columns: 90px 1fr;
  align-items: center;
  gap: 14px;
}

.ghl-meta-row dt {
  font-family: var(--hml-font-mono);
  font-size: 10.5px;
  color: var(--hml-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.ghl-meta-row dd {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.ghl-display {
  font-family: var(--hml-font-mono);
  font-size: 12px;
  color: var(--hml-text-secondary);
  background: var(--hml-bg-elev-2);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 6px;
  padding: 6px 10px;
}

.ghl-meta-note {
  font-size: 11.5px;
  color: var(--hml-text-quaternary);
}

.ghl-test-status {
  margin-top: 14px;
  padding: 8px 11px;
  border-radius: 7px;
  font-size: 12.5px;
  font-family: var(--hml-font-mono);
  letter-spacing: 0.02em;
}

.ghl-test-testing {
  background: var(--hml-bg-elev-2);
  border: 1px solid var(--hml-border-subtle);
  color: var(--hml-text-tertiary);
}

.ghl-test-ok {
  background: rgba(95, 230, 153, 0.08);
  border: 1px solid rgba(95, 230, 153, 0.35);
  color: #5fe699;
}

.ghl-test-err {
  background: var(--hml-red-bg);
  border: 1px solid var(--hml-red-border);
  color: var(--hml-red);
  word-break: break-word;
}

.ghl-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--hml-border-subtle);
}
`;
