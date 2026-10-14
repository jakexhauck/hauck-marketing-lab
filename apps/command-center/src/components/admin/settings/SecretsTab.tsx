import { useMemo, useState } from "react";
import { AlertTriangle, Check, Lock, Save } from "lucide-react";
import { useClientSecrets, useSaveClientSecrets } from "../../../hooks/useApi";
import { CLIENT_SECRET_FIELDS } from "../../../lib/clientSecrets";
import type { ClientConnectionHealth } from "../../../lib/connectionHealth";
import KeysPanel from "../secrets/KeysPanel";

// The Secrets tab of /admin/settings. Two halves, because the two kinds of
// secret genuinely behave differently and pretending otherwise would mislead:
//
//   Per client   columns on the tenants row, read every request. Save and it is
//                live immediately. Doppler cannot model these at all.
//   Agency-wide  Doppler is the source of truth and the running app reads
//                Cloudflare, so a save is only live once the deploy catches up.
//                That half is now KeysPanel, which can finish the job itself.
//
// The agency half used to be a table right here. It is a shared component now
// because Onboarding needs the same thing, and a second copy of a screen that
// writes secrets is a second copy that can drift from the first.
//
// No secret value is ever rendered. Fields show a masked tail and empty inputs;
// typing replaces, leaving blank keeps what is stored.

export function SecretsTab({ clients }: { clients: ClientConnectionHealth[] }) {
  return (
    <>
      <p className="cx-tabintro">
        Where every credential lives, and the two places you can change one. Values are never shown
        back to you: you get the last four characters, enough to tell which token is loaded.
      </p>
      <ClientSecrets clients={clients} />
      <div className="cx-secblock">
        <KeysPanel />
      </div>
    </>
  );
}

// ---------- per client ----------

function ClientSecrets({ clients }: { clients: ClientConnectionHealth[] }) {
  const [tenantId, setTenantId] = useState<string>(clients[0]?.tenantId ?? "");
  const active = tenantId || clients[0]?.tenantId || "";
  const { data, isLoading } = useClientSecrets(active, !!active);
  const save = useSaveClientSecrets(active);

  // Only what the user actually typed. An untouched secret is never sent back,
  // so it cannot be clobbered by a stale masked value.
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = Object.keys(edits).length > 0;

  const byColumn = useMemo(
    () => Object.fromEntries((data?.fields ?? []).map((f) => [f.column, f])),
    [data?.fields],
  );

  async function onSave() {
    setErrors({});
    try {
      await save.mutateAsync(edits);
      setEdits({});
    } catch (e) {
      const body = (e as { body?: { errors?: Record<string, string>; error?: string } }).body;
      setErrors(body?.errors ?? { _: body?.error ?? "Could not save." });
    }
  }

  if (!clients.length) {
    return <div className="pk-empty">No clients yet. Add one and its credentials appear here.</div>;
  }

  return (
    <section className="cx-secblock">
      <div className="cx-sechead">
        <div>
          <h3 className="cx-sech3">Per client</h3>
          <p className="cx-sechint">
            Read straight from the client&apos;s row on every request, so a save is live
            immediately. No deploy, no Doppler.
          </p>
        </div>
        <select
          className="cx-select"
          value={active}
          onChange={(e) => {
            setTenantId(e.target.value);
            setEdits({});
            setErrors({});
          }}
        >
          {clients.map((c) => (
            <option key={c.tenantId} value={c.tenantId}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="pk-empty">Loading.</div>
      ) : (
        <div className="cx-fields">
          {CLIENT_SECRET_FIELDS.map((f) => {
            const current = byColumn[f.column];
            const err = errors[f.column];
            return (
              <div key={f.column} className={`cx-field ${err ? "cx-field-bad" : ""}`}>
                <div className="cx-fieldtop">
                  <label htmlFor={`f-${f.column}`}>{f.label}</label>
                  {f.kind === "secret" && (
                    <span className="cx-lock" title="Never shown back to you">
                      <Lock size={11} aria-hidden /> secret
                    </span>
                  )}
                  {current?.configured ? (
                    <span className="cx-cur">{current.display}</span>
                  ) : (
                    <span className="cx-cur cx-cur-empty">not set</span>
                  )}
                </div>
                <input
                  id={`f-${f.column}`}
                  className="cx-input"
                  type={f.kind === "secret" ? "password" : "text"}
                  autoComplete="off"
                  placeholder={
                    current?.configured ? "Leave blank to keep the current value" : f.placeholder
                  }
                  value={edits[f.column] ?? ""}
                  onChange={(e) => setEdits({ ...edits, [f.column]: e.target.value })}
                />
                <p className="cx-help">{err ?? f.help}</p>
              </div>
            );
          })}
        </div>
      )}

      {errors._ && (
        <div className="cx-note cx-note-bad">
          <AlertTriangle size={16} aria-hidden />
          <span>{errors._}</span>
        </div>
      )}

      <div className="cx-actions">
        <button
          type="button"
          className="cx-save"
          disabled={!dirty || save.isPending}
          onClick={() => void onSave()}
        >
          <Save size={14} aria-hidden />
          {save.isPending ? "Saving" : "Save changes"}
        </button>
        {save.isSuccess && !dirty && (
          <span className="cx-saved">
            <Check size={14} aria-hidden /> Saved and live
          </span>
        )}
        {dirty && <span className="cx-hint">Only the fields you typed in will be sent.</span>}
      </div>
    </section>
  );
}
