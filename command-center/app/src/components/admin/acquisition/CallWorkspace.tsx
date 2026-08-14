import { useEffect, useState } from "react";
import {
  Phone,
  PhoneOff,
  CalendarClock,
  CalendarCheck,
  Ban,
  UserX,
  ThumbsDown,
  ChevronRight,
  Moon,
  CheckCircle2,
  Globe,
  TriangleAlert,
} from "lucide-react";
import type { AdminLead, ColdCallDialOutcome } from "../../../lib/api";
import { metaFor } from "../../../lib/adminLeads";
import { useUpdateAdminLead } from "../../../hooks/useAdminLeads";
import {
  useColdCallCallbackSlots,
  useColdCallCrm,
  useLogColdCallDial,
} from "../../../hooks/useColdCall";
import { ghlContactUrl } from "../../../lib/setterModel";
import { useColdCallScripts } from "../../../hooks/useColdCallAssets";
import { resolveScriptId, useSelectedScriptId } from "../../../lib/selectedScript";
import {
  ZONE_CHOICES,
  isOutsideCallingHours,
  localTimeLabel,
  pickedZone,
  zoneForLead,
} from "../../../lib/leadLocalTime";
import BookingPanel from "./BookingPanel";
import CallbackPicker from "./CallbackPicker";
import { stageAfterNoAnswer } from "../../../lib/coldCallStages";
import type { NO_OUTCOMES } from "../../../../functions/lib/coldCallDials";
import { formatPhoneDashed } from "../../../lib/phone";

// One of the three ways a call ends in no. Named here rather than inlined so the
// button handlers and sayNo cannot drift apart.
type NoOutcome = (typeof NO_OUTCOMES)[number];

// The calling workspace: a queue on the left, the one prospect being called on
// the right, five buttons for how it went.
//
// Shared by Leads (the cold queue) and Callbacks (people who asked to be called
// back), because they are the same job. The only differences are which leads go
// in and what the left column is called, so those are props and nothing else is.
//
// Pressing an outcome does two things: it moves the lead on, and it appends one
// row to cold_call_dials (0052). That second write is what the Cold Call tracker
// and the Scoreboard count, so the daily numbers are a record of buttons pressed
// rather than figures somebody typed at the end of the day.
//
// The five outcomes exist because four could not tell "hung up on hello" from
// "heard the pitch and said no", and the difference between those two is the
// pass-through rate. See functions/lib/coldCallDials.ts for what each counts as.
//
// Each button also names a stage of the Cold Calling pipeline in the agency's
// GoHighLevel account, and pressing it moves the prospect there (0053). Every
// label carries the stage's own name for exactly that reason: it is the same
// thing said twice, so nobody has to translate between the two systems. That is
// why the third button reads "Call back" and not "Hot lead": the stage it moves
// a prospect into, on the live board, is Call Back. There is no Hot Lead stage
// on that pipeline at all.

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function fullName(lead: AdminLead): string {
  return `${lead.firstName} ${lead.lastName}`.trim() || "Unnamed prospect";
}

// Digits only, so a number typed as "(555) 010-9999" still dials.
function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export interface QueueBadge {
  text: string;
  tone: "late" | "now" | "soon";
}

interface Props {
  leads: AdminLead[];
  // Left column heading, e.g. "To call" or "Due back".
  queueTitle: string;
  // Shown in the left column when the list is empty, and in the right pane.
  emptyTitle: string;
  emptyHint: string;
  // Optional per-row chip, used by Callbacks for Overdue / Today / a date.
  badgeFor?: (lead: AdminLead) => QueueBadge | null;
}

