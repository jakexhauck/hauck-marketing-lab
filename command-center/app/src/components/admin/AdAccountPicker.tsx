import { useMemo, useState } from "react";
import {
  Check,
  Loader2,
  RefreshCw,
  Search,
  TriangleAlert,
  Link2,
  Link2Off,
} from "lucide-react";
import { Button } from "../ui/Button";
import { api } from "../../lib/api";
import { useAdminMetaAdAccountsQuery } from "../../hooks/useApi";
import type { AdAccountOption } from "../../../functions/lib/metaAdAccounts";

// Link a client's ads manager by picking it, not by typing it.
//
// The agency system-user token already sees every ad account it has been
// granted, with last-30-day spend attached, so the console can just show the
// list. Finding the account number in Business Manager and pasting act_... was
// never the job; recognising "that's Willis, the one spending $743" is.
//
// One click does three things, because a link that leaves the section empty is
// only half a link:
//   1. saves the account on the tenant row (what every Paid Ads read resolves),
//   2. syncs the ad snapshot now, so the Ad Tracker has data before the nightly
//      cron rather than after it,
//   3. reports what came back, so "is it populated" is answered here.
//
// Taking an account another client holds needs a second, explicit click. That
// is the one mistake with a real victim: two clients on one account means one
// of them reads the other's spend under their own name.

interface SyncResult {
  rows?: number;
  entities?: number;
  error?: string;
  skipped?: string;
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `$${Math.round(amount)}`;
  }
}

const STATUS_NOTE: Partial<Record<AdAccountOption["status"], string>> = {
  disabled: "Disabled by Meta",
  unsettled: "Unpaid balance",
  pending: "Pending review",
  closed: "Closed",
};

