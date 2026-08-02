import { useMemo, useState } from "react";
import { Inbox, MessagesSquare, HelpCircle } from "lucide-react";
import Shell from "../../components/Shell";
import PageBar from "../../components/PageBar";
import Avatar from "../../components/Avatar";
import EmptyState from "../../components/EmptyState";
import { PAGE_CONTAINER } from "../../lib/layout";
import { timeAgo } from "../../lib/timeAgo";
import { useOrganicLeads } from "../../hooks/useOrganic";
import { isNewOrganic, organicColumns, type OrganicChannel, type OrganicLead } from "../../lib/organic";
import OrganicDetailModal from "./OrganicDetailModal";

// Organic: the leads the client's own website produced.
//
// Two columns because the Organic pipeline has two stages, and the stage is what
// the automation sets when a form fill or a chat message comes in. A third
// column appears only if a lead lands in some stage we do not recognise, so a
// pipeline change can never make a real lead invisible.
//
// Read-only by design: these leads are followed up by phone, not in the app.
// Clicking a row opens what they actually said.

const COLUMNS: {
  key: Exclude<OrganicChannel, "other">;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  accent: string;
}[] = [
  {
    key: "form",
    title: "Estimate Form",
    subtitle: "Requests from your website form",
    icon: <Inbox size={15} />,
    accent: "var(--grad-brand)",
  },
  {
    key: "chat",
    title: "Chat Widget",
    subtitle: "Messages from your website chat",
    icon: <MessagesSquare size={15} />,
    accent: "linear-gradient(135deg,#0d9488,#0284c7)",
  },
];

export default function Organic() {
  const { data, isLoading, isError, error } = useOrganicLeads();
  const [openContactId, setOpenContactId] = useState<string | null>(null);

  const leads = useMemo(() => data?.leads ?? [], [data]);
  const columns = useMemo(() => organicColumns(leads), [leads]);
  const openLead = leads.find((l) => l.contactId === openContactId) ?? null;

  return (
    <Shell>
      <div className={PAGE_CONTAINER}>
        <PageBar tabs={[]} section="Organic" count={leads.length || undefined} />

        {isError ? (
          <div className="shrink-0 rounded-2xl border border-border bg-surface px-4 py-10 text-center text-[13px] text-muted">
            {(error as Error | null)?.message ?? "Could not load organic leads."}
          </div>
        ) : isLoading ? (
          <div className="shrink-0 rounded-2xl border border-border bg-surface px-4 py-10 text-center text-[13px] text-faint">
            Loading your website leads...
          </div>
        ) : leads.length === 0 ? (
          <div className="shrink-0">
            <EmptyState
              title="No website leads yet"
              message="When someone fills out your website form or messages your chat widget, they show up here."
            />
          </div>
        ) : (
          <div className="grid shrink-0 gap-4 lg:grid-cols-2">
            {COLUMNS.map((col) => (
              <ChannelColumn
                key={col.key}
                title={col.title}
                subtitle={col.subtitle}
                icon={col.icon}
                accent={col.accent}
                leads={columns[col.key]}
                onOpen={(l) => setOpenContactId(l.contactId)}
              />
            ))}
            {columns.other.length > 0 && (
              <ChannelColumn
                title="Other stages"
                subtitle="Leads sitting in a stage this page does not recognise"
                icon={<HelpCircle size={15} />}
                accent="linear-gradient(135deg,#6b7280,#374151)"
                leads={columns.other}
                showStage
                onOpen={(l) => setOpenContactId(l.contactId)}
              />
            )}
          </div>
        )}
      </div>

      {openLead && (
        <OrganicDetailModal lead={openLead} onClose={() => setOpenContactId(null)} />
      )}
    </Shell>
  );
}

function ChannelColumn({
  title,
  subtitle,
  icon,
  accent,
  leads,
  showStage,
  onOpen,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  accent: string;
  leads: OrganicLead[];
  showStage?: boolean;
  onOpen: (l: OrganicLead) => void;
}) {
  const fresh = leads.filter((l) => isNewOrganic(l)).length;
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white"
          style={{ background: accent }}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-display text-[14px] font-semibold text-text">{title}</div>
          <div className="text-[11.5px] text-faint">{subtitle}</div>
        </div>
        {fresh > 0 && (
          <span className="shrink-0 rounded-full bg-brand-tint px-2 py-0.5 text-[11px] font-bold text-brand-text">
            {fresh} new
          </span>
        )}
      </header>
      {leads.length === 0 ? (
        <p className="px-4 py-10 text-center text-[13px] text-faint">Nothing here yet.</p>
      ) : (
        <ul>
          {leads.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => onOpen(l)}
                className="flex w-full items-start gap-3 border-b border-divider px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-surface-2"
              >
                <Avatar name={l.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-display text-[13.5px] font-semibold text-text">
                      {l.name}
                    </span>
                    {isNewOrganic(l) && (
                      <span className="shrink-0 rounded-[5px] bg-brand-tint px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wide text-brand-text">
                        New
                      </span>
                    )}
                  </div>
                  {l.phone && (
                    <div className="mt-0.5 font-data text-[12.5px] text-muted tnum">{l.phone}</div>
                  )}
                  {l.email && (
                    <div className="truncate text-[12px] text-faint">{l.email}</div>
                  )}
                  {showStage && l.stageName && (
                    <div className="mt-0.5 text-[11px] text-faint">{l.stageName}</div>
                  )}
                </div>
                <span className="mt-0.5 shrink-0 text-[11px] text-faint">
                  {timeAgo(l.createdAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
