import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, ExternalLink } from "lucide-react";
import SetupWizard from "./SetupWizard";
import AdAccountPicker from "../../AdAccountPicker";
import { Button } from "../../../ui/Button";
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
//      show one client another's spend under their own name. So it is a pick,
//      never a guess, even when the token can see exactly one.
//
// Step one was previously hidden whenever the token already worked, which is
// how it came to look like the step did not exist.

const STEPS = [
  { id: "token", label: "Meta connected" },
  { id: "account", label: "This client's account" },
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

  // The token is proven, not assumed: "configured" comes back from the endpoint
  // that just tried to use it.
  const tokenOk = accounts.data?.configured === true;
  const linked = Boolean((currentAccountId ?? "").trim());
  const currentIndex = !tokenOk ? 0 : linked ? 2 : 1;

  // The roster is what the tab gate reads, so it has to hear about this before
  // the hidden tabs can come back.
  const refreshGate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin", "clients"] });
  };

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
          : "Two things: the agency Meta token, then which ad account is theirs. Both are below."
      }
      steps={STEPS}
      currentIndex={currentIndex}
    >
      <TokenConnect
        connected={tokenOk}
        error={accounts.data?.error ?? null}
        onConnected={() => void accounts.refetch()}
      />

      {/* The second half stays out of the way until the first one is done:
          an account list drawn without a working token is an empty box that
          looks like an answer. */}
      {tokenOk && (
        <div className="mt-6 border-t border-border pt-5">
          <h3 className="text-[14px] font-semibold text-text">
            2. Which ad account is {clientName || "this client"}&apos;s?
          </h3>
          <p className="mt-1 max-w-prose text-[12.5px] leading-snug text-muted">
            This is what makes their pages show their own numbers and nobody else&apos;s. Click Link
            on their account.
          </p>
          <div className="mt-3">
            <AdAccountPicker
              tenantId={tenantId}
              currentAccountId={currentAccountId}
              onLinked={refreshGate}
            />
          </div>

          {linked && (
            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4">
              <Button variant="primary" onClick={() => onFinished("dashboard")}>
                Open the Dashboard
                <ArrowRight size={14} aria-hidden />
              </Button>
              <span className="inline-flex items-center gap-1.5 text-[12.5px] text-positive">
                <Check size={13} aria-hidden />
                Every Paid Ads page is unlocked.
              </span>
            </div>
          )}
        </div>
      )}
    </SetupWizard>
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

      <a
        href="https://business.facebook.com/settings/system-users"
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted hover:text-text"
      >
        <ExternalLink size={13} aria-hidden />
        Where to get it: Business settings, Users, System users, Generate new token
      </a>

      {error && !busy && <p className="mt-2 text-[12.5px] text-muted">Meta said: {error}</p>}
    </div>
  );
}
