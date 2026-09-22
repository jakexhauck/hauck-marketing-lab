import { KeyRound } from "lucide-react";
import AdAccountPicker from "../AdAccountPicker";
import {
  useAdminOnboardingReadinessQuery,
  useClientSecrets,
} from "../../../hooks/useApi";

// Wiring: the credentials that make a client's integrations real.
//
// These are columns on the client's row, not Doppler secrets. Doppler holds one
// config per environment and its values are bound at deploy, so it cannot model
// "this client's token"; the client row can, is read on every request, and is
// therefore live the moment this saves. See functions/api/admin/secrets/client.
//
// The GoHighLevel pair used to be typed in here. It moved to the Sub-account
// card: the location id is now picked off the agency's own list and the key is
// minted by the Marketplace app, so there is nothing left to paste and no way
// to paste the wrong client's location id.
//
// GA4 and the Google place id are deliberately not offered. Jake does not do
// analytics or reviews work, so a form asking for them would be three fields of
// permanent emptiness suggesting something is unfinished.
//
// The Meta ad account is not a text box for the opposite reason: it is the one
// credential nobody should have to look up. It gets the picker instead.

export default function WiringCard({ tenantId }: { tenantId: string }) {
  const secrets = useClientSecrets(tenantId);
  const readiness = useAdminOnboardingReadinessQuery(tenantId);

  // The API answers with one view per field: the value masked if it is a secret,
  // shown in full if it is only an id, and whether anything is set at all.
  const views = new Map((secrets.data?.fields ?? []).map((f) => [f.column, f]));

  return (
    <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-[var(--shadow-sm)] sm:p-6">
      <header className="mb-4 flex items-start gap-3">
        <span
          className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius)] bg-brand-tint text-brand-text"
          aria-hidden
        >
          <KeyRound size={16} />
        </span>
        <h2 className="font-display text-[16.5px] font-semibold text-text">Wiring</h2>
      </header>

      {secrets.isLoading ? (
        <p className="text-[13px] text-muted">Loading...</p>
      ) : (
        <div className="flex flex-col gap-4">
          {/* The ads manager. A pick, not a paste: the agency token already
              knows which accounts exist, so linking a new client is choosing
              their name off a list, and the ads are pulled in on the spot. */}
          <div>
            <p className="label-cap block">Meta ad account</p>
            <AdAccountPicker
              tenantId={tenantId}
              currentAccountId={views.get("meta_ad_account_id")?.display ?? null}
              onLinked={async () => {
                await secrets.refetch();
                await readiness.refetch();
              }}
            />
          </div>

          {/* What GoHighLevel says right now, rather than what was saved. */}
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 border-t border-border pt-4">
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
