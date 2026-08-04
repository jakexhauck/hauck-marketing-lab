import { useEffect, useState } from "react";
import { Check, KeyRound, RefreshCw } from "lucide-react";
import { Button } from "../../ui/Button";
import {
  useAdminOnboardingReadinessQuery,
  useClientSecrets,
  useSaveClientSecrets,
} from "../../../hooks/useApi";
import { CLIENT_SECRET_FIELDS } from "../../../lib/clientSecrets";

// Wiring: the credentials that make a client's integrations real.
//
// These are columns on the client's row, not Doppler secrets. Doppler holds one
// config per environment and its values are bound at deploy, so it cannot model
// "this client's token"; the client row can, is read on every request, and is
// therefore live the moment this saves. See functions/api/admin/secrets/client.
//
// Nothing typed here comes back: a saved secret is returned masked to its last
// four characters, and an untouched field is never round-tripped through the
// browser at all. Only the fields actually edited are sent.
//
// Saving then re-runs the live checks against GoHighLevel, so "did that token
// work" is answered here rather than found out later by a client whose calendar
// never fires.

// GA4 and the Google place id are deliberately not offered. Jake does not do
// analytics or reviews work, so a form asking for them would be three fields of
// permanent emptiness suggesting something is unfinished.
const WIRING_COLUMNS = ["ghl_location_id", "ghl_token", "meta_ad_account_id"];

const FIELDS = CLIENT_SECRET_FIELDS.filter((f) => WIRING_COLUMNS.includes(f.column));

export default function WiringCard({ tenantId }: { tenantId: string }) {
  const secrets = useClientSecrets(tenantId);
  const save = useSaveClientSecrets(tenantId);
  const readiness = useAdminOnboardingReadinessQuery(tenantId);

  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Switching client throws away anything half-typed rather than carrying it
  // onto the next client's form.
  useEffect(() => {
    setDraft({});
    setSavedAt(null);
  }, [tenantId]);

  useEffect(() => {
    if (savedAt === null) return;
    const t = setTimeout(() => setSavedAt(null), 4000);
    return () => clearTimeout(t);
  }, [savedAt]);

  // The API answers with one view per field: the value masked if it is a secret,
  // shown in full if it is only an id, and whether anything is set at all.
  const views = new Map((secrets.data?.fields ?? []).map((f) => [f.column, f]));
  const dirty = Object.keys(draft).length > 0;

  const submit = () => {
    if (!dirty) return;
    save.mutate(draft, {
      onSuccess: () => {
        setDraft({});
        setSavedAt(Date.now());
        // Ask GoHighLevel straight away whether what was just pasted works.
        void readiness.refetch();
      },
    });
  };

  return (
    <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-[var(--shadow-sm)] sm:p-6">
      <header className="mb-4 flex items-start gap-3">
        <span
          className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius)] bg-brand-tint text-brand-text"
          aria-hidden
        >
          <KeyRound size={16} />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-[16.5px] font-semibold text-text">Wiring</h2>
        </div>
      </header>

      {secrets.isLoading ? (
        <p className="text-[13px] text-muted">Loading...</p>
      ) : (
        // Two across on a wide screen: these are short credential fields, and a
        // full-width input for a location id is mostly empty box.
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {FIELDS.map((field) => {
            const current = views.get(field.column);
            const isSet = Boolean(current?.configured);
            const value = draft[field.column];
            return (
              <div key={field.column}>
                <label htmlFor={`w-${field.column}`} className="label-cap block">
                  {field.label}
                  {isSet && (
                    <span className="ml-2 inline-flex items-center gap-1 text-[10.5px] font-semibold text-positive">
                      <Check size={11} aria-hidden />
                      SET
                    </span>
                  )}
                </label>
                <input
                  id={`w-${field.column}`}
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={value ?? ""}
                  placeholder={isSet ? (current?.display ?? "Saved") : field.placeholder}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, [field.column]: e.target.value }))
                  }
                  className="mt-1 w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-2.5 font-mono text-[13px] text-text placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
                />
                <p className="mt-1 text-[12px] leading-snug text-faint">{field.help}</p>
              </div>
            );
          })}

          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4 lg:col-span-2">
            <Button variant="primary" disabled={!dirty} loading={save.isPending} onClick={submit}>
              Save wiring
            </Button>
            {readiness.isFetching && (
              <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted">
                <RefreshCw size={13} className="animate-spin" aria-hidden />
                Checking against GoHighLevel...
              </span>
            )}
            {savedAt !== null && !readiness.isFetching && (
              <span className="text-[12.5px] font-semibold text-positive">
                Saved and re-checked.
              </span>
            )}
            {save.isError && (
              <span className="text-[12.5px] font-medium text-danger">
                {(save.error as Error)?.message ?? "That did not save."}
              </span>
            )}
          </div>

          {/* What GoHighLevel says right now. The whole point of saving here is
              to find out immediately, rather than from a client whose calendar
              never fired. */}
          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            {(readiness.data?.checks ?? []).map((check) => (
              <span key={check.key} className="inline-flex items-center gap-1.5 text-[12.5px]">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${check.ok ? "bg-positive" : "bg-danger"}`}
                  aria-hidden
                />
                <span className={check.ok ? "text-muted" : "text-text"}>{check.detail}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
