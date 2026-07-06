import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Inbox, MessagesSquare, ChevronRight, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Shell from "../../components/Shell";
import PageTabs from "../../components/PageTabs";
import Avatar from "../../components/Avatar";
import { cn } from "../../lib/cn";
import { PAGE_CONTAINER } from "../../lib/layout";
import { LEADS_TABS } from "../../lib/pageTabs";
import { useLeadsHub } from "../../hooks/useLeadsHub";
import { organicLeads, isNew, SOURCE_META, type HubLead } from "../../lib/leadsHub";
import { NotConnectedNotice } from "./shared";

type Sub = "form" | "chat";

const SUB_META: Record<
  Sub,
  { label: string; icon: LucideIcon; accent: string; newLabel: string }
> = {
  form: {
    label: "Estimate Forms",
    icon: Inbox,
    accent: SOURCE_META.form.accent,
    newLabel: "New submissions",
  },
  chat: {
    label: "Chat",
    icon: MessagesSquare,
    accent: SOURCE_META.chat.accent,
    newLabel: "New chats",
  },
};

// Website-owned leads: estimate-form requests and chat-widget conversations, split
// into two sub-tabs. A list only: clicking a lead opens the unified Inbox with that
// conversation selected, where you reply by SMS or email.
export default function LeadsOrganic() {
  const navigate = useNavigate();
  const { leads } = useLeadsHub();
  const organic = useMemo(() => organicLeads(leads), [leads]);
  const [sub, setSub] = useState<Sub>("form");

  const forSub = organic.filter((l) => l.source === sub);
  const fresh = forSub.filter(isNew);
  const rest = forSub.filter((l) => !isNew(l));

  function openInInbox(lead: HubLead) {
    navigate(lead.contactId ? `/conversations/${lead.contactId}` : "/conversations");
  }

  const formNew = organic.filter((l) => l.source === "form" && isNew(l)).length;
  const chatNew = organic.filter((l) => l.source === "chat" && isNew(l)).length;

  return (
    <Shell>
      <div className={PAGE_CONTAINER}>
        <PageTabs tabs={LEADS_TABS} />
        <header className="mb-4">
          <h1 className="font-display text-[19px] font-semibold text-text">Organic</h1>
          <p className="mt-1 text-[13px] text-muted">
            Estimate-form requests and website chats from your own channels.
          </p>
        </header>

        {organic.length === 0 ? (
          <>
            <div className="mb-5">
              <NotConnectedNotice message="Estimate-form and website-chat leads land here automatically once your website forms and phone are connected." />
            </div>
            <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface py-16 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-faint">
                <Zap size={22} />
              </div>
              <p className="mt-3 font-display text-[15px] text-text">No organic leads yet</p>
              <p className="mt-1 max-w-xs text-[13px] text-muted">
                When someone fills out a form or messages your chat widget, they show up here.
              </p>
            </div>
          </>
        ) : (
          <>
            {/* Sub-tabs */}
            <div className="mb-4 inline-flex gap-1 rounded-[13px] bg-surface-2 p-1">
              {(["form", "chat"] as Sub[]).map((s) => {
                const meta = SUB_META[s];
                const Icon = meta.icon;
                const n = s === "form" ? formNew : chatNew;
                const on = sub === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSub(s)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-[9px] px-3.5 py-2 font-display text-[13.5px] font-semibold transition-colors",
                      on ? "bg-surface text-text shadow-[var(--shadow-sm)]" : "text-muted hover:text-text",
                    )}
                  >
                    <span
                      className="grid h-[21px] w-[21px] shrink-0 place-items-center rounded-md text-white"
                      style={{ background: meta.accent }}
                    >
                      <Icon size={12} />
                    </span>
                    {meta.label}
                    {n > 0 && (
                      <span className="rounded-full bg-brand-tint px-1.5 text-[11px] font-bold tabular-nums text-brand-text">
                        {n}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* List */}
            <ul className="overflow-hidden rounded-2xl border border-border bg-surface">
              {fresh.length > 0 && (
                <GroupLabel text={`${SUB_META[sub].newLabel} · ${fresh.length}`} />
              )}
              {fresh.map((l) => (
                <OrganicRow key={l.id} lead={l} onClick={() => openInInbox(l)} />
              ))}
              {rest.length > 0 && <GroupLabel text={`Earlier · ${rest.length}`} />}
              {rest.map((l) => (
                <OrganicRow key={l.id} lead={l} onClick={() => openInInbox(l)} />
              ))}
              {forSub.length === 0 && (
                <p className="px-5 py-10 text-center text-[13px] text-faint">
                  All caught up here.
                </p>
              )}
            </ul>

            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-brand/15 bg-brand-tint px-3.5 py-3 text-[12px] text-muted">
              <Zap size={15} className="mt-px shrink-0 text-brand-text" />
              <span>
                Clicking a lead opens your Inbox with that conversation selected, where you reply by SMS or email.
              </span>
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}

function GroupLabel({ text }: { text: string }) {
  return (
    <div className="border-b border-divider bg-surface px-[18px] pb-1.5 pt-3 text-[10px] font-bold uppercase tracking-wider text-faint">
      {text}
    </div>
  );
}

function OrganicRow({ lead, onClick }: { lead: HubLead; onClick: () => void }) {
  const preview = lead.source === "chat" ? `“${lead.preview}”` : lead.intent || lead.preview;
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 border-b border-divider px-4 py-3.5 text-left transition-colors last:border-b-0 hover:bg-surface-2"
      >
        <Avatar name={lead.name} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-display text-[14px] font-semibold text-text">
              {lead.name}
            </span>
            {isNew(lead) && (
              <span className="shrink-0 rounded-[5px] bg-brand-tint px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wide text-brand-text">
                New
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[12.5px] text-muted">{preview}</p>
          {lead.location && (
            <div className="mt-0.5 text-[11px] text-faint">
              {lead.location}
              {lead.zip ? `, ${lead.zip}` : ""}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="text-[11px] text-faint">{lead.when}</span>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-text">
            Open in Inbox <ChevronRight size={13} />
          </span>
        </div>
      </button>
    </li>
  );
}
