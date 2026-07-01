import { useMemo, useState } from "react";
import {
  Megaphone,
  MapPin,
  Phone,
  PhoneCall,
  CalendarClock,
  CheckCircle2,
  MoreHorizontal,
  ArrowUpRight,
  X,
  Send,
  RotateCcw,
  Ban,
  PhoneOff,
  CalendarX,
} from "lucide-react";
import Shell from "../../components/Shell";
import Avatar from "../../components/Avatar";
import { Badge } from "../../components/ui";
import { useToast } from "../../context/ToastContext";
import { cn } from "../../lib/cn";
import { usePaidAdsLeads } from "../../hooks/usePaidAdsLeads";
import {
  STAGE_META,
  FILTER_GROUPS,
  PLATFORM_META,
  JOURNEY_STEPS,
  groupCounts,
  type AdLead,
  type StageKey,
} from "../../lib/paidAdsPipeline";
import { NotConnectedNotice, GATED_NOTE } from "./shared";

// The Paid Ads (Sales) surface: a friendly, lead-first worklist over the GHL
// Paid Ad's Pipeline. Leads are the heroes — each row shows where it sits in the
// real pipeline (stage pill + journey bar). Clicking a lead opens its detail
// with the intro-call action bar (Call now / Book intro call / Confirm / Other);
// a confirmed call hands off to the Intro Calls page. Populated in demo/preview;
// a real session shows the empty, not-connected state.

const stageToGroup = new Map<StageKey, string>();
for (const g of FILTER_GROUPS) for (const s of g.stages) stageToGroup.set(s, g.key);

export default function PaidAdsSales() {
  const { demo, leads } = usePaidAdsLeads();
  const { showToast } = useToast();
  const gated = () => showToast(GATED_NOTE);

  const [filter, setFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bookFor, setBookFor] = useState<AdLead | null>(null);

  const counts = useMemo(() => groupCounts(leads), [leads]);
  const visible = useMemo(
    () => (filter === "all" ? leads : leads.filter((l) => stageToGroup.get(l.stage) === filter)),
    [leads, filter],
  );
  const selected = leads.find((l) => l.id === selectedId) ?? null;

  // --- Empty / not-connected (real session) ---------------------------------
  if (!demo || leads.length === 0) {
    return (
      <Shell>
        <div className="flex min-h-0 w-full flex-1 flex-col px-5 pb-12 pt-6 lg:px-6">
          <header className="mb-5">
            <h1 className="font-display text-[22px] leading-none text-text">Paid Ads</h1>
            <p className="mt-1.5 text-sm text-muted">
              Leads from your paid ads, worked to a booked intro call.
            </p>
          </header>
          <div className="mb-5">
            <NotConnectedNotice message="Leads from your paid ads land here automatically once your Meta ad account and phone are connected." />
          </div>
          <div className="flex flex-1 flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-border bg-surface py-16 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-faint">
              <Megaphone size={22} />
            </div>
            <p className="mt-3 font-display text-[15px] text-text">No paid leads yet</p>
            <p className="mt-1 max-w-xs text-[13px] text-muted">
              When someone responds to one of your paid ads, they show up here, ready for an
              intro call.
            </p>
          </div>
        </div>
      </Shell>
    );
  }

  // --- Populated worklist (demo / preview) ----------------------------------
  return (
    <Shell>
      <div className="w-full px-5 pb-16 pt-6 lg:px-6">
        <header className="mb-4">
          <h1 className="font-display text-[22px] leading-none text-text">Paid Ads</h1>
          <p className="mt-1.5 text-sm text-muted">
            {leads.length} active leads · cold traffic, qualified by an intro call
          </p>
        </header>

        <FunnelStrip counts={counts} />

        {/* Filter chips */}
        <div className="mb-3 mt-4 flex gap-2 overflow-x-auto pb-1">
          <FilterChip
            label="All"
            count={leads.length}
            tone="neutral"
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />
          {FILTER_GROUPS.map((g) =>
            counts[g.key] > 0 ? (
              <FilterChip
                key={g.key}
                label={g.label}
                count={counts[g.key]}
                tone={g.tone}
                active={filter === g.key}
                onClick={() => setFilter(g.key)}
                dot
              />
            ) : null,
          )}
        </div>

        {/* The list */}
        <div className="flex flex-col gap-2.5">
          {visible.map((lead) => (
            <LeadRow
              key={lead.id}
              lead={lead}
              onOpen={() => setSelectedId(lead.id)}
              onCall={gated}
              onBook={() => setBookFor(lead)}
              onConfirm={gated}
            />
          ))}
          {visible.length === 0 && (
            <p className="py-12 text-center text-[13px] text-faint">No leads in this stage.</p>
          )}
        </div>
      </div>

      {/* Slide-over detail */}
      <LeadDrawer
        lead={selected}
        onClose={() => setSelectedId(null)}
        onGated={gated}
        onBook={() => selected && setBookFor(selected)}
      />

      {/* Book intro call dialog */}
      <BookDialog lead={bookFor} onClose={() => setBookFor(null)} onBook={gated} />
    </Shell>
  );
}

