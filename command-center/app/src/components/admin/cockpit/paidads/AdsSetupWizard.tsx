import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, ExternalLink, Loader2 } from "lucide-react";
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

// Saving the token is not one step: Doppler holds it, Cloudflare binds it at
// deploy time, and only the deployment makes it real.
type Phase = "idle" | "saving" | "applying" | "deploying" | "done";

// Paid Ads > Connect ads. Where the page opens for a client whose ad account is
// not linked yet, and the only thing on offer besides the Ad Builder and
// Creatives until it is.
//
// Two steps, and the first one is usually already done: the agency token (one
// for every client, ever), then this client's own ad account. The token step
// exists because "no accounts to pick from" and "no token to ask with" look
// identical in a list, and only one of them is fixed in Business Manager.

const STEPS = [
  { id: "token", label: "Agency access" },
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

  const tokenMissing = accounts.data ? !accounts.data.configured : false;
  const linked = Boolean((currentAccountId ?? "").trim());
  const currentIndex = tokenMissing ? 0 : linked ? 2 : 1;

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
          : tokenMissing
            ? "Add the agency Meta token"
            : `Link ${clientName || "this client"}'s ad account`
      }
      intro={
        linked
          ? "Their Dashboard, Lead Tracker and Meta Data are reading live numbers now."
          : tokenMissing
            ? "One token covers every client. Until it exists, nothing here can ask Meta anything."
            : "Pick the account below. Nothing needs typing, and the Dashboard, Lead Tracker and Meta Data pages appear the moment it is linked."
      }
      steps={STEPS}
      currentIndex={currentIndex}
    >
      {tokenMissing ? (
        <TokenStep
          error={accounts.data?.error ?? null}
          onConnected={() => void accounts.refetch()}
        />
      ) : (
        <>
          <AdAccountPicker
            tenantId={tenantId}
            currentAccountId={currentAccountId}
            onLinked={refreshGate}
          />
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
        </>
      )}
    </SetupWizard>
  );
}

// Step one, on the rare occasion it is not already done: paste the token here
// and it is wired end to end.
//
// "Wired" is three moves, not one, and the reason this is a progress readout
// rather than a Save button. Cloudflare binds environment variables at DEPLOY
// time, so writing the token to Doppler changes nothing about the app that is
// currently running. The value only becomes real once it is rebound into
// Cloudflare and a new deployment goes live, which is the half-step that used
// to be a shell command someone had to remember. Here it is the same button.
//
// The token itself is write-only in both directions: it goes to Doppler and
// never comes back except as a masked tail.
function TokenStep({ error, onConnected }: { error: string | null; onConnected: () => void }) {
  const secrets = useAgencySecrets();
  const saveSecret = useSaveAgencySecret();
  const apply = useApplyAgencySecrets();

  const [token, setToken] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [failure, setFailure] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  // Only while a deployment is actually in flight. A finished deploy polled
  // forever is a request every six seconds for nothing.
  const deploy = useDeployStatus(phase === "deploying");
  const state = deploy.data?.deployment?.state ?? null;

  useEffect(() => {
    if (phase !== "deploying") return;
    if (state === "live") {
      setPhase("done");
      // The new deployment carries the token, so the account list can be asked
      // again and the wizard moves itself on to step two.
      onConnected();
    } else if (state === "failed") {
      setPhase("idle");
      setFailure("The deploy failed. The token is saved in Doppler; try Connect again.");
    }
  }, [phase, state, onConnected]);

  const canEdit = secrets.data?.canEdit ?? false;

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
        // Saved, but nothing can restart the app from here. Honest about it
        // rather than spinning on a deployment that will never appear.
        setPhase("idle");
        setFailure(
          "Saved to Doppler, but this console has no deploy token, so it cannot restart the app. It goes live on the next deploy.",
        );
        return;
      }
      setPhase("deploying");
    } catch (err) {
      setPhase("idle");
      setFailure(err instanceof Error ? err.message : "That did not save.");
    }
  };

  const busy = phase === "saving" || phase === "applying" || phase === "deploying";

  return (
    <div>
      {canEdit ? (
        <>
          <label className="block">
            <span className="label-cap block">Meta System User token</span>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste the token from Business settings"
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              className="mt-1 w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-2.5 font-mono text-[13px] text-text placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 disabled:opacity-60"
            />
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              loading={busy}
              disabled={!token.trim() && !busy}
              onClick={() => void connect()}
            >
              Connect
            </Button>
            <a
              href="https://business.facebook.com/settings/system-users"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted hover:text-text"
            >
              <ExternalLink size={13} aria-hidden />
              Get the token
            </a>
          </div>

          {busy && (
            <p className="mt-3 flex items-center gap-2 text-[12.5px] text-muted">
              <Loader2 size={13} className="animate-spin" aria-hidden />
              {phase === "saving"
                ? "Saving it to Doppler..."
                : phase === "applying"
                  ? "Binding it into Cloudflare..."
                  : "Restarting the app so the token is live. A couple of minutes."}
            </p>
          )}
          {phase === "done" && (
            <p className="mt-3 flex items-center gap-2 text-[12.5px] font-medium text-positive">
              <Check size={13} aria-hidden />
              Connected. Reading your ad accounts now.
            </p>
          )}
          {failure && <p className="mt-3 text-[12.5px] text-danger">{failure}</p>}
        </>
      ) : (
        <p className="rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-2.5 text-[13px] text-text">
          This console cannot write secrets (no Doppler write token), so the token has to go in by
          hand. The steps are below.
        </p>
      )}

      <div className="mt-4 border-t border-border pt-3">
        <button
          type="button"
          onClick={() => setManualOpen((v) => !v)}
          className="text-[12.5px] font-medium text-muted underline decoration-dotted underline-offset-4 hover:text-text"
        >
          {manualOpen ? "Hide the steps" : "Where do I get the token?"}
        </button>
        {manualOpen && (
          <ol className="mt-3 grid gap-2.5 text-[13px] leading-snug text-text">
            {[
              "Open Meta Business settings, then Users, then System users.",
              "Pick your system user (or add one as Admin) and press Generate new token.",
              "Choose your app and tick ads_read, ads_management, read_insights and business_management.",
              "Copy the token. Meta shows it once.",
              "Paste it above and press Connect. It is saved as META_SYSTEM_USER_TOKEN.",
            ].map((line, i) => (
              <li key={i} className="flex gap-2.5">
                <span
                  className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-surface-3 text-[11px] font-semibold text-muted"
                  aria-hidden
                >
                  {i + 1}
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {error && <p className="mt-3 text-[12.5px] text-muted">Meta said: {error}</p>}
    </div>
  );
}
