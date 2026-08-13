import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, ChevronRight, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import SetupWizard from "./SetupWizard";
import { Button } from "../../../ui/Button";
import { api } from "../../../../lib/api";
import type { AdAccountOption } from "../../../../../functions/lib/metaAdAccounts";
import {
  useAdminMetaAdAccountsQuery,
  useAgencySecrets,
  useApplyAgencySecrets,
  useDeployStatus,
  useSaveAgencySecret,
} from "../../../../hooks/useApi";

// Paid Ads > Connect ads. Where the page opens for a client whose ad account is
// not linked yet, and the only thing on offer besides the Ad Builder and
// Creatives until it is.
//
// Two things, in order, both always on screen so neither is a surprise:
//
//   1. The agency token. One for every client, ever. Paste it, press Connect,
//      watch the bar, get a tick.
//   2. Which ad account belongs to THIS client. The token can see several, and
//      picking the wrong one is the only mistake here with a victim: it would
//      show one client another's spend under their own name. Connect attaches
//      it by itself when the token can see exactly one unclaimed account, which
//      is the normal case; a list only appears when there is genuinely a choice
//      to make.

const STEPS = [
  { id: "token", label: "Token" },
  { id: "account", label: "Account" },
  { id: "done", label: "Ads flowing" },
];

export default function AdsSetupWizard({
  tenantId,
  clientName,
  currentAccountId,
  onFinished,
}: {
  tenantId: string;
  clientName: string;
  /** The account on the client row right now, or null while unlinked. */
  currentAccountId: string | null;
  /** Jump the page to a real tab once the ads are flowing. */
  onFinished: (sub: string) => void;
}) {
  const accounts = useAdminMetaAdAccountsQuery(tenantId);
  const queryClient = useQueryClient();
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  // The token is proven, not assumed: "configured" comes back from the endpoint
  // that just tried to use it.
  const tokenOk = accounts.data?.configured === true;
  const linked = Boolean((currentAccountId ?? "").trim());

  // The accounts this client could be put on: everything the token can see that
  // no OTHER client already holds.
  const free = (accounts.data?.accounts ?? []).filter((a) => !a.linkedTenantName);

  // Attaching the account is not a question worth asking when there is only one
  // answer. One free account is the normal case (a client has one ad account),
  // so Connect finishes the job rather than handing back a list of one.
  const attach = useCallback(
    async (accountId: string) => {
      setLinking(true);
      setLinkError(null);
      try {
        await api(`/api/admin/clients/${tenantId}`, {
          method: "PATCH",
          body: JSON.stringify({ metaAdAccountId: accountId }),
        });
        // Pull the ads in now rather than at the nightly sync, so the pages this
        // unlocks have something in them.
        await api(`/api/admin/ads/sync?tenantId=${encodeURIComponent(tenantId)}&days=30`, {
          method: "POST",
        }).catch(() => undefined);
        await queryClient.invalidateQueries({ queryKey: ["admin", "clients"] });
        await accounts.refetch();
      } catch (err) {
        setLinkError(err instanceof Error ? err.message : "Could not attach that ad account.");
      } finally {
        setLinking(false);
      }
    },
    [tenantId, queryClient, accounts],
  );

  // Fires once, silently, in the only case where there is nothing to decide.
  const autoAccount = tokenOk && !linked && free.length === 1 ? free[0].id : null;
  useEffect(() => {
    if (!autoAccount || linking) return;
    void attach(autoAccount);
    // attach/linking deliberately excluded: this must fire on the account
    // becoming unambiguous, not on every render while it is being attached.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAccount]);

  return (
    <SetupWizard
      title={
        linked
          ? `${clientName || "This client"} is connected`
          : `Connect ${clientName || "this client"}'s ads`
      }
      intro={
        linked
          ? "Their Dashboard, Lead Tracker and Meta Data are reading live numbers now."
          : "Paste the Meta token and press Connect. That is the whole job."
      }
      steps={STEPS}
      currentIndex={!tokenOk ? 0 : linked ? 2 : 1}
    >
      <TokenConnect
        connected={tokenOk}
        error={accounts.data?.error ?? null}
        onConnected={() => void accounts.refetch()}
      />

      {tokenOk && (
        <AccountState
          clientName={clientName}
          linked={linked}
          linking={linking}
          loading={accounts.isFetching && !accounts.data}
          free={free}
          error={linkError}
          onPick={(id) => void attach(id)}
          onRefresh={() => void accounts.refetch()}
          onFinished={onFinished}
        />
      )}
    </SetupWizard>
  );
}

// What happened to the ad account, in as few words as the situation allows.
//
// There is no picker here on purpose. An ad account has to be attached to the
// client or their pages read somebody else's numbers, but that is only a
// QUESTION when the token can see more than one unclaimed account. Normally it
// sees one, Connect attaches it, and this is a green line rather than a chore.
function AccountState({
  clientName,
  linked,
  linking,
  loading,
  free,
  error,
  onPick,
  onRefresh,
  onFinished,
}: {
  clientName: string;
  linked: boolean;
  linking: boolean;
  loading: boolean;
  free: AdAccountOption[];
  error: string | null;
  onPick: (accountId: string) => void;
  onRefresh: () => void;
  onFinished: (sub: string) => void;
}) {
  if (linked) {
    return (
      <div className="mt-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius)] border border-positive/40 bg-positive-tint px-3.5 py-3">
          <span className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-text">
            <span
              className="grid h-5 w-5 place-items-center rounded-full bg-positive text-white"
              aria-hidden
            >
              <Check size={13} />
            </span>
            2. Their ads are flowing
          </span>
        </div>
        <div className="mt-4">
          <Button variant="primary" onClick={() => onFinished("dashboard")}>
            Open the Dashboard
            <ArrowRight size={14} aria-hidden />
          </Button>
        </div>
      </div>
    );
  }

  if (linking || loading) {
    return (
      <p className="mt-4 flex items-center gap-2 text-[12.5px] text-muted">
        <Loader2 size={13} className="animate-spin" aria-hidden />
        {linking ? "Attaching their ad account and pulling the ads in..." : "Reading Meta..."}
      </p>
    );
  }

  if (error) {
    return <p className="mt-4 text-[12.5px] text-danger">{error}</p>;
  }

  // Nothing to attach. Always an access problem in Meta, never something that
  // can be fixed by clicking harder here, so it says what to go and do.
  if (free.length === 0) {
    return (
      <div className="mt-4 rounded-[var(--radius)] border border-border bg-surface-2 px-3.5 py-3">
        <p className="text-[13px] leading-snug text-text">
          The token works, but it cannot see an ad account for {clientName || "this client"} yet.
        </p>
        <p className="mt-1 text-[12.5px] leading-snug text-muted">
          In Business settings, open Ad accounts, pick theirs, then Assign partner or people and
          choose the same system user. It appears here straight after.
        </p>
        <button
          type="button"
          onClick={onRefresh}
          className="mt-2.5 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-muted hover:text-text"
        >
          <RefreshCw size={12} aria-hidden />
          Check again
        </button>
      </div>
    );
  }

  // The only case worth a question: several unclaimed accounts, and only a human
  // knows which one is this client's.
  return (
    <div className="mt-4">
      <h3 className="text-[13.5px] font-semibold text-text">
        Which of these is {clientName || "this client"}&apos;s?
      </h3>
      <ul className="mt-2 grid gap-2">
        {free.map((a) => (
          <li
            key={a.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius)] border border-border bg-surface px-3 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-medium text-text">{a.name}</p>
              <p className="mt-0.5 text-[12px] text-muted">
                {a.spend30d > 0 ? `${Math.round(a.spend30d)} ${a.currency} last 30 days` : "No spend in 30 days"}
              </p>
            </div>
            <Button variant="primary" size="sm" onClick={() => onPick(a.id)}>
              That one
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Where the token comes from, folded away under the field it fills.
//
// Closed by default and closed again on the next visit: these directions are
// read once and then never again, so they must not sit permanently between the
// box and the button. Open, they are the actual clicks in Meta's own words,
// because "generate a system user token" is only obvious to someone who has
// already done it.
const TOKEN_STEPS: { text: string; detail?: string }[] = [
  {
    text: "Open Meta Business settings",
    detail: "business.facebook.com/settings, with the business that owns the ad accounts selected.",
  },
  {
    text: "In the left sidebar, click Users, then System users",
    detail: "Not People. A system user is the account that keeps working when nobody is logged in.",
  },
  {
    text: "Click your system user, or Add one and give it the Admin role",
    detail: "One system user covers every client you will ever run ads for.",
  },
  {
    text: "Press Generate new token and choose your app",
    detail: "If there is no app in the list, create one in developers.facebook.com first.",
  },
  {
    text: "Tick ads_read, ads_management, read_insights and business_management",
    detail: "The first three read the numbers. The last one lets the picker list your accounts.",
  },
  {
    text: "Copy the token and paste it in the box above",
    detail: "Meta shows it exactly once. If you lose it, generate another one.",
  },
  {
    text: "Assign the client's ad account to that same system user",
    detail:
      "Business settings, Ad accounts, pick the account, Assign partner or people, choose the system user. An account it cannot see will not appear in step 2.",
  },
];

function Directions() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4 overflow-hidden rounded-[var(--radius)] border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 bg-surface-2 px-3.5 py-2.5 text-left text-[13px] font-semibold text-text transition-colors hover:bg-surface-3"
      >
        <ChevronRight
          size={15}
          aria-hidden
          className={`shrink-0 text-muted transition-transform duration-150 ${open ? "rotate-90" : ""}`}
        />
        Where do I get this token?
      </button>

      {open && (
        <div className="border-t border-border bg-surface px-3.5 py-3.5">
          <ol className="grid gap-3">
            {TOKEN_STEPS.map((step, i) => (
              <li key={i} className="flex gap-2.5">
                <span
                  className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-surface-3 text-[11px] font-semibold text-muted"
                  aria-hidden
                >
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium leading-snug text-text">{step.text}</p>
                  {step.detail && (
                    <p className="mt-0.5 text-[12px] leading-snug text-muted">{step.detail}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
          <a
            href="https://business.facebook.com/settings/system-users"
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-[var(--radius)] border border-border bg-surface-2 px-3.5 py-2 text-[12.5px] font-semibold text-text transition-colors hover:border-brand hover:text-brand"
          >
            <ExternalLink size={13} aria-hidden />
            Open Business settings
          </a>
        </div>
      )}
    </div>
  );
}

// Saving the token is not one move, which is why there is a bar rather than a
// spinner. Doppler holds the value, Cloudflare binds environment variables at
// DEPLOY time, and only the finished deployment makes the token real. The bar
// is those three moves; the tick is the app actually answering with it.
type Phase = "idle" | "saving" | "applying" | "deploying" | "done";

const PROGRESS: Record<Phase, number> = {
  idle: 0,
  saving: 20,
  applying: 45,
  // Where it sits for most of the wait. Honest: the deploy is the long part.
  deploying: 80,
  done: 100,
};

const PHASE_TEXT: Record<Phase, string> = {
  idle: "",
  saving: "Saving the token...",
  applying: "Binding it into the app...",
  deploying: "Restarting the app. This is the slow part, a minute or two.",
  done: "Connected.",
};

function TokenConnect({
  connected,
  error,
  onConnected,
}: {
  /** Whether the running app can already talk to Meta. */
  connected: boolean;
  error: string | null;
  onConnected: () => void;
}) {
  const secrets = useAgencySecrets();
  const saveSecret = useSaveAgencySecret();
  const apply = useApplyAgencySecrets();

  const [token, setToken] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [failure, setFailure] = useState<string | null>(null);
  // A working token collapses the field, because the common visit is not a
  // credential rotation. It reopens on a click, unlike before, when it did not
  // exist at all.
  const [replacing, setReplacing] = useState(false);

  // Only while a deployment is in flight. Polling a finished one forever is a
  // request every six seconds for nothing.
  const deploy = useDeployStatus(phase === "deploying");
  const state = deploy.data?.deployment?.state ?? null;

  useEffect(() => {
    if (phase !== "deploying") return;
    if (state === "live") {
      setPhase("done");
      setReplacing(false);
      // The new deployment carries the token, so ask Meta again. That answer is
      // what turns the tick on, not this component's own optimism.
      onConnected();
    } else if (state === "failed") {
      setPhase("idle");
      setFailure("The restart failed. The token is saved; press Connect to try again.");
    }
  }, [phase, state, onConnected]);

  const canEdit = secrets.data?.canEdit ?? false;
  const masked = secrets.data?.rows.find((r) => r.name === "META_SYSTEM_USER_TOKEN")?.masked ?? null;
  const busy = phase === "saving" || phase === "applying" || phase === "deploying";

  const connect = async () => {
    const value = token.trim();
    if (!value) return;
    setFailure(null);
    try {
      setPhase("saving");
      await saveSecret.mutateAsync({ name: "META_SYSTEM_USER_TOKEN", value });
      setToken("");
      setPhase("applying");
      const res = await apply.mutateAsync();
      if (!res.deployment) {
        setPhase("idle");
        setFailure(
          "Saved, but this console has no deploy token, so it cannot restart the app. The token goes live on the next deploy.",
        );
        return;
      }
      setPhase("deploying");
    } catch (err) {
      setPhase("idle");
      setFailure(err instanceof Error ? err.message : "That did not save.");
    }
  };

  // Done, and nobody is replacing it: one green line, no controls to read past.
  if (connected && !replacing && !busy) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius)] border border-positive/40 bg-positive-tint px-3.5 py-3">
        <span className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-text">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-positive text-white" aria-hidden>
            <Check size={13} />
          </span>
          1. Meta is connected
        </span>
        {masked && <span className="font-mono text-[12px] text-muted">{masked}</span>}
        <button
          type="button"
          onClick={() => setReplacing(true)}
          className="text-[12.5px] font-medium text-muted underline decoration-dotted underline-offset-4 hover:text-text"
        >
          Paste a new token
        </button>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-[14px] font-semibold text-text">1. Paste your Meta token</h3>
      <p className="mt-1 max-w-prose text-[12.5px] leading-snug text-muted">
        One token covers every client. It is saved, wired in and made live in one press.
      </p>

      {canEdit ? (
        <>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste the token here"
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              className="min-w-0 flex-1 rounded-[var(--radius)] border border-border bg-surface px-3 py-2.5 font-mono text-[13px] text-text placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 disabled:opacity-60"
            />
            <Button
              variant="primary"
              loading={busy}
              disabled={!token.trim() && !busy}
              onClick={() => void connect()}
            >
              Connect
            </Button>
          </div>

          {/* The bar, not a spinner: three moves happen, and the third one is
              slow enough that a spinner reads as a hang. */}
          {(busy || phase === "done") && (
            <div className="mt-3">
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
                role="progressbar"
                aria-valuenow={PROGRESS[phase]}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Connecting Meta"
              >
                <div
                  className={`h-full rounded-full transition-[width] duration-700 ease-out ${
                    phase === "done" ? "bg-positive" : "bg-brand"
                  }`}
                  style={{ width: `${PROGRESS[phase]}%` }}
                />
              </div>
              <p
                className={`mt-2 flex items-center gap-1.5 text-[12.5px] ${
                  phase === "done" ? "font-medium text-positive" : "text-muted"
                }`}
              >
                {phase === "done" && <Check size={13} aria-hidden />}
                {PHASE_TEXT[phase]}
              </p>
            </div>
          )}

          {failure && <p className="mt-3 text-[12.5px] text-danger">{failure}</p>}
          {replacing && !busy && (
            <button
              type="button"
              onClick={() => setReplacing(false)}
              className="mt-3 text-[12.5px] font-medium text-muted hover:text-text"
            >
              Cancel
            </button>
          )}
        </>
      ) : (
        <p className="mt-3 rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-2.5 text-[13px] text-text">
          This console cannot save secrets (no Doppler write token), so the token has to go in by
          hand.
        </p>
      )}

      <Directions />

      {error && !busy && <p className="mt-2 text-[12.5px] text-muted">Meta said: {error}</p>}
    </div>
  );
}