// --- Funnel summary ---------------------------------------------------------

function FunnelStrip({ counts }: { counts: Record<string, number> }) {
  const active = FILTER_GROUPS.filter((g) => g.key !== "parked");
  const parked = counts["parked"] ?? 0;
  return (
    <div className="hidden items-center gap-1 rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-3 sm:flex">
      {active.map((g, i) => (
        <div key={g.key} className="flex items-center">
          <div className="text-center">
            <div className={cn("font-display text-[17px] font-semibold leading-none", toneText(g.tone))}>
              {counts[g.key] ?? 0}
            </div>
            <div className="mt-1 text-[9.5px] uppercase tracking-wide text-muted">{g.label}</div>
          </div>
          {i < active.length - 1 && <span className="mx-3 text-faint">→</span>}
        </div>
      ))}
      <div className="ml-auto flex items-center gap-2 border-l border-divider pl-4">
        <span className="font-display text-[15px] font-semibold leading-none text-danger">{parked}</span>
        <span className="text-[9.5px] uppercase tracking-wide text-muted">Parked</span>
      </div>
    </div>
  );
}

function toneText(tone: string) {
  return {
    brand: "text-brand-text",
    positive: "text-positive",
    warning: "text-warning",
    danger: "text-danger",
    neutral: "text-text",
  }[tone] ?? "text-text";
}

// --- Filter chip ------------------------------------------------------------

function FilterChip({
  label,
  count,
  tone,
  active,
  onClick,
  dot,
}: {
  label: string;
  count: number;
  tone: string;
  active: boolean;
  onClick: () => void;
  dot?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] font-semibold transition-colors",
        active
          ? "border-brand bg-brand-tint text-brand-text"
          : "border-border bg-surface text-muted hover:bg-surface-2",
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", dotClass(tone))} aria-hidden />}
      {label}
      <span className="font-bold opacity-70">{count}</span>
    </button>
  );
}

function dotClass(tone: string) {
  return {
    brand: "bg-brand",
    positive: "bg-positive",
    warning: "bg-warning",
    danger: "bg-danger",
    neutral: "bg-faint",
  }[tone] ?? "bg-faint";
}

// --- Lead row ---------------------------------------------------------------

function LeadRow({
  lead,
  onOpen,
  onCall,
  onBook,
  onConfirm,
}: {
  lead: AdLead;
  onOpen: () => void;
  onCall: () => void;
  onBook: () => void;
  onConfirm: () => void;
}) {
  const meta = STAGE_META[lead.stage];
  const plat = PLATFORM_META[lead.platform];
  const offramp = meta.kind === "offramp";

  function quick(e: React.MouseEvent, fn: () => void) {
    e.stopPropagation();
    fn();
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group flex items-center gap-3.5 rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-3 text-left transition-all hover:border-brand/40 hover:shadow-[var(--shadow-sm)]",
        offramp && "opacity-75",
      )}
    >
      <Avatar name={lead.name} size="md" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-display text-[14px] font-semibold text-text">{lead.name}</span>
          <span className="hidden items-center gap-1 text-[11px] text-muted sm:inline-flex">
            <MapPin size={11} className="text-faint" /> {lead.location} · {lead.zip}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[12.5px] text-muted">{lead.intent}</p>
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-[6px] bg-surface-2 px-1.5 py-0.5 text-[9.5px] font-semibold text-muted">
            {plat.glyph} {lead.adName}
          </span>
          {lead.detail && (
            <span className="hidden truncate text-[10.5px] text-faint sm:inline">· {lead.detail}</span>
          )}
        </div>
      </div>

      {/* Stage + journey */}
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <Badge tone={meta.tone} className="px-2 py-0.5 text-[10px]">
          {lead.stage === "apt_completed" && lead.quote ? `Quote · $${lead.quote}` : meta.short}
        </Badge>
        <JourneyBar stage={lead.stage} />
      </div>

      {/* Quick actions (hover, desktop) */}
      <div className="hidden shrink-0 items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 lg:flex">
        {meta.kind === "active" && (meta.step ?? 0) <= 2 ? (
          <>
            <QuickBtn title="Call now" onClick={(e) => quick(e, onCall)}><Phone size={14} /></QuickBtn>
            <QuickBtn title="Book intro call" onClick={(e) => quick(e, onBook)}><CalendarClock size={14} /></QuickBtn>
          </>
        ) : lead.stage === "intro_call_waiting" ? (
          <>
            <QuickBtn title="Confirm call" onClick={(e) => quick(e, onConfirm)}><CheckCircle2 size={14} /></QuickBtn>
            <QuickBtn title="Call now" onClick={(e) => quick(e, onCall)}><Phone size={14} /></QuickBtn>
          </>
        ) : (
          <QuickBtn title="Open" onClick={(e) => quick(e, onOpen)}><ArrowUpRight size={14} /></QuickBtn>
        )}
      </div>

      <span className="shrink-0 text-[10.5px] text-faint">{lead.time}</span>
    </button>
  );
}

function QuickBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <span
      role="button"
      title={title}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-[9px] border border-border bg-surface text-muted transition-colors hover:border-brand hover:bg-brand-tint hover:text-brand-text"
    >
      {children}
    </span>
  );
}

// 5-segment journey bar. Active stages fill up to their step; off-ramps light
// the first segment in danger.
function JourneyBar({ stage }: { stage: StageKey }) {
  const meta = STAGE_META[stage];
  const offramp = meta.kind === "offramp";
  return (
    <div className="flex items-center gap-[3px]" aria-hidden>
      {Array.from({ length: JOURNEY_STEPS }).map((_, i) => {
        const filled = !offramp && i < (meta.step ?? 0);
        const off = offramp && i === 0;
        return (
          <span
            key={i}
            className={cn(
              "h-[5px] w-4 rounded-full",
              off ? "bg-danger" : filled ? "bg-brand" : "bg-surface-3",
            )}
          />
        );
      })}
    </div>
  );
}

// --- Slide-over drawer ------------------------------------------------------

function LeadDrawer({
  lead,
  onClose,
  onGated,
  onBook,
}: {
  lead: AdLead | null;
  onClose: () => void;
  onGated: () => void;
  onBook: () => void;
}) {
  const [otherOpen, setOtherOpen] = useState(false);
  const open = lead !== null;

  return (
    <>
      {/* Scrim */}
      <div
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-[rgba(15,18,48,0.32)] transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-hidden
      />
      {/* Panel */}
      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-surface shadow-[var(--shadow-lg)] transition-transform duration-200 sm:w-[404px]",
          open ? "translate-x-0" : "translate-x-full",
        )}
        role="dialog"
        aria-label="Lead detail"
      >
        {lead && (
          <DrawerBody
            lead={lead}
            onClose={() => {
              setOtherOpen(false);
              onClose();
            }}
            onGated={onGated}
            onBook={onBook}
            otherOpen={otherOpen}
            setOtherOpen={setOtherOpen}
          />
        )}
      </aside>
    </>
  );
}

