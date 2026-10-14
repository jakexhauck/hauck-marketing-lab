import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ExternalLink, RefreshCw, X } from "lucide-react";
import { Button } from "../../ui/Button";
import SubaccountCard from "../onboarding/SubaccountCard";
import { useClientAccountsQuery, useFixOwnerLinks } from "../../../hooks/useApi";
import { useMetaPage, useSetMetaPage } from "../../../hooks/useSopApi";
import { clientPath } from "../../../lib/clientNav";
import { ADS_SETUP_SUB } from "../../../lib/fulfillmentPages";
import type { AccountCheck, AccountCheckId } from "../../../../functions/lib/clientAccounts";
import type { AdminClient } from "../../../lib/api";

// Client > Accounts (Jake, 2026-10-10): every account and GHL piece the client
// needs, green or red, with a fix button on each red row. Checks run on the
// server (functions/lib/clientAccounts.ts). Each fix reuses the screen or
// endpoint that already owns that setting, so there is one way to set each.
//
// Heading, rows, buttons. No helper text (Jake's no-sub-text rule); the red
// row's short detail is the only words beyond the labels.

const LABELS: Record<AccountCheckId, string> = {
  ghl: "GHL Marketplace app",
  "meta-ads": "Meta ad account",
  "meta-page": "Facebook Page",
  pipeline: "Sales Pipeline",
  calendars: "Calendars",
  "owner-links": "Open Lead link",
  "owner-phone": "Owner phone",
  login: "Client app login",
  push: "Phone alerts",
};

const GROUPS: { caption: string; ids: AccountCheckId[] }[] = [
  { caption: "Accounts", ids: ["ghl", "meta-ads", "meta-page"] },
  { caption: "GHL", ids: ["pipeline", "calendars", "owner-links", "owner-phone"] },
  { caption: "Client", ids: ["login", "push"] },
];

const APP_URL = "https://app.hauckmarketing.com";

export default function AccountsTab({ client }: { client: AdminClient }) {
  const query = useClientAccountsQuery(client.id);
  const checks = query.data?.checks ?? [];
  const byId = new Map(checks.map((c) => [c.id, c]));
  const green = checks.filter((c) => c.state === "ok").length;

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3">
        <h2 className="flex-1 font-display text-[19px] font-semibold text-text">Accounts</h2>
        {checks.length > 0 && (
          <span className="text-[13px] font-semibold tabular-nums text-muted">
            {green} / {checks.length}
          </span>
        )}
        <Button size="sm" onClick={() => void query.refetch()} loading={query.isFetching}>
          {!query.isFetching && <RefreshCw size={14} />} Check again
        </Button>
      </header>

      {query.isLoading && <div className="pk-empty">Checking...</div>}
      {query.isError && <div className="pk-empty">{(query.error as Error).message || "Could not check."}</div>}

      {checks.length > 0 &&
        GROUPS.map((g) => (
          <section
            key={g.caption}
            className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]"
          >
            <h3 className="label-cap border-b border-border px-5 py-3">{g.caption}</h3>
            <ul className="divide-y divide-border">
              {g.ids.map((id) => {
                const c = byId.get(id);
                return c ? (
                  <CheckRow key={id} check={c} client={client} locationId={query.data?.locationId ?? null} />
                ) : null;
              })}
            </ul>
          </section>
        ))}
    </div>
  );
}

function StateMark({ state }: { state: AccountCheck["state"] }) {
  if (state === "ok") {
    return (
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-tint text-brand-text" aria-label="Connected">
        <Check size={14} strokeWidth={3} />
      </span>
    );
  }
  const red = state === "missing";
  return (
    <span
      className={
        "grid h-6 w-6 shrink-0 place-items-center rounded-full " +
        (red ? "bg-danger/15 text-danger" : "bg-surface-3 text-faint")
      }
      aria-label={red ? "Not connected" : "Not checked"}
    >
      <X size={14} strokeWidth={3} />
    </span>
  );
}

function CheckRow({
  check,
  client,
  locationId,
}: {
  check: AccountCheck;
  client: AdminClient;
  locationId: string | null;
}) {
  const [open, setOpen] = useState(false);
  // The Facebook Page can always be changed, even once one is picked.
  const fixable =
    check.state === "missing" || (check.id === "ghl" && check.state !== "ok") || check.id === "meta-page";
  const panel = open ? <FixPanel id={check.id} client={client} /> : null;

  return (
    <li>
      <div className="flex flex-wrap items-center gap-3 px-5 py-3.5">
        <StateMark state={check.state} />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-text">{LABELS[check.id]}</div>
          {check.detail && <div className="text-[12.5px] text-muted">{check.detail}</div>}
        </div>
        {fixable && (
          <FixButton
            id={check.id}
            client={client}
            locationId={locationId}
            done={check.state === "ok"}
            open={open}
            onToggle={() => setOpen((v) => !v)}
          />
        )}
      </div>
      {panel && <div className="border-t border-border bg-surface-2 px-5 py-4">{panel}</div>}
    </li>
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
  if (id === "ghl") {
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
