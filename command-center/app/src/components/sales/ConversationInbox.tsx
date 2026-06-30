import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Phone,
  CalendarClock,
  CalendarRange,
  MapPin,
  Mail,
  MoreHorizontal,
  MessageSquare,
  Send,
  ChevronLeft,
  Inbox,
  PhoneCall,
  Check,
  RotateCcw,
  X,
} from "lucide-react";
import Shell from "../Shell";
import Avatar from "../Avatar";
import { Badge } from "../ui";
import { useToast } from "../../context/ToastContext";
import { toneDot } from "../../lib/status";
import { cn } from "../../lib/cn";
import {
  STATUS_META,
  statusCounts,
  type Channel,
  type ConvMessage,
  type InboxDataset,
  type InboxLead,
  type InboxStatus,
} from "../../lib/leadInbox";
import { NotConnectedNotice } from "../../routes/sales/shared";

// The Sales conversation-inbox surface, shared by Estimate Forms and Chat
// Widget. Both are the same view over the Organic Pipeline (a list of inbound
// leads, each replying with what they want, worked to a call); only the source,
// copy, and demo data differ. A page passes its dataset + an InboxConfig of the
// copy that changes, and renders this. The right-hand detail — contact header,
// action bar (Call now / Schedule / Book visit / Other), SMS + Email threads,
// composer — is identical for every source: quotes are given on the phone,
// never over text, so the call flow is front-and-centre.

// The per-page copy that differs between sources. Everything else is identical.
export interface InboxConfig {
  // Surface name, shown as the list/empty header ("Estimate Forms").
  title: string;
  // Empty-state subtitle: a one-line description of where these leads come from.
  description: string;
  // Populated-list subtitle: the count line ("24 submissions · auto …").
  countLabel: (n: number) => string;
  // Empty-state card heading + body (real session, nothing connected).
  emptyTitle: string;
  emptyBody: string;
  // Override for the NotConnectedNotice banner (defaults to the forms copy).
  notConnectedMessage?: string;
  // Toast shown when a gated action (call, schedule, book, send) is tapped.
  gatedNote: string;
}

type Filter = "all" | InboxStatus;