function DrawerBody({
  lead,
  onClose,
  onGated,
  onBook,
  otherOpen,
  setOtherOpen,
}: {
  lead: AdLead;
  onClose: () => void;
  onGated: () => void;
  onBook: () => void;
  otherOpen: boolean;
  setOtherOpen: (v: boolean) => void;
}) {
  const meta = STAGE_META[lead.stage];
  const plat = PLATFORM_META[lead.platform];
  const first = lead.name.split(" ")[0];

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-4 sm:px-5">
        <Avatar name={lead.name} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="font-display text-[16px] font-semibold text-text">{lead.name}</div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11.5px] text-muted">
            <span className="inline-flex items-center gap-1">
              <MapPin size={12} className="text-faint" /> {lead.location} · {lead.zip}
            </span>
            <span className="inline-flex items-center gap-1">
              <Phone size={12} className="text-faint" /> {lead.phone}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2"
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        {/* Stage + source */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={meta.tone}>{meta.label}</Badge>
          <span className="inline-flex items-center gap-1 rounded-[6px] bg-surface-2 px-2 py-1 text-[10.5px] font-semibold text-muted">
            {plat.glyph} {lead.adName}
          </span>
        </div>

        {/* Where the lead came from (honours the real pipeline) */}
        <div className="mt-3.5 rounded-[var(--radius-lg)] border border-border bg-[var(--bg)] px-3.5 py-3 text-[12px]">
          <div className="mb-1.5 text-[9.5px] font-bold uppercase tracking-wide text-faint">
            Where this lead came from
          </div>
          <div className="text-text">
            <Megaphone size={12} className="mr-1 inline text-brand-text" />
            &ldquo;{lead.adName}&rdquo; ad · {plat.label}
          </div>
          <div className="mt-1.5 text-[11px] text-muted">
            Pipeline stage:{" "}
            <span className="font-semibold text-text">{meta.ghlName}</span>
          </div>
          {lead.detail && <div className="mt-1 text-[11px] text-muted">{lead.detail}</div>}
        </div>

        {/* Intro-call action bar */}
        <div className="mt-4">
          <div className="mb-2.5 flex items-baseline gap-2">
            <span className="font-display text-[13px] font-semibold text-text">
              What&apos;s the next step?
            </span>
            <span className="text-[11px] text-faint">cold lead, get the intro call</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <ActionTile
              icon={<PhoneCall size={14} />}
              title="Call now"
              desc="Ring them, opens the Call Console."
              route="→ Call Console"
              primary
              onClick={onGated}
            />
            <ActionTile
              icon={<CalendarClock size={14} />}
              title="Book intro call"
              desc="Pick a time, fire the confirm text."
              route="→ Awaiting confirmation"
              onClick={onBook}
            />
            <ActionTile
              icon={<CheckCircle2 size={14} />}
              title="Confirm call"
              desc="They tapped confirm — hand to Sales."
              route="→ Intro Calls"
              confirm
              onClick={onGated}
            />
            <div className="relative">
              <ActionTile
                icon={<MoreHorizontal size={14} />}
                title="Other"
                desc="No answer · not qualified · parked."
                route="→ Off-ramp"
                onClick={() => setOtherOpen(!otherOpen)}
              />
              {otherOpen && <OffRampMenu onPick={onGated} />}
            </div>
          </div>
        </div>

        {/* Conversation */}
        <div className="mb-2.5 mt-5 text-[9.5px] font-bold uppercase tracking-wide text-brand-text">
          Conversation
        </div>
        <div className="flex flex-col gap-2.5">
          {lead.sms.map((m, i) => (
            <Bubble key={i} out={m.dir === "out"} who={m.from} auto={m.auto} body={m.body} />
          ))}
        </div>
      </div>

      {/* Composer (SMS) */}
      <div className="flex items-center gap-2.5 border-t border-border px-4 py-3 sm:px-5">
        <input
          placeholder={`Text ${first}…`}
          className="flex-1 rounded-[10px] border border-border bg-[var(--bg)] px-3 py-2.5 text-[13px] text-text outline-none placeholder:text-faint focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
        <button
          type="button"
          onClick={onGated}
          aria-label="Send"
          className="grid h-9.5 w-9.5 shrink-0 place-items-center rounded-[10px] text-white"
          style={{ backgroundImage: "var(--grad-brand)" }}
        >
          <Send size={16} />
        </button>
      </div>
    </>
  );
}

function ActionTile({
  icon,
  title,
  desc,
  route,
  primary,
  confirm,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  route: string;
  primary?: boolean;
  confirm?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-[12px] border p-2.5 text-left transition-all",
        primary
          ? "border-brand bg-brand-tint"
          : confirm
            ? "border-positive/40 bg-positive-tint"
            : "border-border bg-surface hover:border-brand/40 hover:bg-surface-2",
      )}
    >
      <div className="flex items-center gap-1.5 font-display text-[13px] font-semibold text-text">
        <span className={confirm ? "text-positive" : "text-brand-text"}>{icon}</span>
        {title}
      </div>
      <div className="mt-1 text-[10.5px] leading-snug text-muted">{desc}</div>
      <div
        className={cn(
          "mt-1.5 text-[9.5px] font-bold uppercase tracking-wide",
          confirm ? "text-positive" : "text-brand-text",
        )}
      >
        {route}
      </div>
    </button>
  );
}

