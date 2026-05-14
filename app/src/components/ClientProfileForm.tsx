import { useEffect, useRef, useState } from "react";
import { api } from "../lib/tauri";
import type { ClientEntry } from "../lib/types";
import {
  buildProfileBody,
  buildProfileFront,
  emptyProfileFormValues,
  parseProfileBody,
  profilePathFor,
  type ProfileFormValues,
} from "../lib/clientProfile";

type Props = {
  root: string;
  client: ClientEntry;
  /** "new" = just created, "edit" = pre-load existing Profile.md */
  mode: "new" | "edit";
  onClose: () => void;
  onSaved: () => void;
};

export function ClientProfileForm({ root, client, mode, onClose, onSaved }: Props) {
  const [values, setValues] = useState<ProfileFormValues>(() => emptyProfileFormValues());
  const [loading, setLoading] = useState(mode === "edit");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  // Load existing profile when editing.
  useEffect(() => {
    let cancelled = false;
    if (mode !== "edit") {
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const notes = await api.readClientNotes(root, client.slug);
        const profileNote =
          notes.find((n) => n.front?.type === "profile") ??
          notes.find((n) => n.rel_path.replace(/\\/g, "/").endsWith("/Profile.md"));
        if (profileNote) {
          const parsed = parseProfileBody(profileNote.body);
          if (!cancelled) setValues(parsed);
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [root, client.slug, mode]);

  useEffect(() => {
    if (!loading) firstInputRef.current?.focus();
  }, [loading]);

  const update = <K extends keyof ProfileFormValues>(key: K, value: ProfileFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = buildProfileBody(client, values);
      const front = buildProfileFront(client);
      const vaultRoot = await api.vaultRootPath(root);
      const path = profilePathFor(vaultRoot, client);
      await api.writeVaultNote(root, path, front, body);
      onSaved();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="md-root hml-app">
      <main className="hml-main hml-main-standalone">
        <header className="hml-topbar">
          <div className="hml-breadcrumb">
            <span className="hml-seg">Clients</span>
            <span className="hml-sep">/</span>
            <span className="hml-seg">{client.name}</span>
            <span className="hml-sep">/</span>
            <span className="hml-current">
              {mode === "new" ? "New profile" : "Edit profile"}
            </span>
          </div>
          <div className="hml-topbar-right">
            <button
              type="button"
              className="hml-btn hml-ghost"
              onClick={onClose}
              disabled={busy}
            >
              ← Back
            </button>
          </div>
        </header>

        <div className="hml-content">
          <section className="hml-page-header">
            <div>
              <div className="hml-page-eyebrow">
                <span className="hml-eyebrow-dot" />
                {mode === "new" ? "New client — profile" : "Edit client profile"}
              </div>
              <h1 className="hml-page-title">{client.name}</h1>
              <div className="hml-page-subtitle">
                Saved to <code>vault/Clients/{client.name}/Profile.md</code>.
                Used to brief agents on every chat involving this client. All
                fields are optional — fill in what you know now and come back
                via <strong>Edit profile</strong> later.
              </div>
            </div>
          </section>

          {error && <div className="hml-error-banner">{error}</div>}

          {loading ? (
            <div className="hml-empty">
              <div className="hml-empty-title">Loading profile…</div>
            </div>
          ) : (
            <section className="hml-panel">
              <div className="hml-panel-body" style={{ padding: "18px 22px 22px" }}>
                <Field
                  label="Business name"
                  hint="From client registry — not editable here."
                >
                  <input
                    className="hml-form-input"
                    value={client.name}
                    readOnly
                    disabled
                  />
                </Field>

                <Field
                  label="What they do"
                  hint='One sentence. Becomes the "Business" section.'
                >
                  <input
                    ref={firstInputRef}
                    className="hml-form-input"
                    placeholder="e.g. Residential window cleaning company serving the north suburbs."
                    value={values.business}
                    onChange={(e) => update("business", e.target.value)}
                    disabled={busy}
                  />
                </Field>

                <Field
                  label="Services"
                  hint="One service per line. Saved as bullets."
                >
                  <textarea
                    className="hml-form-textarea"
                    rows={4}
                    placeholder={
                      "Residential window cleaning\nGutter cleaning\nScreen repair"
                    }
                    value={values.services}
                    onChange={(e) => update("services", e.target.value)}
                    disabled={busy}
                  />
                </Field>

                <Field
                  label="Target customer"
                  hint="Homeowner profile, age, income, neighborhoods, pain points."
                >
                  <textarea
                    className="hml-form-textarea"
                    rows={3}
                    placeholder="Homeowners 35–65, $120k+ HHI, neighborhoods with HOA pressure to keep curb appeal up."
                    value={values.target}
                    onChange={(e) => update("target", e.target.value)}
                    disabled={busy}
                  />
                </Field>

                <Field
                  label="Offers"
                  hint="Intro pricing, packages, seasonal promos. One per line."
                >
                  <textarea
                    className="hml-form-textarea"
                    rows={3}
                    placeholder={
                      "$99 first-time clean\nSpring bundle: windows + gutters"
                    }
                    value={values.offers}
                    onChange={(e) => update("offers", e.target.value)}
                    disabled={busy}
                  />
                </Field>

                <Field
                  label="Voice / brand notes"
                  hint="How they want to be talked about."
                >
                  <textarea
                    className="hml-form-textarea"
                    rows={3}
                    placeholder="Friendly, local, never corporate. We sound like a neighbor, not a chain."
                    value={values.voice}
                    onChange={(e) => update("voice", e.target.value)}
                    disabled={busy}
                  />
                </Field>

                <Field label="What to avoid" hint="No-gos. One item per line.">
                  <textarea
                    className="hml-form-textarea"
                    rows={3}
                    placeholder={
                      "Fake urgency claims\nDiscounts above 30%"
                    }
                    value={values.avoid}
                    onChange={(e) => update("avoid", e.target.value)}
                    disabled={busy}
                  />
                </Field>

                <Field
                  label="Geography"
                  hint="Service area, ZIP codes, radius."
                >
                  <input
                    className="hml-form-input"
                    placeholder="e.g. North suburbs of Chicago — 20 mi radius from 60062"
                    value={values.geography}
                    onChange={(e) => update("geography", e.target.value)}
                    disabled={busy}
                  />
                </Field>

                <div className="hml-form-footer">
                  <button
                    type="button"
                    className="hml-btn hml-ghost"
                    onClick={onClose}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="hml-btn hml-accent"
                    onClick={handleSave}
                    disabled={busy}
                  >
                    {busy
                      ? "Saving…"
                      : mode === "new"
                        ? "Save profile"
                        : "Save changes"}
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="hml-form-field">
      <label className="hml-form-label">{label}</label>
      {children}
      {hint && <div className="hml-form-help">{hint}</div>}
    </div>
  );
}
