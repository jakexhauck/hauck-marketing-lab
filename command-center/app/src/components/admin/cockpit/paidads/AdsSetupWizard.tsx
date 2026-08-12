import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, ExternalLink } from "lucide-react";
import SetupWizard from "./SetupWizard";
import AdAccountPicker from "../../AdAccountPicker";
import { Button } from "../../../ui/Button";
import { useAdminMetaAdAccountsQuery } from "../../../../hooks/useApi";

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
        <TokenStep error={accounts.data?.error ?? null} />
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

// Step one, on the rare occasion it is not already done. Deliberately
// instructions rather than a form: the token is a Doppler secret bound at
// deploy, and a box here would imply it can be pasted into the browser.
function TokenStep({ error }: { error: string | null }) {
  return (
    <div>
      <ol className="grid gap-2.5 text-[13px] leading-snug text-text">
        {[
          "Open Meta Business settings, then Users, then System users.",
          "Pick your system user (or add one as Admin) and press Generate new token.",
          "Choose your app and tick ads_read, ads_management, read_insights and business_management.",
          "Copy the token. Meta shows it once.",
          "Save it in Doppler as META_SYSTEM_USER_TOKEN, then redeploy.",
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
      <a
        href="https://business.facebook.com/settings/system-users"
        target="_blank"
        rel="noreferrer"
        className="mt-4 inline-flex items-center gap-2 rounded-[var(--radius)] border border-border bg-surface-2 px-4 py-2.5 text-[13px] font-semibold text-text transition-colors hover:border-brand hover:text-brand"
      >
        <ExternalLink size={14} aria-hidden />
        Open Business settings
      </a>
      {error && <p className="mt-3 text-[12.5px] text-muted">Meta said: {error}</p>}
    </div>
  );
}