export default function ConversationInbox({
  config,
  data,
}: {
  config: InboxConfig;
  data: InboxDataset;
}) {
  const { showToast } = useToast();
  const leads = data.leads;

  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(leads[0]?.id ?? null);
  // On mobile the detail takes over the screen; on desktop both show at once.
  const [mobileDetail, setMobileDetail] = useState(false);

  // Desktop is a fixed two-pane app (panes scroll, the page does not). The
  // shared Shell column is min-h-dvh, so any app-wide banner above it (demo,
  // preview, offline) would push our composer below the fold. Measure this
  // pane's offset from the document top (= the height of whatever banners sit
  // above) and size to exactly the space left, so it is pixel-correct with or
  // without a banner. Below lg we let the phone layout scroll naturally.
  const rootRef = useRef<HTMLDivElement>(null);
  const [paneHeight, setPaneHeight] = useState<string | undefined>(undefined);
  useLayoutEffect(() => {
    const measure = () => {
      const el = rootRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      setPaneHeight(`calc(100dvh - ${Math.max(0, Math.round(top))}px)`);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const counts = useMemo(() => statusCounts(leads), [leads]);
  const visible = useMemo(
    () => (filter === "all" ? leads : leads.filter((l) => l.status === filter)),
    [leads, filter],
  );

  const selected =
    leads.find((l) => l.id === selectedId) ?? visible[0] ?? leads[0] ?? null;

  function openLead(id: string) {
    setSelectedId(id);
    setMobileDetail(true);
  }

  const gated = () => showToast(config.gatedNote);

  // --- Empty / not-connected (real session) ---------------------------------
  if (!data.demo || leads.length === 0) {
    return (
      <Shell>
        <div className="flex min-h-0 w-full flex-1 flex-col px-5 pb-12 pt-6 lg:px-6">
          <header className="mb-5">
            <h1 className="font-display text-[22px] leading-none text-text">{config.title}</h1>
            <p className="mt-1.5 text-sm text-muted">{config.description}</p>
          </header>
          <div className="mb-5">
            <NotConnectedNotice message={config.notConnectedMessage} />
          </div>
          <div className="flex flex-1 flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-border bg-surface py-16 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-faint">
              <Inbox size={22} />
            </div>
            <p className="mt-3 font-display text-[15px] text-text">{config.emptyTitle}</p>
            <p className="mt-1 max-w-xs text-[13px] text-muted">{config.emptyBody}</p>
          </div>
        </div>
      </Shell>
    );
  }

  // --- Populated inbox (demo / preview) -------------------------------------
  return (
    <Shell>
      <div
        ref={rootRef}
        className="flex min-h-0 flex-col"
        style={paneHeight ? { height: paneHeight, overflow: "hidden" } : undefined}
      >
        <div className="grid min-h-0 flex-1 lg:grid-cols-[320px_1fr]">
          {/* Inbox list — hidden on mobile once a lead is open */}
          <aside
            className={cn(
              "flex min-h-0 flex-col border-border bg-surface lg:border-r",
              mobileDetail ? "hidden lg:flex" : "flex",
            )}
          >
            <div className="px-5 pb-2 pt-5">
              <h1 className="font-display text-[17px] font-semibold text-text">{config.title}</h1>
              <p className="mt-0.5 text-[12px] text-muted">{config.countLabel(leads.length)}</p>
            </div>
            <div className="flex flex-wrap gap-1.5 border-b border-divider px-4 pb-3 pt-1">
              <FilterChip label="All" active={filter === "all"} onClick={() => setFilter("all")} />
              {(Object.keys(STATUS_META) as InboxStatus[]).map((s) =>
                counts[s] > 0 ? (
                  <FilterChip
                    key={s}
                    label={`${STATUS_META[s].short} ${counts[s]}`}
                    active={filter === s}
                    onClick={() => setFilter(s)}
                  />
                ) : null,
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {visible.map((lead) => (
                <ThreadRow
                  key={lead.id}
                  lead={lead}
                  active={selected?.id === lead.id}
                  onClick={() => openLead(lead.id)}
                />
              ))}
            </div>
          </aside>

          {/* Detail — hidden on mobile until a lead is opened */}
          <section
            className={cn(
              "min-h-0 flex-col bg-[var(--bg)]",
              mobileDetail ? "flex" : "hidden lg:flex",
            )}
          >
            {selected ? (
              <LeadDetail
                lead={selected}
                onBack={() => setMobileDetail(false)}
                onGated={gated}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center text-[13px] text-faint">
                Select a conversation to see the messages.
              </div>
            )}
          </section>
        </div>
      </div>
    </Shell>
  );
}

// --- Inbox list -------------------------------------------------------------

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-2.5 py-1 text-[11.5px] font-semibold transition-colors",
        active ? "bg-brand-tint text-brand-text" : "text-muted hover:bg-surface-2",
      )}
    >
      {label}
    </button>
  );
}

function ThreadRow({
  lead,
  active,
  onClick,
}: {
  lead: InboxLead;
  active: boolean;
  onClick: () => void;
}) {
  const meta = STATUS_META[lead.status];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 border-b border-divider px-4 py-3 text-left transition-colors",
        active ? "bg-brand-tint/40 shadow-[inset_3px_0_0_var(--brand)]" : "hover:bg-surface-2",
      )}
    >
      <Avatar name={lead.name} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", toneDot[meta.tone])} aria-hidden />
          <span className="truncate font-display text-[13px] font-semibold text-text">
            {lead.name}
          </span>
          <Badge tone={meta.tone} className="ml-auto shrink-0 px-1.5 py-0 text-[9.5px]">
            {meta.short}
          </Badge>
        </div>
        <p className="mt-0.5 truncate text-[11.5px] text-faint">{lead.preview}</p>
      </div>
      <span className="shrink-0 pt-0.5 text-[10px] text-faint">{lead.time}</span>
    </button>
  );
}

// --- Detail -----------------------------------------------------------------