function OffRampMenu({ onPick }: { onPick: () => void }) {
  const opts: { icon: React.ReactNode; label: string; note?: string; bad?: boolean }[] = [
    { icon: <PhoneOff size={14} />, label: "No answer / voicemail", note: "auto-retry" },
    { icon: <RotateCcw size={14} />, label: "Follow up — not ready" },
    { icon: <Ban size={14} />, label: "Not qualified", bad: true },
    { icon: <CalendarX size={14} />, label: "Intro call — no confirmation", bad: true },
  ];
  return (
    <div className="absolute bottom-full right-0 z-10 mb-2 w-60 rounded-[12px] border border-border bg-surface p-1.5 shadow-[var(--shadow-lg)]">
      {opts.map((o, i) => (
        <button
          key={i}
          type="button"
          onClick={onPick}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-[12.5px] font-medium transition-colors hover:bg-surface-2",
            o.bad ? "text-danger" : "text-text",
          )}
        >
          <span className={o.bad ? "text-danger" : "text-faint"}>{o.icon}</span>
          {o.label}
          {o.note && <span className="ml-auto text-[10px] text-faint">{o.note}</span>}
        </button>
      ))}
    </div>
  );
}

function Bubble({
  out,
  who,
  auto,
  body,
}: {
  out: boolean;
  who: string;
  auto?: boolean;
  body: string;
}) {
  return (
    <div className={cn("flex max-w-[86%] flex-col", out && "ml-auto items-end")}>
      <div
        className={cn(
          "mb-1 flex items-center gap-1.5 text-[9.5px] font-semibold",
          out ? "text-brand-text/70" : "text-faint",
        )}
      >
        {who}
        {auto && (
          <span
            className={cn(
              "rounded px-1.5 py-px text-[8.5px] font-bold uppercase tracking-wide",
              out ? "bg-brand-tint text-brand-text" : "bg-surface-3 text-muted",
            )}
          >
            auto
          </span>
        )}
      </div>
      <div
        className={cn(
          "rounded-[12px] px-3 py-2 text-[12.5px] leading-relaxed",
          out ? "rounded-br-[4px] text-white" : "rounded-bl-[4px] border border-border bg-surface text-text",
        )}
        style={out ? { backgroundImage: "var(--grad-brand)" } : undefined}
      >
        {body}
      </div>
    </div>
  );
}

// --- Book intro call dialog -------------------------------------------------

function BookDialog({
  lead,
  onClose,
  onBook,
}: {
  lead: AdLead | null;
  onClose: () => void;
  onBook: () => void;
}) {
  const [slot, setSlot] = useState<string | null>("Thu 2:00 PM");
  if (!lead) return null;
  const days = [
    { day: "Thursday, Jul 2", slots: ["10:00", "2:00 PM", "4:30"] },
    { day: "Friday, Jul 3", slots: ["9:30", "1:00", "3:30"] },
  ];
  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-[60] bg-[rgba(15,18,48,0.4)]"
        aria-hidden
      />
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div className="w-full max-w-[420px] overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-lg)]">
          <div className="border-b border-border px-5 py-4">
            <h3 className="font-display text-[15.5px] font-semibold text-text">
              Book intro call · {lead.name}
            </h3>
            <p className="mt-0.5 text-[12px] text-muted">
              Pick a slot. A confirmation text fires automatically.
            </p>
          </div>
          <div className="px-5 py-4">
            {days.map((d) => (
              <div key={d.day} className="mb-3 last:mb-0">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  {d.day}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {d.slots.map((s) => {
                    const id = `${d.day.split(",")[0]} ${s}`;
                    const on = slot === id || (slot === "Thu 2:00 PM" && id === "Thursday 2:00 PM");
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSlot(id)}
                        className={cn(
                          "rounded-[10px] border px-3 py-2 text-center font-display text-[12.5px] font-medium transition-colors",
                          on
                            ? "border-brand bg-brand-tint text-brand-text"
                            : "border-border text-text hover:bg-surface-2",
                        )}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 border-t border-border bg-surface-2 px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[10px] border border-border bg-surface px-3.5 py-2 font-display text-[12px] font-semibold text-text hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onBook();
                onClose();
              }}
              className="rounded-[10px] px-3.5 py-2 font-display text-[12px] font-semibold text-white"
              style={{ backgroundImage: "var(--grad-brand)" }}
            >
              Book + send confirm
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
