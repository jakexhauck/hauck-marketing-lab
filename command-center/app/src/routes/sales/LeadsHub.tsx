import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Megaphone,
  Inbox,
  MessagesSquare,
  MessageSquare,
  Mail,
  Phone,
  CalendarClock,
  CalendarRange,
  MoreHorizontal,
  Zap,
  Check,
  MapPin,
  Send,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import Shell from "../../components/Shell";
import PageTabs from "../../components/PageTabs";
import { LEADS_TABS } from "../../lib/pageTabs";
import Avatar from "../../components/Avatar";
import { useToast } from "../../context/ToastContext";
import { cn } from "../../lib/cn";
import { useLeadsHub } from "../../hooks/useLeadsHub";
import {
  SOURCE_META,
  STATUS_META,
  FU_OUTCOME,
  automationNote,
  isNew,
  nextSteps,
  seqFor,
  newCount,
  type HubLead,
  type LeadSource,
  type LeadMessage,
  type StepChannel,
} from "../../lib/leadsHub";
import { NotConnectedNotice, GATED_NOTE } from "./shared";

// The merged Leads surface: Paid Ads + Estimate Forms + Chat Widget on one page,
// three in-line tabs, each tailored to its source. Paid Ads + Estimate Forms show
// their own follow-up automation tracker; every source opens the conversation
// inline and works the lead with a Next-step popup. Populated in demo/preview; a
// real session shows the empty, not-connected state.

const SOURCE_ICON: Record<LeadSource, typeof Megaphone> = {
  ad: Megaphone,
  form: Inbox,
  chat: MessagesSquare,
};

const TAB_ORDER: LeadSource[] = ["ad", "form", "chat"];

const TAB_COPY: Record<LeadSource, { grpNew: string; grpRest: string; empty: string }> = {
  ad: {
    grpNew: "Needs a human",
    grpRest: "In the sequence",
    empty: "Leads from your paid ads land here on auto follow-up. See where each one is and if they replied.",
  },
  form: {
    grpNew: "New submissions",
    grpRest: "Earlier",
    empty: "Every estimate request from your website. Click a contact to open the conversation.",
  },
  chat: {
    grpNew: "New chats",
    grpRest: "Earlier",
    empty: "Every chat from your website bubble. Click a contact to open the conversation.",
  },
};

function channelIcon(ch: StepChannel) {
  return ch === "email" ? Mail : ch === "call" ? Phone : MessageSquare;
}

