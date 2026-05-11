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
    // refocus the input on the next tick so the user can paste a new value
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
    <div className="settings-section">
      <div className="settings-section-head">
        <div className="settings-section-eye">CLIENT CREDENTIALS</div>
        <div className="settings-section-title">
          Meta credentials · <span className="cred-client-name">{clientName}</span>
        </div>
      </div>
      <div className="settings-section-body">
        <p className="cred-trust-note">
          <span className="cred-trust-eye">STORED LOCALLY</span>
          <code>data/{clientSlug}/credentials.yaml</code>
          <span className="cred-trust-warn">
            NOT ENCRYPTED. Anyone with access to this folder can read the token.
          </span>
        </p>

        {error && <div className="clients-page-err">{error}</div>}

        <div className="cred-fields">
          {FIELDS.map((f) => {
            const loadedVal = loaded[f.key];
            const draftVal = draft[f.key];
            const hasStored = loadedVal.trim().length > 0;
            const isRevealed = revealed[f.key];
            const showAsInput = editing;
            return (
              <div key={f.key} className="cred-field">
                <label className="cred-field-label">{f.label}</label>
                {showAsInput ? (
                  <div className="cred-field-row">
                    <input
                      ref={(el) => {
                        inputRefs.current[f.key] = el;
                      }}
                      className="kpi-form-input cred-input"
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
                        className="kpi-form-btn cred-mini"
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
                        : "— not set —"}
                    </code>
                    {hasStored && f.sensitive && (
                      <button
                        type="button"
                        className="kpi-form-btn cred-mini"
                        onClick={() => toggleReveal(f.key)}
                      >
                        {isRevealed ? "Hide" : "Reveal"}
                      </button>
                    )}
                    {hasStored && (
                      <button
                        type="button"
                        className="kpi-form-btn cred-mini rotate"
                        onClick={() => handleRotate(f.key)}
                        title="Clear this field and paste a new value"
                      >
                        Rotate
                      </button>
                    )}
                  </div>
                )}
                {f.hint && !editing && !hasStored && (
                  <div className="cred-field-hint">{f.hint}</div>
                )}
              </div>
            );
          })}
        </div>

        <div className="cred-actions">
          {editing ? (
            <>
              <button
                className="kpi-form-btn primary"
                onClick={handleSave}
                disabled={busy || !isDirty}
              >
                {busy ? "Saving…" : "Save credentials"}
              </button>
              <button
                className="kpi-form-btn"
                onClick={handleCancel}
                disabled={busy}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                className="kpi-form-btn"
                onClick={() => setEditing(true)}
                disabled={busy}
              >
                {anyStored ? "Edit credentials" : "Enter credentials"}
              </button>
              {anyStored && (
                <button
                  className="kpi-form-btn danger"
                  onClick={handleClearAll}
                  disabled={busy}
                  title="Delete data/<slug>/credentials.yaml"
                >
                  Clear all
                </button>
              )}
            </>
          )}
          {updatedAt && (
            <span className="cred-updated">
              Last saved <code>{updatedAt}</code>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
