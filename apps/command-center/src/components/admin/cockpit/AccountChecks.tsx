import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ExternalLink, X } from "lucide-react";
import { Button } from "../../ui/Button";
import SubaccountCard from "../onboarding/SubaccountCard";
import { useClientAccountsQuery, useFixOwnerLinks } from "../../../hooks/useApi";
import { useMetaPage, useSetMetaPage } from "../../../hooks/useSopApi";
import { clientPath } from "../../../lib/clientNav";
import { ADS_SETUP_SUB } from "../../../lib/fulfillmentPages";
import type { AccountCheck, AccountCheckId } from "../../../../functions/lib/clientAccounts";
import type { AdminClient } from "../../../lib/api";

// The Accounts checks (Jake, 2026-10-10), every account and GHL piece the
// client needs, green or red, with a fix button on each red one. Checks run on
// the server (functions/lib/clientAccounts.ts). Each fix reuses the screen or
// endpoint that already owns that setting, so there is one way to set each.
//
// Brief v2 (Jake, 2026-10-17): the Accounts page went. Each check is an auto
// box in its brief section (lib/briefChecklist.ts, ACCOUNT_CHECK_SECTION): it
// follows the live check, so it cannot be ticked by hand, and a red one shows
// its short detail and its fix. No helper text; the detail is the only words
// beyond the label.

export const ACCOUNT_LABELS: Record<AccountCheckId, string> = {
  ghl: "GHL Marketplace app",
  texting: "Texting",
  "meta-ads": "Meta ad account",
  "meta-page": "Facebook Page",
  pipeline: "Sales Pipeline",
  calendars: "Calendars",
  timezone: "Timezone",
  "owner-links": "Open Lead link",
  "owner-phone": "Owner phone",
  login: "Client app login",
  push: "Phone alerts",
};

const APP_URL = "https://app.hauckmarketing.com";