export default function LeadsHub() {
  const { leads, demo } = useLeadsHub();
  const { showToast } = useToast();
  const gated = () => showToast(GATED_NOTE);

  const [tab, setTab] = useState<LeadSource>("ad");
  const [selId, setSelId] = useState<Record<LeadSource, string | null>>({
    ad: null,
    form: null,
    chat: null,
  });
  const [channel, setChannel] = useState<"sms" | "email">("sms");
  const [modalOpen, setModalOpen] = useState(false);
  const [mobileDetail, setMobileDetail] = useState(false);

  // Fixed two-pane app (panes scroll, the page does not). Measure this pane's
  // offset from the document top (= the height of any app-wide banners above it)
  // and size to exactly the space left, so it is pixel-correct with or without a
  // banner. Below lg the phone layout scrolls naturally.
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

  const forTab = useMemo(() => leads.filter((l) => l.source === tab), [leads, tab]);
  const fresh = forTab.filter(isNew);
  const rest = forTab.filter((l) => !isNew(l));

  // Auto-open the first lead that needs attention so the conversation shows.
  const currentSel = selId[tab] ?? fresh[0]?.id ?? forTab[0]?.id ?? null;
  const selected = forTab.find((l) => l.id === currentSel) ?? null;

  function pick(id: string) {
    setSelId((m) => ({ ...m, [tab]: id }));
    setChannel("sms");
    setMobileDetail(true);
  }
  function switchTab(next: LeadSource) {
    setTab(next);
    setChannel("sms");
    setModalOpen(false);
    setMobileDetail(false);
  }

  // --- Empty / not-connected (real session) ---------------------------------
  if (!demo || leads.length === 0) {
    return (
      <Shell>
        <div className="flex min-h-0 w-full flex-1 flex-col px-5 pb-12 pt-6 lg:px-6">
          <PageTabs tabs={LEADS_TABS} />
          <header className="mb-5">
            <h1 className="font-display text-[22px] leading-none text-text">Leads</h1>
            <p className="mt-1.5 text-sm text-muted">
              Every new lead from your ads, estimate forms, and website chat, in one place.
            </p>
          </header>
          <div className="mb-5">
            <NotConnectedNotice message="New leads from your paid ads, website forms, and chat widget land here automatically once your accounts and phone are connected." />
          </div>
          <div className="flex flex-1 flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-border bg-surface py-16 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-faint">
              <Zap size={22} />
            </div>
            <p className="mt-3 font-display text-[15px] text-text">No leads yet</p>
            <p className="mt-1 max-w-xs text-[13px] text-muted">
              When someone responds to an ad, fills out a form, or messages your chat widget,
              they show up here ready to work.
            </p>
          </div>
        </div>
      </Shell>
    );
  }

  // --- Populated (demo / preview) -------------------------------------------
  return (
    <Shell>
      {/* Primary Leads nav: New Leads (this page) vs Pipeline (the board). Sits
          above the measured pane so the pane self-sizes to the space left. */}
      <div className="px-5 pt-4 lg:px-6">
        <PageTabs tabs={LEADS_TABS} />
      </div>
      <div
        ref={rootRef}
        className="flex min-h-0 flex-col"
        style={paneHeight ? { height: paneHeight, overflow: "hidden" } : undefined}
      >
        {/* Top bar: title + the three in-line tabs */}
        <div className="flex items-center gap-5 border-b border-border bg-surface px-5 py-3.5 lg:px-6">
          <h1 className="hidden font-display text-[19px] font-semibold leading-none text-text sm:block">
            Leads
          </h1>
          <div className="flex gap-1 rounded-[13px] bg-surface-2 p-1">
            {TAB_ORDER.map((s) => {
              const meta = SOURCE_META[s];
              const Icon = SOURCE_ICON[s];
              const n = newCount(leads, s);
              const on = tab === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => switchTab(s)}
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
                    <span
                      className={cn(
                        "rounded-full px-1.5 text-[11px] font-bold tabular-nums",
                        on ? "bg-brand-tint text-brand-text" : "bg-surface-3 text-muted",
                      )}
                    >
                      {n}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Two-pane body */}
        <div className="grid min-h-0 flex-1 lg:grid-cols-[380px_1fr]">
          {/* List */}
          <aside
            className={cn(
              "flex min-h-0 flex-col border-border bg-surface lg:border-r",
              mobileDetail ? "hidden lg:flex" : "flex",
            )}
          >
            <div className="flex items-center gap-2 border-b border-divider px-[18px] py-3">
              <span className="font-display text-[12.5px] font-semibold text-text">
                {SOURCE_META[tab].label}
              </span>
              <span className="ml-auto text-[11.5px] text-faint">
                {tab === "ad" ? `${forTab.length} leads` : `${fresh.length} new`}
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {fresh.length > 0 && <GroupLabel text={`${TAB_COPY[tab].grpNew} · ${fresh.length}`} />}
              {fresh.map((l) => (
                <LeadRow key={l.id} lead={l} active={l.id === currentSel} onClick={() => pick(l.id)} />
              ))}
              {rest.length > 0 && <GroupLabel text={`${TAB_COPY[tab].grpRest} · ${rest.length}`} />}
              {rest.map((l) => (
                <LeadRow key={l.id} lead={l} active={l.id === currentSel} onClick={() => pick(l.id)} />
              ))}
              {forTab.length === 0 && (
                <p className="px-5 py-10 text-center text-[13px] text-faint">All caught up here.</p>
              )}
            </div>
          </aside>

          {/* Detail */}
          <section
            className={cn(
              "min-h-0 flex-col bg-[var(--bg)]",
              mobileDetail ? "flex" : "hidden lg:flex",
            )}
          >
            {selected ? (
              <Detail
                lead={selected}
                channel={channel}
                onChannel={setChannel}
                onBack={() => setMobileDetail(false)}
                onNextStep={() => setModalOpen(true)}
                onGated={gated}
              />
            ) : (
              <EmptyDetail source={tab} />
            )}
          </section>
        </div>
      </div>

      {modalOpen && selected && (
        <NextStepModal lead={selected} onClose={() => setModalOpen(false)} onPick={gated} />
      )}
    </Shell>
  );
}

// --- List bits --------------------------------------------------------------

function GroupLabel({ text }: { text: string }) {
  return (
    <div className="px-[18px] pb-1 pt-3 text-[10px] font-bold uppercase tracking-wider text-faint">
      {text}
    </div>
  );
}

function LeadRow({ lead, active, onClick }: { lead: HubLead; active: boolean; onClick: () => void }) {
  const isAd = lead.source === "ad";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 border-b border-divider px-4 py-3 text-left transition-colors",
        active ? "bg-brand-tint" : "hover:bg-surface-2",
      )}
    >
      <Avatar name={lead.name} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-display text-[13.5px] font-semibold text-text">{lead.name}</span>
          {!isAd && isNew(lead) && (
            <span className="rounded-[5px] bg-brand-tint px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wide text-brand-text">
              New
            </span>
          )}
          <span className="ml-auto shrink-0 text-[10.5px] text-faint">{lead.when}</span>
        </div>
        {isAd ? (
          <>
            <div className="mt-1 flex items-center gap-1.5 text-[10.5px] text-faint">
              <Megaphone size={11} /> <span className="truncate">{lead.ad}</span>
            </div>
            <div className="mt-2 flex items-center gap-2.5">
              <FuDots lead={lead} />
              <FuChip lead={lead} />
            </div>
          </>
        ) : (
          <>
            <p className="mt-0.5 truncate text-[12px] text-muted">
              {lead.source === "chat" ? `“${lead.preview}”` : lead.intent}
            </p>
            {lead.fu && (
              <div className="mt-1.5">
                <FuChip lead={lead} />
              </div>
            )}
          </>
        )}
      </div>
    </button>
  );
}

