import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Inbox, MessagesSquare } from "lucide-react";
import Shell from "../../components/Shell";
import PageBar from "../../components/PageBar";
import Avatar from "../../components/Avatar";
import EmptyState from "../../components/EmptyState";
import { PAGE_CONTAINER } from "../../lib/layout";
import { LEADS_TABS } from "../../lib/pageTabs";
import { useLeadsHub } from "../../hooks/useLeadsHub";
import { organicLeads, isNew, type HubLead } from "../../lib/leadsHub";

// Website-owned leads: estimate-form requests and chat-widget conversations, laid
// out side by side so both channels are visible at a glance. Each column is a
// list only: clicking a lead opens the unified Inbox with that conversation
// selected, where you reply by SMS or email.
export default function LeadsOrganic() {
  const navigate = useNavigate();
  const { leads } = useLeadsHub();
  const organic = useMemo(() => organicLeads(leads), [leads]);

  function openInInbox(lead: HubLead) {
    navigate(lead.contactId ? `/conversations/${lead.contactId}` : "/conversations");
  }

  const forms = organic.filter((l) => l.source === "form");
  const chats = organic.filter((l) => l.source === "chat");

  return (
    <Shell>
      <div className={PAGE_CONTAINER}>
        <PageBar
          tabs={LEADS_TABS}
        />
        {organic.length === 0 ? (
          <EmptyState message="When someone fills out a form or messages your chat widget, they show up here." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <ChannelColumn
              title="Estimate Forms"
              subtitle="Structured requests from your site"
              icon={<Inbox size={15} />}
              accent="var(--grad-brand)"
              leads={forms}
              variant="form"
              onOpen={openInInbox}
            />
            <ChannelColumn
              title="Website Chat"
              subtitle="Live conversations from your widget"
              icon={<MessagesSquare size={15} />}
              accent="linear-gradient(135deg,#0d9488,#0284c7)"
              leads={chats}
              variant="chat"
              onOpen={openInInbox}
            />
          </div>
        )}
      </div>
    </Shell>
  );
}

function ChannelColumn({
  title,
  subtitle,
  icon,
  accent,
  leads,
  variant,
  onOpen,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  accent: string;
  leads: HubLead[];
  variant: "form" | "chat";
  onOpen: (l: HubLead) => void;
}) {
  const fresh = leads.filter(isNew).length;
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
          <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[11px] font-bold text-brand-text">
            {fresh} new
          </span>
        )}
      </header>
      {leads.length === 0 ? (
        <p className="px-4 py-10 text-center text-[13px] text-faint">All caught up here.</p>
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
                    {isNew(l) && (
                      <span className="shrink-0 rounded-[5px] bg-brand-tint px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wide text-brand-text">
                        New
                      </span>
                    )}
                  </div>
                  {variant === "chat" ? (
                    <p className="mt-1 inline-block rounded-[4px_12px_12px_12px] bg-surface-2 px-3 py-1.5 text-[12.5px] text-text">
                      {l.preview ? `"${l.preview}"` : "New chat"}
                    </p>
                  ) : (
                    <p className="mt-0.5 truncate text-[12.5px] text-muted">
                      {l.intent || l.preview}
                    </p>
                  )}
                  {l.location && (
                    <div className="mt-0.5 text-[11px] text-faint">
                      {l.location}
                      {l.zip ? `, ${l.zip}` : ""}
                    </div>
                  )}
                </div>
                <span className="mt-0.5 shrink-0 text-[11px] text-faint">{l.when}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