function LeadDetail({
  lead,
  onBack,
  onGated,
}: {
  lead: InboxLead;
  onBack: () => void;
  onGated: () => void;
}) {
  const meta = STATUS_META[lead.status];
  const [channel, setChannel] = useState<Channel>(
    lead.sms.length ? "sms" : "email",
  );
  const [callOpen, setCallOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const thread = channel === "sms" ? lead.sms : lead.emails;

  function send() {
    setDraft("");
    onGated();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Contact header */}
      <div className="flex items-center gap-3 bg-surface px-4 py-3 lg:px-5">
        <button
          type="button"
          onClick={onBack}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 lg:hidden"
          aria-label="Back to inbox"
        >
          <ChevronLeft size={18} />
        </button>
        <Avatar name={lead.name} size="md" />
        <div className="min-w-0">
          <div className="font-display text-[15px] font-semibold text-text">{lead.name}</div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-muted">
            <span className="inline-flex items-center gap-1">
              <MapPin size={12} className="text-faint" /> {lead.location} · {lead.zip}
            </span>
            <span className="inline-flex items-center gap-1">
              <Phone size={12} className="text-faint" /> {lead.phone}
            </span>
            <span className="hidden items-center gap-1 sm:inline-flex">
              <Mail size={12} className="text-faint" /> {lead.email}
            </span>
          </div>
        </div>
        <Badge tone={meta.tone} className="ml-auto shrink-0">
          {meta.label}
        </Badge>
      </div>

      {/* Top action bar */}
      <div className="border-b border-border bg-surface px-4 pb-4 lg:px-5">
        <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-display text-[12.5px] font-semibold text-text">
            What&apos;s the next step with {lead.name.split(" ")[0]}?
          </span>
          <span className="text-[11px] text-faint">move them forward</span>
        </div>
        <div className="flex gap-2">
          <ActionTile
            icon={<Phone size={14} />}
            title="Call now"
            desc="Ring them, quote on the phone."
            route="→ Job Booked / Follow up"
            active={callOpen}
            onClick={() => setCallOpen((v) => !v)}
          />
          <ActionTile
            icon={<CalendarClock size={14} />}
            title="Schedule a call"
            desc="Book a time to call back."
            route="→ Callback · on Today"
            onClick={onGated}
          />
          <ActionTile
            icon={<CalendarRange size={14} />}
            title="Book in-person visit"
            desc="Schedule an on-site estimate."
            route="→ Estimate Scheduled"
            onClick={onGated}
          />
          <button
            type="button"
            onClick={onGated}
            title="Not qualified · Out of area · No answer"
            className="grid w-11 shrink-0 place-items-center rounded-[11px] border border-border text-faint transition-colors hover:border-brand/40 hover:bg-surface-2"
          >
            <MoreHorizontal size={18} />
          </button>
        </div>

        {callOpen && (
          <div className="mt-2.5 rounded-[11px] border border-brand/25 bg-brand-tint/50 p-3.5">
            <div className="mb-2.5 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-brand-text">
              <PhoneCall size={13} /> Call now · {lead.phone}
            </div>
            <button
              type="button"
              onClick={onGated}
              className="inline-flex items-center gap-2 rounded-[10px] px-4 py-2 font-display text-[13px] font-semibold text-white"
              style={{ backgroundImage: "var(--grad-brand)" }}
            >
              <Phone size={15} /> Start call
            </button>
            <div className="mt-3 flex flex-wrap items-center gap-2.5 border-t border-dashed border-brand/20 pt-3">
              <span className="text-[11px] font-semibold text-muted">After the call, log it:</span>
              <div className="inline-flex items-center gap-1 rounded-[9px] border border-brand/30 bg-surface px-2.5 py-1.5 font-display text-[13px] font-semibold text-text">
                <span className="text-[12px] text-faint">Quoted $</span>
                <input
                  inputMode="numeric"
                  placeholder="0"
                  className="w-12 bg-transparent text-text outline-none placeholder:text-faint"
                />
              </div>
              <div className="ml-auto flex gap-1.5">
                <button
                  type="button"
                  onClick={onGated}
                  className="inline-flex items-center gap-1.5 rounded-[8px] bg-positive px-3 py-1.5 font-display text-[11.5px] font-semibold text-white"
                >
                  <Check size={13} /> Job Booked
                </button>
                <button
                  type="button"
                  onClick={onGated}
                  className="inline-flex items-center gap-1.5 rounded-[8px] border border-warning/40 bg-surface px-3 py-1.5 font-display text-[11.5px] font-semibold text-warning"
                >
                  <RotateCcw size={13} /> Follow up
                </button>
                <button
                  type="button"
                  onClick={onGated}
                  className="inline-flex items-center gap-1.5 rounded-[8px] border border-danger/40 bg-surface px-3 py-1.5 font-display text-[11.5px] font-semibold text-danger"
                >
                  <X size={13} /> Couldn&apos;t reach
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Conversation */}
      <div className="flex items-center gap-1.5 px-4 pt-3 lg:px-5">
        <ChannelTab
          icon={<MessageSquare size={13} />}
          label="SMS"
          count={lead.sms.length}
          active={channel === "sms"}
          onClick={() => setChannel("sms")}
        />
        <ChannelTab
          icon={<Mail size={13} />}
          label="Email"
          count={lead.emails.length}
          active={channel === "email"}
          onClick={() => setChannel("email")}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-5">
        {thread.length === 0 ? (
          <p className="py-10 text-center text-[12.5px] text-faint">
            No {channel === "sms" ? "text messages" : "emails"} in this thread yet.
          </p>
        ) : (
          <>
            <div className="mb-3 text-center text-[10.5px] text-faint">
              {channel === "sms" ? "SMS thread" : "Email thread"}
            </div>
            {thread.map((m, i) => (
              <MessageBubble key={i} m={m} />
            ))}
          </>
        )}
      </div>

      {/* Composer */}
      <div className="flex items-center gap-2.5 border-t border-border bg-surface px-4 py-3 lg:px-5">
        <span className="hidden shrink-0 rounded-[8px] bg-brand-tint px-2.5 py-2 font-display text-[11.5px] font-semibold text-brand-text sm:inline-flex">
          {channel === "sms" ? "Reply by SMS" : "Reply by Email"}
        </span>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) send();
          }}
          placeholder={`${channel === "sms" ? "Text" : "Email"} ${lead.name.split(" ")[0]}…`}
          className="flex-1 rounded-[10px] border border-border bg-[var(--bg)] px-3 py-2.5 text-[13px] text-text outline-none placeholder:text-faint focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
        <button
          type="button"
          onClick={() => draft.trim() && send()}
          aria-label="Send"
          className="grid h-9.5 w-9.5 shrink-0 place-items-center rounded-[10px] text-white disabled:opacity-50"
          style={{ backgroundImage: "var(--grad-brand)" }}
          disabled={!draft.trim()}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}