// --- Follow-up tracker bits -------------------------------------------------

function FuDots({ lead }: { lead: HubLead }) {
  const seq = seqFor(lead);
  if (!lead.fu || seq.length === 0) return null;
  const { sent, respondedAt } = lead.fu;
  return (
    <span className="inline-flex items-center gap-1.5">
      {seq.map((_, i) => {
        const replied = respondedAt > 0 && i === respondedAt - 1;
        return (
          <span
            key={i}
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              replied ? "bg-positive ring-[3px] ring-positive-tint" : i < sent ? "bg-brand" : "bg-surface-3",
            )}
          />
        );
      })}
    </span>
  );
}

function FuChip({ lead }: { lead: HubLead }) {
  if (!lead.fu) return null;
  const o = FU_OUTCOME[lead.fu.outcome];
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold"
      style={{ color: o.color, background: `color-mix(in srgb, ${o.color} 12%, transparent)` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: o.color }} />
      {o.label}
    </span>
  );
}

function FuTrack({ lead }: { lead: HubLead }) {
  const seq = seqFor(lead);
  if (!lead.fu || seq.length === 0) return null;
  const { sent, respondedAt } = lead.fu;
  return (
    <div className="flex items-start">
      {seq.map((s, i) => {
        const done = i < sent;
        const replied = respondedAt > 0 && i === respondedAt - 1;
        const reached = done || replied;
        const Icon = channelIcon(s.channel);
        return (
          <div key={i} className="relative flex min-w-0 flex-1 flex-col items-center text-center">
            {i > 0 && (
              <span
                className={cn(
                  "absolute right-1/2 top-[12px] h-0.5 w-full",
                  i < sent ? "bg-brand" : "bg-border",
                )}
              />
            )}
            <span
              className={cn(
                "relative z-[1] grid h-[26px] w-[26px] place-items-center rounded-full border-2",
                replied
                  ? "border-transparent bg-positive text-white ring-4 ring-positive-tint"
                  : done
                    ? "border-transparent bg-brand-tint text-brand-text"
                    : "border-border bg-surface-2 text-faint",
              )}
            >
              {reached ? <Check size={12} /> : <Icon size={12} />}
            </span>
            <span className={cn("mt-2 text-[11.5px] font-semibold", reached ? "text-text" : "text-faint")}>
              {s.label}
            </span>
            <span className={cn("mt-px text-[10px]", replied ? "font-semibold text-positive" : "text-faint")}>
              {replied ? "replied here" : done ? `sent · ${s.delay}` : s.delay}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// --- Detail -----------------------------------------------------------------

function EmptyDetail({ source }: { source: LeadSource }) {
  const Icon = SOURCE_ICON[source];
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-10 text-center text-faint">
      <div className="grid h-14 w-14 place-items-center rounded-2xl border border-border bg-surface text-faint">
        <Icon size={26} />
      </div>
      <div>
        <div className="font-display text-[15px] font-semibold text-muted">Select a contact</div>
        <div className="mt-1 max-w-[260px] text-[12.5px]">{TAB_COPY[source].empty}</div>
      </div>
    </div>
  );
}

function StatusPill({ lead }: { lead: HubLead }) {
  const color = {
    new: "var(--brand)",
    working: "var(--warning)",
    booked: "#0284c7",
    won: "var(--positive)",
    cold: "var(--faint)",
  }[lead.status];
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold"
      style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}
    >
      {STATUS_META[lead.status].label}
    </span>
  );
}

function SourceBadge({ source }: { source: LeadSource }) {
  const meta = SOURCE_META[source];
  const Icon = SOURCE_ICON[source];
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-muted">
      <span className="grid h-[18px] w-[18px] place-items-center rounded-md text-white" style={{ background: meta.accent }}>
        <Icon size={11} />
      </span>
      {meta.label}
    </span>
  );
}

function Detail({
  lead,
  channel,
  onChannel,
  onBack,
  onNextStep,
  onGated,
}: {
  lead: HubLead;
  channel: "sms" | "email";
  onChannel: (c: "sms" | "email") => void;
  onBack: () => void;
  onNextStep: () => void;
  onGated: () => void;
}) {
  const first = lead.name.replace(/^The\s+/, "").split(" ")[0];
  const emails = lead.emails ?? [];
  const thread = channel === "sms" ? lead.sms : emails;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface px-5 py-3.5 lg:px-[22px]">
        <button
          type="button"
          onClick={onBack}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 lg:hidden"
          aria-label="Back to list"
        >
          <ChevronLeft size={18} />
        </button>
        <Avatar name={lead.name} size="md" />
        <div className="min-w-0 flex-1">
          <div className="font-display text-[16.5px] font-semibold text-text">{lead.name}</div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11.5px] text-muted">
            <span className="inline-flex items-center gap-1">
              <MapPin size={12} className="text-faint" /> {lead.location} · {lead.zip}
            </span>
            <span className="inline-flex items-center gap-1">
              <Phone size={12} className="text-faint" /> {lead.phone}
            </span>
          </div>
        </div>
        <SourceBadge source={lead.source} />
        <StatusPill lead={lead} />
        <button
          type="button"
          onClick={onNextStep}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 font-display text-[13px] font-semibold text-white shadow-[var(--shadow-brand)]"
          style={{ backgroundImage: "var(--grad-brand)" }}
        >
          <Zap size={15} /> Next step
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 lg:px-[22px]">
        {/* Follow-up sequence */}
        {lead.fu && (
          <div className="mb-6">
            <div className="mb-3.5 flex items-center gap-2">
              <span className="text-[12.5px] font-bold uppercase tracking-wide text-faint">
                Follow-up sequence
              </span>
              <span className="ml-auto">
                <FuChip lead={lead} />
              </span>
            </div>
            <FuTrack lead={lead} />
            <div className="mt-4 flex items-start gap-2.5 text-[12px] leading-snug text-muted">
              <Zap size={15} className="mt-px shrink-0 text-brand-text" />
              <span>{automationNote(lead)}</span>
            </div>
          </div>
        )}

        {/* Conversation */}
        <div className="mb-2">
          <div className="mb-3.5 flex items-center gap-2">
            <div className="inline-flex rounded-[10px] bg-surface-2 p-[3px]">
              <ChannelTab
                icon={<MessageSquare size={14} />}
                label="SMS"
                count={lead.sms.length}
                active={channel === "sms"}
                onClick={() => onChannel("sms")}
              />
              <ChannelTab
                icon={<Mail size={14} />}
                label="Email"
                count={emails.length}
                active={channel === "email"}
                onClick={() => onChannel("email")}
              />
            </div>
          </div>
          {thread.length > 0 ? (
            <div className="flex flex-col gap-3">
              {thread.map((m, i) => (
                <Bubble key={i} m={m} />
              ))}
            </div>
          ) : (
            <p className="py-7 text-center text-[12.5px] text-faint">
              No {channel === "sms" ? "texts" : "emails"} in this thread yet.
            </p>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="flex items-center gap-2.5 border-t border-border bg-surface px-5 py-3 lg:px-[22px]">
        <span className="hidden shrink-0 rounded-lg bg-brand-tint px-2.5 py-2 text-[11.5px] font-semibold text-brand-text sm:inline-flex">
          {channel === "email" ? "Reply by Email" : lead.source === "chat" ? "Reply in chat" : "Reply by SMS"}
        </span>
        <input
          placeholder={`${channel === "email" ? "Email" : "Message"} ${first}…`}
          className="flex-1 rounded-[10px] border border-border bg-[var(--bg)] px-3 py-2.5 text-[13px] text-text outline-none placeholder:text-faint focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
        <button
          type="button"
          onClick={onGated}
          aria-label="Send"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-white"
          style={{ backgroundImage: "var(--grad-brand)" }}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
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
        "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors",
        active ? "bg-surface text-text shadow-[var(--shadow-sm)]" : "text-muted hover:text-text",
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

function Bubble({ m }: { m: LeadMessage }) {
  const out = m.dir === "out";
  return (
    <div className={cn("flex max-w-[82%] flex-col", out && "ml-auto items-end")}>
      <div
        className={cn(
          "mb-1 flex items-center gap-1.5 text-[10px] font-semibold",
          out ? "text-brand-text/80" : "text-faint",
        )}
      >
        {m.from}
        {m.auto && (
          <span
            className={cn(
              "rounded px-1.5 text-[8.5px] font-bold uppercase tracking-wide",
              out ? "bg-brand-tint text-brand-text" : "bg-surface-3 text-muted",
            )}
          >
            auto
          </span>
        )}
        <span className="font-normal text-faint">· {m.at}</span>
      </div>
      <div
        className={cn(
          "rounded-[13px] px-3.5 py-2.5 text-[13px] leading-relaxed",
          out ? "rounded-br-[4px] text-white" : "rounded-bl-[4px] border border-border bg-surface text-text",
        )}
        style={out ? { backgroundImage: "var(--grad-brand)" } : undefined}
      >
        {m.body}
      </div>
    </div>
  );
}

// --- Next-step popup --------------------------------------------------------

function NextStepModal({ lead, onClose, onPick }: { lead: HubLead; onClose: () => void; onPick: () => void }) {
  const stepIcon: Record<string, typeof Phone> = {
    call: Phone,
    book: CalendarClock,
    schedule: CalendarClock,
    visit: CalendarRange,
    other: MoreHorizontal,
  };
  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-[rgba(15,18,48,0.42)] p-5"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[470px] overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface shadow-[var(--shadow-lg)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-[22px] pb-1.5 pt-5">
          <div className="min-w-0 flex-1">
            <div className="font-display text-[16.5px] font-semibold text-text">Next step with {lead.name}</div>
            <div className="mt-0.5 text-[12.5px] text-muted">
              {lead.source === "ad"
                ? "Cold lead from a paid ad. Get them on an intro call."
                : "Warm lead. Quotes happen on the phone."}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-surface-2 text-muted"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex flex-col gap-2.5 px-[22px] pb-[22px] pt-3">
          {nextSteps(lead.source).map((s) => {
            const Icon = stepIcon[s.key] ?? MoreHorizontal;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => {
                  onPick();
                  onClose();
                }}
                className={cn(
                  "flex items-start gap-3 rounded-[13px] p-3.5 text-left transition-colors",
                  s.primary ? "bg-brand-tint" : "bg-surface-2 hover:bg-brand-tint",
                )}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-surface text-brand-text">
                  <Icon size={17} />
                </span>
                <div className="min-w-0">
                  <div className="font-display text-[14px] font-semibold text-text">{s.title}</div>
                  <div className="mt-0.5 text-[11.5px] leading-snug text-muted">{s.desc}</div>
                  {s.auto && (
                    <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-surface px-2.5 py-1.5 text-[11px] leading-snug text-brand-text">
                      <Zap size={13} className="mt-px shrink-0" />
                      <span>{s.auto}</span>
                    </div>
                  )}
                </div>
                <ChevronRight size={16} className="ml-auto mt-1 shrink-0 text-faint" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