export default function AdAccountPicker({
  tenantId,
  currentAccountId,
  onLinked,
}: {
  tenantId: string;
  /** What the tenant row holds today, or null when nothing is linked. */
  currentAccountId: string | null;
  /** Re-read whatever the host renders from the client row. */
  onLinked: () => void | Promise<void>;
}) {
  const accounts = useAdminMetaAdAccountsQuery(tenantId);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [manualOpen, setManualOpen] = useState(false);

  const rows = accounts.data?.accounts ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (a) => a.name.toLowerCase().includes(q) || a.accountId.includes(q.replace(/\D/g, "")),
    );
  }, [rows, query]);

  // Save the account, then immediately pull its ads in. The sync is what turns
  // "linked" into "populated"; its answer is also the honest proof that Meta
  // will talk to us about this account at all.
  const link = async (accountId: string, label: string) => {
    setBusyId(accountId || "manual");
    setError(null);
    setResult(null);
    try {
      await api(`/api/admin/clients/${tenantId}`, {
        method: "PATCH",
        body: JSON.stringify({ metaAdAccountId: accountId }),
      });
      if (!accountId) {
        setResult("Unlinked. This client's Paid Ads are empty again.");
      } else {
        const sync = await api<{ results?: SyncResult[] }>(
          `/api/admin/ads/sync?tenantId=${encodeURIComponent(tenantId)}&days=30`,
          { method: "POST" },
        ).catch((err: unknown) => {
          // A failed sync is not a failed link: the account is saved either way,
          // and the client's live Paid Ads read Meta directly. Say so plainly.
          throw new Error(
            `Linked, but pulling the ads in failed: ${
              err instanceof Error ? err.message : "unknown error"
            }`,
          );
        });
        const first = sync.results?.[0];
        if (first?.error) {
          setError(`Linked to ${label}, but Meta refused the data pull: ${first.error}`);
        } else {
          const days = first?.rows ?? 0;
          const ads = first?.entities ?? 0;
          setResult(
            days > 0
              ? `${label} is linked. Pulled ${days} day-rows across ${ads} ads into the tracker.`
              : `${label} is linked. Meta reports no spend in the last 30 days yet.`,
          );
        }
      }
      setConfirmId(null);
      setManual("");
      setManualOpen(false);
      await onLinked();
      await accounts.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save.");
    } finally {
      setBusyId(null);
    }
  };

  const onManualSave = () => {
    const digits = manual.trim().replace(/^act_/i, "").replace(/\D/g, "");
    if (!digits) {
      setError("An ad account is digits, with or without the act_ prefix.");
      return;
    }
    void link(`act_${digits}`, `act_${digits}`);
  };

  const listState = accounts.isLoading
    ? "loading"
    : accounts.error
      ? "failed"
      : !accounts.data?.configured
        ? "no-token"
        : accounts.data.error
          ? "refused"
          : rows.length === 0
            ? "empty"
            : "ready";

  return (
    <div>
      {/* The list */}
      {listState === "loading" && (
        <p className="flex items-center gap-2 py-3 text-[13px] text-muted">
          <Loader2 size={14} className="animate-spin" aria-hidden />
          Reading the ad accounts the agency token can see...
        </p>
      )}

      {(listState === "failed" || listState === "refused" || listState === "no-token") && (
        <p className="flex items-start gap-2 rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-2.5 text-[13px] text-text">
          <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden />
          <span>
            {listState === "no-token"
              ? "No agency Meta token is configured, so the account list cannot be read. Paste the id below instead."
              : `Meta would not list the accounts: ${
                  accounts.data?.error ?? (accounts.error as Error)?.message ?? "no answer"
                }`}
          </span>
        </p>
      )}

      {listState === "empty" && (
        <p className="rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-2.5 text-[13px] text-muted">
          The agency token can see no ad accounts yet. In Business Manager, give
          the agency system user access to this client's ad account, then reload.
        </p>
      )}

      {listState === "ready" && (
        <>
          {rows.length > 5 && (
            <label className="mb-3 flex items-center gap-2 rounded-[var(--radius)] border border-border bg-surface px-3 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25">
              <Search size={14} className="shrink-0 text-faint" aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search accounts"
                className="w-full bg-transparent py-2.5 text-[14px] text-text placeholder:text-faint focus:outline-none"
              />
            </label>
          )}

          <ul className="grid gap-2">
            {filtered.map((a) => {
              const busy = busyId === a.id;
              const taken = Boolean(a.linkedTenantName);
              const confirming = confirmId === a.id;
              const note = STATUS_NOTE[a.status];
              return (
                <li key={a.id}>
                  <div
                    className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius)] border px-3 py-2.5 ${
                      a.linkedToThisClient
                        ? "border-brand bg-brand-tint"
                        : "border-border bg-surface"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-text">
                        {a.name}
                        {a.linkedToThisClient && (
                          <span className="ml-2 inline-flex items-center gap-1 align-middle text-[10.5px] font-semibold text-brand-text">
                            <Check size={11} aria-hidden />
                            LINKED
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted">
                        <span className="font-mono">{a.id}</span>
                        <span aria-hidden>·</span>
                        <span>
                          {a.spend30d > 0
                            ? `${money(a.spend30d, a.currency)} last 30 days`
                            : "No spend in 30 days"}
                        </span>
                        {note && (
                          <>
                            <span aria-hidden>·</span>
                            <span className="text-warning">{note}</span>
                          </>
                        )}
                        {taken && (
                          <>
                            <span aria-hidden>·</span>
                            <span className="text-danger">
                              Already {a.linkedTenantName}&apos;s
                            </span>
                          </>
                        )}
                      </p>
                    </div>

                    {a.linkedToThisClient ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={busy}
                        onClick={() => void link("", a.name)}
                      >
                        <Link2Off size={13} aria-hidden />
                        Unlink
                      </Button>
                    ) : confirming ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] text-text">
                          Move it off {a.linkedTenantName}?
                        </span>
                        <Button
                          variant="danger"
                          size="sm"
                          loading={busy}
                          onClick={() => void link(a.id, a.name)}
                        >
                          Yes, move it
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirmId(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant={taken ? "secondary" : "primary"}
                        size="sm"
                        loading={busy}
                        onClick={() => (taken ? setConfirmId(a.id) : void link(a.id, a.name))}
                      >
                        <Link2 size={13} aria-hidden />
                        Link
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="px-1 py-2 text-[13px] text-muted">Nothing matches that.</li>
            )}
          </ul>
        </>
      )}

      {/* What just happened. The proof, not a promise. */}
      {result && (
        <p className="mt-3 flex items-start gap-2 text-[13px] font-medium text-positive">
          <Check size={14} className="mt-0.5 shrink-0" aria-hidden />
          {result}
        </p>
      )}
      {error && (
        <p className="mt-3 flex items-start gap-2 text-[13px] text-danger">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      {/* The escape hatch. A missing account is an access problem, so say what
          to do about it rather than only offering a box to type in. */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setManualOpen((v) => !v)}
          className="text-[12.5px] font-medium text-muted underline decoration-dotted underline-offset-4 hover:text-text"
        >
          {manualOpen ? "Hide the manual box" : "Account not listed?"}
        </button>
        {listState === "ready" && (
          <button
            type="button"
            onClick={() => void accounts.refetch()}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted hover:text-text"
          >
            <RefreshCw
              size={12}
              className={accounts.isFetching ? "animate-spin" : ""}
              aria-hidden
            />
            Refresh the list
          </button>
        )}
      </div>

      {manualOpen && (
        <div className="mt-2 rounded-[var(--radius)] border border-border bg-surface-2 p-3">
          <p className="text-[12.5px] leading-snug text-muted">
            An account only appears above once the agency system user has been
            given access to it in Meta Business Manager (Business settings,
            Accounts, Ad accounts, Assign partner or people). Until then, paste
            the id here.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="act_1234567890"
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-[var(--radius)] border border-border bg-surface px-3 py-2 font-mono text-[13px] text-text placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
            />
            <Button
              variant="secondary"
              size="sm"
              loading={busyId === "manual"}
              onClick={onManualSave}
            >
              Link it
            </Button>
          </div>
          {currentAccountId && !rows.some((a) => a.linkedToThisClient) && (
            <p className="mt-2 text-[12px] text-muted">
              Currently on <span className="font-mono">{currentAccountId}</span>, which the
              agency token cannot see. That account will read empty until access is granted.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
