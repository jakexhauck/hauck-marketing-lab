import { useEffect, useRef, useState } from "react";
import { api } from "../lib/tauri";
import type { ClientCredentialsFile, MetaCredentials } from "../lib/types";

type Props = {
  root: string;
  clientSlug: string;
  clientName: string;
};

type FieldKey = keyof MetaCredentials;

type Draft = {
  access_token: string;
  ad_account_id: string;
  pixel_id: string;
  business_id: string;
};

const FIELDS: Array<{
  key: FieldKey;
  label: string;
  placeholder: string;
  sensitive: boolean;
  hint?: string;
}> = [
  {
    key: "access_token",
    label: "Access token",
    placeholder: "EAAB…",
    sensitive: true,
    hint: "Meta long-lived user / system-user token.",
  },
  {
    key: "ad_account_id",
    label: "Ad account ID",
    placeholder: "act_1234567890",
    sensitive: false,
  },
  {
    key: "pixel_id",
    label: "Pixel ID",
    placeholder: "987654321012345",
    sensitive: false,
  },
  {
    key: "business_id",
    label: "Business ID",
    placeholder: "1234567890",
    sensitive: false,
  },
];

const EMPTY_DRAFT: Draft = {
  access_token: "",
  ad_account_id: "",
  pixel_id: "",
  business_id: "",
};

function mask(value: string): string {
  if (!value) return "";
  const tail = value.slice(-4);
  return `••••••••${tail}`;
}

function fromFile(file: ClientCredentialsFile): Draft {
  return {
    access_token: file.meta.access_token ?? "",
    ad_account_id: file.meta.ad_account_id ?? "",
    pixel_id: file.meta.pixel_id ?? "",
    business_id: file.meta.business_id ?? "",
  };
}