function ActionTile({
  icon,
  title,
  desc,
  route,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  route: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 rounded-[11px] border p-2.5 text-left transition-all",
        active
          ? "border-brand bg-brand-tint/60 ring-2 ring-brand/15"
          : "border-border bg-surface hover:border-brand/40 hover:bg-surface-2",
      )}
    >
      <div className="flex items-center gap-1.5 font-display text-[12.5px] font-semibold text-text">
        <span className="text-brand-text">{icon}</span>
        {title}
      </div>
      <div className="mt-1 hidden text-[10.5px] leading-snug text-muted sm:block">{desc}</div>
      <div className="mt-1.5 hidden text-[9.5px] font-semibold text-brand-text sm:block">{route}</div>
    </button>
  );
}

function ChannelTab({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-t-[10px] border border-b-0 px-3.5 py-2 font-display text-[12.5px] font-semibold transition-colors",
        active
          ? "border-border bg-surface text-text"
          : "border-transparent text-muted hover:text-text",
      )}
    >
      {icon}
      {label}
      <span
        className={cn(
          "rounded-full px-1.5 text-[9.5px] font-bold",
          active ? "bg-brand-tint text-brand-text" : "bg-surface-3 text-muted",
        )}
      >
        {count}
      </span>
    </button>
  );
}

function MessageBubble({ m }: { m: ConvMessage }) {
  const out = m.dir === "out";
  return (
    <div className={cn("mb-3 flex max-w-[78%] flex-col", out && "ml-auto items-end")}>
      <div
        className={cn(
          "mb-1 flex items-center gap-1.5 text-[10px] font-semibold",
          out ? "text-brand-text/70" : "text-faint",
        )}
      >
        {m.from}
        {m.auto && (
          <span
            className={cn(
              "rounded px-1.5 py-px text-[8.5px] font-bold uppercase tracking-wide",
              out ? "bg-brand-tint text-brand-text" : "bg-surface-3 text-muted",
            )}
          >
            automation
          </span>
        )}
        <span className="font-normal text-faint">· {m.at}</span>
      </div>
      <div
        className={cn(
          "rounded-[13px] px-3.5 py-2.5 text-[13px] leading-relaxed",
          out
            ? "rounded-br-[4px] text-white"
            : "rounded-bl-[4px] border border-border bg-surface text-text",
        )}
        style={out ? { backgroundImage: "var(--grad-brand)" } : undefined}
      >
        {m.body}
      </div>
    </div>
  );
}