export function AccountCheckBox({
  check,
  client,
  locationId,
}: {
  check: AccountCheck;
  client: AdminClient;
  locationId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const ok = check.state === "ok";
  // The Facebook Page can always be changed, even once one is picked.
  const fixable = check.state === "missing" || (check.id === "ghl" && !ok) || check.id === "meta-page";
  const red = check.state === "missing";

  return (
    <div>
      <div className="flex flex-wrap items-start gap-3 rounded-[var(--radius)] px-3 py-2">
        <span
          role="checkbox"
          aria-checked={ok}
          aria-disabled="true"
          aria-label={ACCOUNT_LABELS[check.id]}
          className={
            "mt-px grid h-5 w-5 shrink-0 place-items-center rounded-[6px] border-[1.5px] " +
            (ok
              ? "border-brand bg-brand text-brand-fg"
              : red
                ? "border-danger/60 bg-danger/10 text-danger"
                : "border-border-strong bg-surface-2 text-faint")
          }
        >
          {ok ? <Check size={13} strokeWidth={3} aria-hidden /> : <X size={12} strokeWidth={3} aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <div className={"text-[14px] font-medium " + (ok ? "text-faint" : "text-text")}>{ACCOUNT_LABELS[check.id]}</div>
          {check.detail && <div className={"text-[12.5px] " + (red ? "text-danger" : "text-muted")}>{check.detail}</div>}
        </div>
        {fixable && (
          <FixButton
            id={check.id}
            client={client}
            locationId={locationId}
            done={ok}
            open={open}
            onToggle={() => setOpen((v) => !v)}
          />
        )}
      </div>
      {open && (
        <div className="mx-3 mb-2 rounded-[var(--radius)] border border-border bg-surface-2 px-4 py-3">
          <FixPanel id={check.id} client={client} />
        </div>
      )}
    </div>
  );
}

// Rows whose fix happens right here open a panel under the row.
const INLINE: AccountCheckId[] = ["ghl", "meta-page"];

function FixButton({
  id,
  client,
  locationId,
  done,
  open,
  onToggle,
}: {
  id: AccountCheckId;
  client: AdminClient;
  locationId: string | null;
  done: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const navigate = useNavigate();
  const fixLinks = useFixOwnerLinks(client.id);
  const [copied, setCopied] = useState(false);
  const ghlBase = locationId ? `https://app.gohighlevel.com/v2/location/${encodeURIComponent(locationId)}` : null;

  if (INLINE.includes(id)) {
    return (
      <Button size="sm" variant={open ? "subtle" : done ? "secondary" : "primary"} onClick={onToggle}>
        {open ? "Close" : id === "ghl" ? "Link" : done ? "Change" : "Pick"}
      </Button>
    );
  }

  const go = (label: string, to: string) => (
    <Button size="sm" variant="primary" onClick={() => navigate(to)}>
      {label}
    </Button>
  );
  const ghlLink = (path: string): ReactNode =>
    ghlBase ? (
      <a
        href={`${ghlBase}${path}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-10 items-center gap-1.5 rounded-[var(--radius-sm)] bg-brand px-3.5 text-[14px] font-semibold text-brand-fg hover:bg-brand-strong lg:h-8 lg:px-3 lg:text-[13px]"
      >
        Open in GHL <ExternalLink size={13} />
      </a>
    ) : null;

  switch (id) {
    case "meta-ads":
      return go("Connect", clientPath(client.id, "paid-ads", ADS_SETUP_SUB));
    case "login":
      return go("Add", clientPath(client.id, "management"));
    case "pipeline":
      return ghlLink("/opportunities/pipeline");
    case "calendars":
      return ghlLink("/settings/calendars");
    case "timezone":
      return go("Fix", clientPath(client.id, "ghl", "business-profile"));
    case "owner-phone":
      return ghlLink("/settings/staff/team");
    case "owner-links":
      return (
        <div className="flex flex-col items-end gap-1">
          <Button size="sm" variant="primary" loading={fixLinks.isPending} onClick={() => fixLinks.mutate()}>
            Write
          </Button>
          {fixLinks.isError && (
            <span className="max-w-[260px] text-right text-[12px] text-danger">
              {(fixLinks.error as Error).message || "Did not write."}
            </span>
          )}
        </div>
      );
    case "push":
      return (
        <Button
          size="sm"
          variant="primary"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(APP_URL)
              .then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1800);
              })
              .catch(() => undefined);
          }}
        >
          {copied ? "Copied" : "Copy app link"}
        </Button>
      );
    default:
      return null;
  }
}

function FixPanel({ id, client }: { id: AccountCheckId; client: AdminClient }) {
  if (id === "ghl" || id === "texting") {
    return <SubaccountCard tenantId={client.id} clientName={client.name} isLive={client.onboardingStatus === "live"} />;
  }
  if (id === "meta-page") return <MetaPagePicker tenantId={client.id} />;
  return null;
}

function MetaPagePicker({ tenantId }: { tenantId: string }) {
  const page = useMetaPage(tenantId);
  const setPage = useSetMetaPage(tenantId);
  const accounts = useClientAccountsQuery(tenantId);
  const current = page.data?.pageId ?? "";
  const [picked, setPicked] = useState<string | null>(null);
  const chosen = picked ?? current;
  const pages = page.data?.pages ?? [];

  if (page.isLoading) return <div className="text-[13px] text-muted">Loading...</div>;
  if (page.data?.pagesError) return <div className="text-[13px] text-danger">{page.data.pagesError}</div>;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={chosen}
        onChange={(e) => setPicked(e.target.value)}
        aria-label="Facebook Page"
        className="min-w-[220px] rounded-[var(--radius)] border border-border bg-surface px-2 py-2 text-[13px] text-text"
      >
        <option value="">Choose a Page</option>
        {pages.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        variant="primary"
        disabled={!chosen || chosen === current}
        loading={setPage.isPending}
        onClick={() =>
          setPage.mutate(chosen, {
            onSuccess: () => {
              setPicked(null);
              void accounts.refetch();
            },
          })
        }
      >
        Save
      </Button>
      {setPage.isError && (
        <span className="text-[12.5px] text-danger">{(setPage.error as Error).message || "Did not save."}</span>
      )}
    </div>
  );
}