export function ClientCredentials({ root, clientSlug, clientName }: Props) {
  const [loaded, setLoaded] = useState<Draft>(EMPTY_DRAFT);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<FieldKey, boolean>>({
    access_token: false,
    ad_account_id: false,
    pixel_id: false,
    business_id: false,
  });
  const inputRefs = useRef<Record<FieldKey, HTMLInputElement | null>>({
    access_token: null,
    ad_account_id: null,
    pixel_id: null,
    business_id: null,
  });

  const load = async () => {
    setError(null);
    try {
      const file = await api.readClientCredentials(root, clientSlug);
      const next = fromFile(file);
      setLoaded(next);
      setDraft(next);
      setUpdatedAt(file.updated_at ?? null);
      setEditing(false);
      setRevealed({
        access_token: false,
        ad_account_id: false,
        pixel_id: false,
        business_id: false,
      });
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, clientSlug]);

  const anyStored = Object.values(loaded).some((v) => v.trim().length > 0);
  const isDirty =
    editing &&
    (draft.access_token !== loaded.access_token ||
      draft.ad_account_id !== loaded.ad_account_id ||
      draft.pixel_id !== loaded.pixel_id ||
      draft.business_id !== loaded.business_id);

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload: ClientCredentialsFile = {
        client: clientSlug,
        meta: {
          access_token: draft.access_token.trim() || null,
          ad_account_id: draft.ad_account_id.trim() || null,
          pixel_id: draft.pixel_id.trim() || null,
          business_id: draft.business_id.trim() || null,
        },
        updated_at: null,
      };
      await api.writeClientCredentials(root, clientSlug, payload);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = () => {
    setDraft(loaded);
    setEditing(false);
    setError(null);
  };

  const handleRotate = (key: FieldKey) => {
    if (!editing) setEditing(true);
    setDraft((d) => ({ ...d, [key]: "" }));
    setRevealed((r) => ({ ...r, [key]: true }));
    requestAnimationFrame(() => {
      inputRefs.current[key]?.focus();
    });
  };

  const toggleReveal = (key: FieldKey) => {
    setRevealed((r) => ({ ...r, [key]: !r[key] }));
  };

  const handleClearAll = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.clearClientCredentials(root, clientSlug);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="hml-panel set-panel">
      <style>{credCSS}</style>
      <div className="hml-panel-header">
        <div className="hml-panel-title">
          <span className="hml-dot" style={{ background: "var(--hml-green)" }} />
          Meta credentials · <span className="cred-client">{clientName}</span>
        </div>
        {updatedAt && (
          <span className="hml-panel-action">
            Saved {updatedAt}
          </span>
        )}
      </div>
      <div className="hml-panel-body set-body">
        <div className="cred-trust">
          <span className="cred-trust-eye">STORED LOCALLY</span>
          <code className="set-code">data/{clientSlug}/credentials.yaml</code>
          <span className="cred-trust-warn">
            NOT ENCRYPTED. Anyone with access to this folder can read the token.
          </span>
        </div>

        {error && <div className="hml-error-banner">{error}</div>}

        <div className="cred-fields">
          {FIELDS.map((f) => {
            const loadedVal = loaded[f.key];
            const draftVal = draft[f.key];
            const hasStored = loadedVal.trim().length > 0;
            const isRevealed = revealed[f.key];
            const showAsInput = editing;
            return (
              <div key={f.key} className="cred-field">
                <label className="hml-form-label">{f.label}</label>
                {showAsInput ? (
                  <div className="cred-field-row">
                    <input
                      ref={(el) => {
                        inputRefs.current[f.key] = el;
                      }}
                      className="hml-form-input cred-input"
                      type={f.sensitive && !isRevealed ? "password" : "text"}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder={f.placeholder}
                      value={draftVal}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, [f.key]: e.target.value }))
                      }
                      disabled={busy}
                    />
                    {f.sensitive && (
                      <button
                        type="button"
                        className="hml-btn hml-ghost cred-mini"
                        onClick={() => toggleReveal(f.key)}
                        disabled={busy}
                      >
                        {isRevealed ? "Hide" : "Reveal"}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="cred-field-row">
                    <code className="cred-display">
                      {hasStored
                        ? f.sensitive && !isRevealed
                          ? mask(loadedVal)
                          : loadedVal
                        : "(not set)"}
                    </code>
                    {hasStored && f.sensitive && (
                      <button
                        type="button"
                        className="hml-btn hml-ghost cred-mini"
                        onClick={() => toggleReveal(f.key)}
                      >
                        {isRevealed ? "Hide" : "Reveal"}
                      </button>
                    )}
                    {hasStored && (
                      <button
                        type="button"
                        className="hml-btn hml-ghost cred-mini"
                        onClick={() => handleRotate(f.key)}
                        title="Clear this field and paste a new value"
                      >
                        Rotate
                      </button>
                    )}
                  </div>
                )}
                {f.hint && !editing && !hasStored && (
                  <div className="hml-form-help">{f.hint}</div>
                )}
              </div>
            );
          })}
        </div>

        <div className="cred-actions">
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
              <button
                type="button"
                className="hml-btn hml-ghost"
                onClick={handleCancel}
                disabled={busy}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="hml-btn"
                onClick={() => setEditing(true)}
                disabled={busy}
              >
                {anyStored ? "Edit credentials" : "Enter credentials"}
              </button>
              {anyStored && (
                <button
                  type="button"
                  className="hml-btn hml-danger"
                  onClick={handleClearAll}
                  disabled={busy}
                  title="Delete data/<slug>/credentials.yaml"
                >
                  Clear all
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

const credCSS = `
.cred-client {
  color: var(--hml-accent);
  font-weight: 500;
}

.cred-trust {
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

.cred-trust-eye {
  font-family: var(--hml-font-mono);
  font-size: 9.5px;
  letter-spacing: 0.10em;
  color: var(--hml-amber);
  text-transform: uppercase;
  font-weight: 600;
}

.cred-trust-warn {
  font-family: var(--hml-font-mono);
  font-size: 10px;
  color: var(--hml-red);
  letter-spacing: 0.04em;
  margin-left: auto;
}

.cred-fields {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.cred-field-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.cred-input { flex: 1; min-width: 200px; }

.cred-display {
  flex: 1;
  min-width: 200px;
  font-family: var(--hml-font-mono);
  font-size: 12px;
  color: var(--hml-text-secondary);
  background: var(--hml-bg-elev-2);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 6px;
  padding: 8px 11px;
  white-space: nowrap;
  overflow-x: auto;
}

.cred-mini {
  font-size: 11.5px;
  padding: 6px 9px;
}

.cred-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--hml-border-subtle);
}
`;
