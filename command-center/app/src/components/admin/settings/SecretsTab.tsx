import { useMemo, useState } from "react";
import { AlertTriangle, Check, Lock, Save, ShieldOff, Copy } from "lucide-react";
import {
  useAgencySecrets,
  useSaveAgencySecret,
  useClientSecrets,
  useSaveClientSecrets,
} from "../../../hooks/useApi";
import { CLIENT_SECRET_FIELDS } from "../../../lib/clientSecrets";
import { agencyAttention, type AgencySecretRow } from "../../../lib/secretsApi";
import type { ClientConnectionHealth } from "../../../lib/connectionHealth";

// The Secrets tab of /admin/settings. Two halves, because the two kinds of
// secret genuinely behave differently and pretending otherwise would mislead:
//
//   Per client   columns on the tenants row, read every request. Save and it is
//                live immediately. Doppler cannot model these at all.
//   Agency-wide  Doppler is the source of truth, but the running app reads
//                Cloudflare env, which only changes on a deploy. So an edit here
//                writes to Doppler and the row goes into drift until redeployed.
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
      <AgencySecrets />
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

// ---------- agency-wide ----------

function AgencySecrets() {
  const { data, isLoading } = useAgencySecrets();
  const save = useSaveAgencySecret();
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const rows = data?.rows ?? [];
  const drifted = rows.filter((r) => r.drift === true);
  const attention = agencyAttention(rows);

  async function onSave(name: string) {
    setError(null);
    try {
      await save.mutateAsync({ name, value });
      setEditing(null);
      setValue("");
    } catch (e) {
      const body = (e as { body?: { error?: string } }).body;
      setError(body?.error ?? "Could not save.");
    }
  }

  return (
    <section className="cx-secblock">
      <div className="cx-sechead">
        <div>
          <h3 className="cx-sech3">Agency-wide</h3>
          <p className="cx-sechint">
            {data ? (
              <>
                Doppler <code>{data.project}</code> / <code>{data.config}</code> is the source of
                truth. The running app reads Cloudflare, which only changes on a deploy.
              </>
            ) : (
              "Doppler is the source of truth for these."
            )}
          </p>
        </div>
        {data && !data.canEdit && (
          <span className="cx-readonly">
            <ShieldOff size={13} aria-hidden /> read only
          </span>
        )}
      </div>

      {data && !data.canRead && (
        <div className="cx-note cx-note-warn">
          <AlertTriangle size={16} aria-hidden />
          <span>
            No Doppler token set, so this only shows what the running app has. Add{" "}
            <code>DOPPLER_TOKEN</code> to sync the real values in.
          </span>
        </div>
      )}

      {data?.readError && (
        <div className="cx-note cx-note-bad">
          <AlertTriangle size={16} aria-hidden />
          <span>Could not reach Doppler: {data.readError}</span>
        </div>
      )}

      {drifted.length > 0 && (
        <div className="cx-note cx-note-bad">
          <AlertTriangle size={16} aria-hidden />
          <div>
            <strong>
              {drifted.length} secret{drifted.length === 1 ? "" : "s"} changed in Doppler but not in
              the running app.
            </strong>
            <div className="cx-driftfix">
              Rebind and redeploy to close the gap:
              <code>node scripts/cf-rebind.mjs --from-doppler</code>
              <button
                type="button"
                className="cx-copy"
                onClick={() =>
                  void navigator.clipboard.writeText("node scripts/cf-rebind.mjs --from-doppler")
                }
              >
                <Copy size={12} aria-hidden /> copy
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="cx-note cx-note-bad">
          <AlertTriangle size={16} aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {isLoading ? (
        <div className="pk-empty">Reading Doppler.</div>
      ) : (
        <table className="cx-table">
          <thead>
            <tr>
              <th>Key</th>
              <th>Doppler</th>
              <th>Running app</th>
              <th>Used by</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <AgencyRow
                key={r.name}
                row={r}
                canEdit={!!data?.canEdit}
                editing={editing === r.name}
                value={value}
                pending={save.isPending}
                onStart={() => {
                  setEditing(r.name);
                  setValue("");
                  setError(null);
                }}
                onCancel={() => setEditing(null)}
                onChange={setValue}
                onSave={() => void onSave(r.name)}
              />
            ))}
          </tbody>
        </table>
      )}

      {attention > 0 && (
        <p className="cx-footnote">
          {attention} key{attention === 1 ? "" : "s"} need attention: drifted, or missing from both
          places.
        </p>
      )}

      {data && data.unclaimed.length > 0 && (
        <p className="cx-footnote">
          Doppler also holds {data.unclaimed.length} key
          {data.unclaimed.length === 1 ? "" : "s"} nothing in this app reads:{" "}
          <code>{data.unclaimed.join(", ")}</code>. Either dead weight from a retired feature, or
          something the code forgot to wire up.
        </p>
      )}
    </section>
  );
}

function AgencyRow({
  row,
  canEdit,
  editing,
  value,
  pending,
  onStart,
  onCancel,
  onChange,
  onSave,
}: {
  row: AgencySecretRow;
  canEdit: boolean;
  editing: boolean;
  value: string;
  pending: boolean;
  onStart: () => void;
  onCancel: () => void;
  onChange: (v: string) => void;
  onSave: () => void;
}) {
  const missing = !row.optional && !row.inDoppler && !row.inRuntime;
  return (
    <tr className={row.drift === true || missing ? "cx-tr-attention" : ""}>
      <td>
        <code>{row.name}</code>
        {row.optional && <span className="cx-opt">optional</span>}
      </td>
      <td>
        {row.inDoppler ? (
          <span className="cx-mask">{row.masked}</span>
        ) : (
          <span className="cx-cur-empty">absent</span>
        )}
      </td>
      <td>
        {!row.inRuntime ? (
          <span className="cx-cur-empty">absent</span>
        ) : row.drift === true ? (
          <span className="cx-driftpill">different value</span>
        ) : row.drift === false ? (
          <span className="cx-matchpill">matches</span>
        ) : (
          // drift === null: there is nothing in Doppler to compare against, so
          // saying "matches" would be a claim we cannot support. Neutral on
          // purpose, because an unverifiable state is not a passing one.
          <span className="cx-presentpill" title="Present, but there is no Doppler value to compare it against">
            present
          </span>
        )}
      </td>
      <td className="cx-usedby">{row.usedBy.join(", ") || "nothing"}</td>
      <td className="cx-rowact">
        {editing ? (
          <div className="cx-editrow">
            <input
              className="cx-input"
              type="password"
              autoComplete="off"
              autoFocus
              placeholder="Paste the new value"
              value={value}
              onChange={(e) => onChange(e.target.value)}
            />
            <button type="button" className="cx-save" disabled={pending} onClick={onSave}>
              {pending ? "Saving" : "Save"}
            </button>
            <button type="button" className="cx-cancel" onClick={onCancel}>
              Cancel
            </button>
          </div>
        ) : canEdit ? (
          <button type="button" className="cx-edit" onClick={onStart}>
            Edit
          </button>
        ) : null}
      </td>
    </tr>
  );
}