// The prospect's own clock, re-read every half minute. Their time is the one
// thing on this card that changes while you look at it.
function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export default function CallWorkspace({
  leads,
  queueTitle,
  emptyTitle,
  emptyHint,
  badgeFor,
}: Props) {
  const updateLead = useUpdateAdminLead();
  const logDial = useLogColdCallDial();
  // Loaded with the workspace rather than when the panel opens: the picker
  // appears on a click mid-call, and a spinner where the times should be is a
  // pause in a conversation.
  const callbackSlots = useColdCallCallbackSlots();
  // Which GoHighLevel sub-account to send a dial to. Loaded once for the whole
  // workspace, not per prospect: it is the same string all shift.
  const crmLocationId = useColdCallCrm().data?.locationId ?? "";

  // Which dialing variation this call is being made from (0058). Read here
  // rather than passed down, so no component between this and the script panel
  // has to carry a prop it has no use for.
  //
  // resolveScriptId falls back to the first variation when nobody has picked
  // one, which is what makes the attribution hold for a caller who never opens
  // the panel. The server checks the id again before storing it, so this is a
  // claim rather than the last word.
  const scripts = useColdCallScripts();
  const shelfScriptId = resolveScriptId(useSelectedScriptId(), scripts);
  // An override for this call, set from the picker on the card. Null falls back
  // to whichever variation the script panel is on, so a caller who never
  // touches this still records against something real.
  //
  // Held per prospect rather than globally: switching prospect should not
  // silently carry the last one's variation over, and going back to a prospect
  // mid-shift should find the same one selected.
  const [scriptByLead, setScriptByLead] = useState<Record<string, string>>({});
  const now = useNow();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Callback and Booked both need a date before they mean anything, so the
  // button opens an inline date field rather than writing a guess.
  const [pending, setPending] = useState<"callback" | "booked" | "no" | null>(null);
  const [pendingDate, setPendingDate] = useState("");
  // The time on that date, optional (0064). Empty means the day was agreed and
  // nothing more, which is what a lot of prospects actually say.
  const [pendingTime, setPendingTime] = useState("");

  // Selection follows the list: no explicit pick means the top, and a lead that
  // leaves the list hands over to whoever is now in its place.
  const selectedIndex = selectedId ? leads.findIndex((l) => l.id === selectedId) : 0;
  const selected = leads[selectedIndex >= 0 ? selectedIndex : 0] ?? null;

  // What this call will be attributed to: this prospect's pick if one was made,
  // otherwise the shelf's. The server checks the id again before storing it, so
  // this is a claim rather than the last word.
  const chosen = selected ? scriptByLead[selected.id] : undefined;
  const scriptId = (chosen && scripts.some((s) => s.id === chosen) ? chosen : null) ?? shelfScriptId;
  const setCallScriptId = (id: string | null) => {
    if (!selected || !id) return;
    setScriptByLead((prev) => ({ ...prev, [selected.id]: id }));
  };

  const advance = (fromId: string) => {
    const i = leads.findIndex((l) => l.id === fromId);
    const next = leads[i + 1] ?? leads[0] ?? null;
    setSelectedId(next && next.id !== fromId ? next.id : null);
    setPending(null);
    setPendingDate("");
  };

  // The attempt is recorded first and the lead moved second. If the dial write
  // fails the lead still moves on: losing the count of one call is a smaller
  // wrong than stranding a prospect the caller has finished with.
  const logOutcome = (
    lead: AdminLead,
    outcome: ColdCallDialOutcome,
    fields: Record<string, unknown>,
    // Carried through to GoHighLevel, where they become the callback task and
    // the time it is due.
    followUpDate?: string,
    followUpTime?: string,
  ) => {
    logDial.mutate({ leadId: lead.id, outcome, followUpDate, followUpTime, scriptId });
    updateLead.mutate({ id: lead.id, ...fields } as Parameters<typeof updateLead.mutate>[0]);
    advance(lead.id);
  };

  // Every outcome except a fresh callback clears the follow-up date. Otherwise a
  // prospect who was called back stays on the Callbacks page forever and the
  // page stops being a list of things to do.
  const noAnswer = (lead: AdminLead) =>
    logOutcome(lead, "no_answer", {
      // The two dial stages are the count: attempt one lands on Day 1, anything
      // after that on Day 2.
      status: stageAfterNoAnswer(lead.noAnswer + 1),
      noAnswer: lead.noAnswer + 1,
      lastContact: today(),
      firstContactDate: lead.firstContactDate ?? today(),
      followUpDate: null,
    });

  // Every no lands in the same stage; what differs is how far the call got, and
  // that is what the reporting needs. spoke/pitched are derived from the outcome
  // SERVER-side (DIAL_OUTCOMES), so nothing here can claim a call reached the
  // pitch when it did not, which is the one rule the commission numbers rest on.
  const sayNo = (lead: AdminLead, outcome: NoOutcome) => {
    logDial.mutate({ leadId: lead.id, outcome, scriptId });
    updateLead.mutate({
      id: lead.id,
      status: "Not Interested",
      lastContact: today(),
      firstContactDate: lead.firstContactDate ?? today(),
      followUpDate: null,
    } as Parameters<typeof updateLead.mutate>[0]);
    advance(lead.id);
  };

  // Callback is a local date; Booked is a real appointment on the agency
  // calendar and is written by the booking endpoint, not here.
  const confirmCallback = (lead: AdminLead) => {
    if (!pendingDate) return;
    logOutcome(
      lead,
      "callback",
      {
        status: "Call Back",
        followUpDate: pendingDate,
        // Sent even when empty, which is what clears a time from a prospect
        // who has been rescheduled to "just that day".
        followUpTime: pendingTime || null,
        lastContact: today(),
        firstContactDate: lead.firstContactDate ?? today(),
      },
      pendingDate,
      pendingTime || undefined,
    );
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_1fr]">
      {/* The queue */}
      <div className="pk-card overflow-hidden rounded-[var(--radius-lg)] border border-border">
        <div className="flex items-center justify-between border-b border-divider px-4 py-3">
          <span className="font-display text-[14px] font-semibold">{queueTitle}</span>
          <span className="font-mono text-[12px] text-muted">{leads.length}</span>
        </div>
        {leads.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-muted">{emptyHint}</p>
        ) : (
          <ul className="max-h-[62dvh] overflow-y-auto">
            {leads.map((lead) => {
              const on = selected?.id === lead.id;
              const badge = badgeFor?.(lead) ?? null;
              return (
                <li key={lead.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(lead.id);
                      setPending(null);
                    }}
                    className={[
                      "flex w-full items-center gap-3 border-b border-divider px-4 py-3 text-left transition-colors",
                      on ? "bg-surface-2" : "hover:bg-surface-2",
                    ].join(" ")}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: metaFor(lead.status).swatch }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      {/* The business, same as the card. Scanning a queue for
                          "Reid Roofing" is how somebody finds their place; the
                          contact's first name rarely is. */}
                      <span className="block truncate text-[13.5px] font-medium">
                        {lead.businessName || fullName(lead)}
                      </span>
                      <span className="block truncate font-mono text-[12px] text-muted">
                        {formatPhoneDashed(lead.phone) || "No number"}
                      </span>
                    </span>
                    {badge && (
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{
                          background:
                            badge.tone === "late"
                              ? "color-mix(in srgb, var(--danger) 14%, transparent)"
                              : badge.tone === "now"
                                ? "var(--brand-tint)"
                                : "var(--surface-2)",
                          color:
                            badge.tone === "late"
                              ? "var(--danger)"
                              : badge.tone === "now"
                                ? "var(--brand-text)"
                                : "var(--text-muted)",
                        }}
                      >
                        {badge.text}
                      </span>
                    )}
                    {on && !badge && (
                      <ChevronRight size={15} className="shrink-0 text-brand" aria-hidden />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* The call */}
      {selected ? (
        <div className="pk-card rounded-[var(--radius-lg)] border border-border p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              {/* The business leads, because that is who is being called. The
                  person who answers is the second line. Until 0059 there was no
                  business name at all and `source` sat in this slot, which meant
                  the card's largest text was often the name of a spreadsheet. */}
              <h2 className="font-display text-[22px] font-semibold tracking-[-0.02em]">
                {selected.businessName || fullName(selected)}
              </h2>
              <p className="mt-1 text-[13px] text-muted">
                {selected.businessName && fullName(selected) !== "Unnamed prospect"
                  ? fullName(selected)
                  : selected.source || "No source recorded"}
              </p>
              <ProspectFacts lead={selected} />
              <LocalTime
                lead={selected}
                now={now}
                // Saved the moment it is chosen. Mid-call is the wrong time to
                // hunt for a Save button, and the same PATCH the notes use
                // already rolls itself back if the write fails.
                onZone={(timezone) =>
                  updateLead.mutate({ id: selected.id, timezone } as Parameters<
                    typeof updateLead.mutate
                  >[0])
                }
              />
            </div>
            <span className="font-mono text-[12px] text-muted">
              {selected.noAnswer > 0
                ? `${selected.noAnswer} no-answer${selected.noAnswer === 1 ? "" : "s"}`
                : "First attempt"}
            </span>
          </div>

          <DialRow lead={selected} locationId={crmLocationId} />

          {selected.email && (
            <p className="mt-2 font-mono text-[12.5px] text-muted">{selected.email}</p>
          )}

          <LeadNotes
            key={selected.id}
            value={selected.notes}
            onSave={(notes) =>
              updateLead.mutate({ id: selected.id, notes } as Parameters<
                typeof updateLead.mutate
              >[0])
            }
          />

          <GhlState lead={selected} />

          <div className="mt-6">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1" style={{ marginBottom: 10 }}>
              <div className="pk-section-h" style={{ margin: 0 }}>
                How did it go
              </div>
              {/* Which script this outcome will be recorded against, and the
                  place to change it. Here beside the buttons that do the
                  recording, because a number attributed to a script somebody
                  did not know they were on is not a measurement of anything.
                  Picking here is per prospect: a caller testing two variations
                  switches between them call by call, which is the whole point
                  of a script test. */}
              {scripts.length > 0 ? (
                <label className="flex items-center gap-2 text-[11.5px] text-faint">
                  Recording against
                  <select
                    className="pk-select !py-1 !text-[12px]"
                    value={scriptId ?? ""}
                    onChange={(e) => setCallScriptId(e.target.value || null)}
                    aria-label="Which script this call is testing"
                  >
                    {scripts.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <span className="text-[11.5px] text-faint">
                  No script to record against yet
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <OutcomeButton icon={PhoneOff} label="No answer" onClick={() => noAnswer(selected)} />
              {/* The three ways a call ends in no, as buttons rather than one
                  button that then asks why. Recording a no used to take two
                  clicks and two vocabularies at the exact moment somebody has
                  just been told no and wants the next number.

                  They are ordered by how far the call got, so the row reads as a
                  scale: never qualified, never pitched, pitched and declined.
                  Only the last is a pass-through. */}
              <OutcomeButton
                icon={UserX}
                label="Not qualified"
                title="You spoke to them and they do not qualify. Not counted as a pitch."
                onClick={() => sayNo(selected, "not_qualified")}
              />
              <OutcomeButton
                icon={Ban}
                label="Heard opener, said no"
                title="They said no during the opener, so the pitch never happened. Not counted as a pitch."
                onClick={() => sayNo(selected, "opener_no")}
              />
              <OutcomeButton
                icon={ThumbsDown}
                label="Heard pitch, said no"
                title="They heard the whole pitch and declined. Counts as a pass-through."
                onClick={() => sayNo(selected, "pitch_no")}
              />
              <OutcomeButton
                icon={CalendarClock}
                label="Call back"
                title="They heard the pitch and gave you a next step. Asks when to ring them."
                on={pending === "callback"}
                onClick={() => {
                  setPending(pending === "callback" ? null : "callback");
                  setPendingDate("");
                  setPendingTime("");
                }}
              />
              <OutcomeButton
                icon={CalendarCheck}
                label="Booked"
                on={pending === "booked"}
                onClick={() => {
                  setPending(pending === "booked" ? null : "booked");
                  setPendingDate("");
                }}
              />
            </div>

            {pending === "callback" && (
              <CallbackPicker
                // Agency-wide, so two callers cannot promise the same 1pm.
                taken={callbackSlots.data?.taken ?? []}
                leadId={selected.id}
                date={pendingDate}
                time={pendingTime}
                onChange={({ date, time }) => {
                  setPendingDate(date);
                  setPendingTime(time);
                }}
                onConfirm={() => confirmCallback(selected)}
              />
            )}

            {pending === "booked" && (
              <BookingPanel
                lead={selected}
                onBooked={() => {
                  // The endpoint already wrote the lead and the appointment, so
                  // all that is left is the record of the call. Logged HERE
                  // rather than when the button was pressed: a recorded booking
                  // that never made it onto the calendar would be a lie the
                  // Scoreboard repeats every month.
                  logDial.mutate({ leadId: selected.id, outcome: "booked", scriptId });
                  advance(selected.id);
                }}
                onCancel={() => setPending(null)}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="pk-card grid place-items-center rounded-[var(--radius-lg)] border border-border p-10 text-center">
          <div>
            <p className="font-display text-[16px] font-semibold">{emptyTitle}</p>
            <p className="mt-1 text-[13px] text-muted">{emptyHint}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// What time it is where the prospect is, a word when that time is one nobody
// should be rung at, and the means to correct it.
//
// The clock is the lead's own timezone if it holds anything, and otherwise an
// inference from the area code, labelled as one. That inference is wrong for a
// handful of numbers by design: several states straddle a zone line. The caller
// learns where somebody actually is in the first ten seconds, so the picker is
// here, next to the clock it fixes, rather than on a settings page nobody opens
// mid-call.
//
// "From the area code" is the absence of a value rather than a value: choosing
// it clears the lead's timezone and puts the inference back.
//
// The picker shows even when neither source says anything, which is the one case
// this used to render nothing at all for. A prospect whose area code means
// nothing is exactly the one worth setting by hand. The TIME still hides in that
// case: a guessed clock would be worse than none, since the whole point is to be
// trusted before dialing.
function LocalTime({
  lead,
  now,
  onZone,
}: {
  lead: AdminLead;
  now: number;
  onZone: (zone: string) => void;
}) {
  const zone = zoneForLead(lead);
  const late = zone ? isOutsideCallingHours(zone.zone, now) : false;

  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px]">
      {zone && (
        <span
          className={late ? "font-semibold text-danger" : "text-text"}
          title={zone.zone}
        >
          {localTimeLabel(zone.zone, now)}
        </span>
      )}
      <select
        // pk-select, because it is the class that paints our own chevron rather
        // than leaving an OS widget in the middle of the call card.
        //
        // Sized inline, not with utilities. PillarKit injects its CSS from a
        // <style> tag, so .pk-select's width:100% and 8px padding beat any
        // Tailwind class here and the control comes out full width and clipped.
        // Narrowed to its content and shrunk a step, so it reads as a note
        // beside the clock rather than a form to fill in.
        className="pk-select"
        style={{ width: "auto", padding: "3px 28px 3px 9px", fontSize: 12 }}
        value={pickedZone(lead)}
        aria-label="Their timezone"
        onChange={(e) => onZone(e.target.value)}
      >
        <option value="">{zone ? "From the area code" : "Set their timezone"}</option>
        {ZONE_CHOICES.map((c) => (
          <option key={c.zone} value={c.zone}>
            {c.label}
          </option>
        ))}
      </select>
      {late && (
        <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-[11.5px] font-semibold text-danger">
          <Moon size={12} aria-hidden />
          Outside 8am-9pm there
        </span>
      )}
    </p>
  );
}

// How the call gets placed.
//
// GoHighLevel first, because the agency's softphone lives there: it dials from
// the agency number, records the call and logs it against the contact. A tel:
// link does none of that, dials from whichever handset the caller is sitting at
// and shows the prospect a personal mobile.
//
// It lands on the contact record rather than the dialer, because GoHighLevel
// exposes no way to open the dialer pre-filled (same as the Setter Suite, see
// ghlContactUrl). The caller presses the phone icon there. The named tab means a
// whole session of dialing reuses one tab instead of leaving forty behind.
//
// The plain number stays underneath, because two things need it: a caller
// working off their own phone, and anyone who simply wants to read the digits.
//
// Falls back to the old single tel: link when there is no CRM record to open,
// which is a prospect the import could not push (see GhlState below) or an
// agency GoHighLevel account that is not connected at all.
function DialRow({ lead, locationId }: { lead: AdminLead; locationId: string }) {
  const number = formatPhoneDashed(lead.phone);
  const crmUrl = lead.ghlContactId ? ghlContactUrl(locationId, lead.ghlContactId) : null;

  if (!number) {
    return (
      <p className="mt-4 flex items-center gap-3 font-mono text-[30px] font-semibold tracking-tight text-faint">
        <Phone size={22} aria-hidden />
        No number on file
      </p>
    );
  }

  if (!crmUrl) {
    return (
      <a
        href={telHref(lead.phone)}
        className="mt-4 inline-flex items-center gap-3 font-mono text-[30px] font-semibold tracking-tight text-brand hover:underline"
      >
        <Phone size={22} aria-hidden />
        {number}
      </a>
    );
  }

  return (
    <div className="mt-4">
      <a
        href={crmUrl}
        target="ghl-contact"
        rel="noopener noreferrer"
        title="Opens the prospect in GoHighLevel, where the phone icon dials from the agency number and records the call"
        className="inline-flex items-center gap-2.5 rounded-[var(--radius)] bg-brand px-5 py-3 font-display text-[16px] font-semibold text-white transition-opacity hover:opacity-90"
      >
        <Phone size={19} aria-hidden />
        Dial in GoHighLevel
      </a>
      <a
        href={telHref(lead.phone)}
        className="mt-2.5 flex items-center gap-2 font-mono text-[15px] font-semibold tracking-tight text-muted hover:text-brand hover:underline"
      >
        {number}
        <span className="font-sans text-[12px] font-normal text-faint no-underline">
          dial from this device
        </span>
      </a>
    </div>
  );
}

// Where this prospect stands in the agency's GoHighLevel account.
//
// Silent until there is something to say. A prospect nobody has called yet is
// not "missing from the CRM", it is simply not called, and a warning on all 44
// rows would train everyone to ignore the one row that matters.
function GhlState({ lead }: { lead: AdminLead }) {
  if (lead.ghlError) {
    return (
      <p className="mt-4 flex items-start gap-2 rounded-[var(--radius)] border border-danger/40 px-4 py-3 text-[12.5px] text-danger">
        <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          Not saved to GoHighLevel: {lead.ghlError} The call itself was recorded.
        </span>
      </p>
    );
  }

  if (!lead.ghlContactId) return null;

  return (
    <p className="mt-4 flex items-center gap-1.5 text-[12.5px] text-muted">
      <CheckCircle2 size={13} className="text-brand" aria-hidden />
      In GoHighLevel
    </p>
  );
}

// What the caller learns on the phone, kept for the next dial.
//
// Imported context starts here (the CSV import folds several columns into
// notes), and from then on it is whatever the last person to call wrote. Saved
// on blur rather than per keystroke: this is typed mid-call, and a PATCH per
// character would put the network in front of the conversation.
//
// Keyed by lead id at the call site, so moving to the next prospect remounts it
// and no draft can leak from one person onto another.
// Niche, where they are, and a way to see the site before dialing. Only what is
// actually known: a card full of "Unknown" teaches the reader to stop reading
// it, and every one of these is blank on a thin list.
function ProspectFacts({ lead }: { lead: AdminLead }) {
  const place = [lead.city, lead.state].filter(Boolean).join(", ");
  const href = websiteHref(lead.website);
  if (!lead.niche && !place && !href) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] text-muted">
      {lead.niche && <span className="font-medium text-text">{lead.niche}</span>}
      {lead.niche && (place || href) && <span className="text-faint">·</span>}
      {place && <span>{place}</span>}
      {place && href && <span className="text-faint">·</span>}
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-brand hover:underline"
        >
          <Globe size={12} aria-hidden />
          {lead.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
        </a>
      )}
    </div>
  );
}

// Bought lists write a website every way there is. Anything with a dot is
// treated as a domain and given a scheme; anything else is not a link and is
// not rendered as one.
function websiteHref(website: string): string | null {
  const raw = (website ?? "").trim();
  if (!raw || !raw.includes(".")) return null;
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function LeadNotes({
  value,
  onSave,
}: {
  value: string;
  onSave: (notes: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  return (
    <textarea
      className="mt-4 w-full resize-y rounded-[var(--radius)] bg-surface-2 px-4 py-3 text-[13px] leading-relaxed text-text outline-none transition-shadow placeholder:text-faint focus:shadow-[0_0_0_2px_var(--brand)]"
      rows={3}
      value={draft}
      placeholder="What you learned on this call. Saved when you click away."
      aria-label="Notes on this prospect"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onSave(draft);
      }}
    />
  );
}

function OutcomeButton({
  icon: Icon,
  label,
  title,
  on,
  onClick,
}: {
  icon: typeof Phone;
  label: string;
  title?: string;
  on?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={on}
      className={[
        "inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-[13.5px] font-semibold transition-colors",
        on
          ? "border-brand bg-brand/10 text-brand"
          : "border-border text-text hover:border-brand hover:text-brand",
      ].join(" ")}
    >
      <Icon size={15} aria-hidden />
      {label}
    </button>
  );
}
