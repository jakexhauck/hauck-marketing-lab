import { useState } from "react";
import { Handshake, Mail, MessagesSquare, Phone, TriangleAlert, Users, X } from "lucide-react";
import Avatar from "../../Avatar";
import DialLogger from "./DialLogger";
import TagField from "./TagField";
import SlotPicker from "./SlotPicker";
import StageActions from "./StageActions";
import SetterNotesTasks from "./SetterNotesTasks";
import LeadAnsweredButton, { hasContactedTag } from "./LeadAnsweredButton";
import { Button } from "../../ui/Button";
import { useSetterLeadDetailQuery, useSetterTagsMutation } from "../../../hooks/useApi";
import { useNow } from "../../../context/NowContext";
import { formatPhone } from "../../../lib/phone";
import { timeAgo } from "../../../lib/timeAgo";
import { formatOutcome, ghlContactUrl, ghlConversationsUrl } from "../../../lib/setterModel";
import { useToast } from "../../../context/ToastContext";
import {
  confirmState,
  formatApptTime,
  isAwaitingConfirm,
  type LeadAppointment,
} from "../../../lib/setterApptConfirm";
import { isOptimisticDial } from "../../../lib/setterCockpit";
import { stageActionsFor } from "../../../lib/setterStageActions";
import type { BookingIntent } from "../../../lib/setterBooking";
import type { ApiSetterLead } from "../../../lib/api";

interface Props {
  tenantId: string;
  pipelineId: string;
  pipelineName: string;
  // The client's own CRM location, from the pipelines response. Optional
  // because it is empty while that query is still in flight or if it failed;
  // the header degrades to plain text rather than a dead link.
  locationId?: string;
  lead: ApiSetterLead;
  onClose: () => void;
  // Hands a "book this contact" intent up to the Setter Suite, which switches
  // to the Calendar tab with the booking panel pre-filled.
  onBookAppointment?: (intent: BookingIntent) => void;
  // Same hand-off for chat: switches to the Inbox tab with this contact's
  // conversation opened.
  onOpenChat?: (contactId: string, name: string) => void;
  // Fired when a stage-action tag lands: the Setter Suite locks this lead's
  // board card until the CRM automation's result is visible.
  onAutomationStart?: () => void;
  // Dial-attempt ticks for this lead's current stage, owned by the Setter
  // Suite so the board card's segment bar mirrors the cockpit's checkboxes.
  dialed: boolean[];
  onToggleDial: (index: number) => void;
  // The funnel booking this lead is being confirmed for (only set for leads
  // in an "Appt Booked" stage); inside the final 24h the cockpit shows the
  // manual-confirm banner.
  appointment?: LeadAppointment | null;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-divider px-4 py-4 first:border-t-0">
      <h3 className="label-cap mb-2.5 text-faint">{title}</h3>
      {children}
    </section>
  );
}

// Once a lead is qualified, the setter hands it to the owner. This drops the
// `lead hand off` tag on the contact; the client's GHL automation moves it to
// the Handed Off stage, where it surfaces in the owner's Sales > Leads list.
// Same tag-apply hook + invalidation the stage-outcome buttons use.
function HandoffToOwner({
  tenantId,
  contactId,
  onDone,
}: {
  tenantId: string;
  contactId: string;
  onDone?: () => void;
}) {
  const tags = useSetterTagsMutation();
  const { showToast } = useToast();
  const [done, setDone] = useState(false);

  const handoff = () => {
    if (tags.isPending || done) return;
    tags.mutate(
      { tenantId, contactId, add: ["lead hand off"] },
      {
        onSuccess: () => {
          setDone(true);
          showToast("Lead handed off to owner");
          onDone?.();
        },
        onError: () => showToast("Could not hand off, please try again"),
      },
    );
  };

  return (
    <Section title="Hand off">
      <Button
        variant="primary"
        size="md"
        className="w-full"
        disabled={tags.isPending || done}
        onClick={handoff}
      >
        <Handshake size={16} />
        {done ? "Handed off to owner" : tags.isPending ? "Handing off..." : "Hand off to owner"}
      </Button>
      <p className="mt-2 text-[12px] text-muted">
        Tags the lead <span className="font-semibold text-text">lead hand off</span> and sends it
        to the owner's Leads.
      </p>
    </Section>
  );
}

// Shown in place of tags/history when the per-lead detail fetch itself
// failed, so a request that never landed cannot be mistaken for a contact
// with no tags or no calls. Mirrors ActivityDesktop's FeedError: a danger-
// tinted panel naming what broke plus a Retry button, sized down for this
// docked panel's narrower columns.
function DetailLoadError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-danger/30 bg-danger-tint px-3 py-2.5">
      <p className="flex items-start gap-1.5 text-[12.5px] text-danger">
        <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
        Could not load {what}.
      </p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

// The lead cockpit: one selected lead's live identity, the call-logging
// form, tags, booking, and history, docked to the right of the board
// (src/routes/admin/SetterSuite.tsx). Reads its own detail off
// contactId (tags + full dial history are only on this per-lead endpoint,
// never the board list, see functions/api/admin/setter/lead/[contactId].ts),
// falling back to the board card's own fields while that request is in
// flight or if it errors, so switching leads never shows a blank panel.
export default function SetterCockpit({
  tenantId,
  pipelineId,
  pipelineName,
  locationId,
  lead,
  onClose,
  onBookAppointment,
  onOpenChat,
  onAutomationStart,
  dialed,
  onToggleDial,
  appointment,
}: Props) {
  const now = useNow();
  const apptState = appointment ? confirmState(appointment, now) : null;
  const detailQuery = useSetterLeadDetailQuery(tenantId, lead.contactId, true);
  const detail = detailQuery.data?.lead;

  const name = detail?.name || lead.name;
  const phone = detail?.phone || lead.phone;
  const email = detail?.email || "";
  // The live contact's tags where the detail has loaded, the board's copy
  // until then, so the panel is never briefly built from no tags at all.
  const tags = detail?.tags ?? lead.tags ?? [];
  // The manual-confirm banner belongs to a lead whose booking nobody has
  // confirmed; confirmation is a tag now, not a separate stage.
  const confirmDue = apptState === "due" && isAwaitingConfirm(lead.stageName, tags);
  const dials = detail?.dials ?? [];
  // Read off the live contact, so re-opening a lead the setter already spoke
  // to shows the answered state instead of offering the tag again.
  const answered = hasContactedTag(tags);

  const hasPhone = phone.replace(/[^0-9]/g, "").length >= 10;
  // Null whenever we cannot build a working link (no location resolved yet, no
  // contact id). One check, so the header never has to re-test the inputs.
  const crmUrl = ghlContactUrl(locationId ?? "", lead.contactId);

  const { showToast } = useToast();
  // Group chat: the CRM has group SMS in its UI but no public API to create
  // one (open feature request), so this is the honest v1: copy the lead's
  // name for the CRM's picker and open Conversations in the same named tab
  // the phone link reuses. Upgrade to one-click creation when the API ships.
  const conversationsUrl = ghlConversationsUrl(locationId ?? "");
  const openGroupChat = async () => {
    if (!conversationsUrl) return;
    try {
      await navigator.clipboard.writeText(name);
    } catch {
      // Clipboard needs a secure context + permission; the button still
      // works without the copy, the setter just types the name instead.
    }
    window.open(conversationsUrl, "ghl-contact", "noopener");
    showToast("Name copied · hit + and pick Group Chat in the CRM");
  };

  // Stages in a dialing pipeline render the purpose-built panel. The generic
  // cockpit below is the fallback for everything else: a lead in Sales, Trash
  // or a client-specific pipeline is not setter work, and offering it the
  // dialing buttons would let one press drag a won job back into follow-up.
  //
  // Tags are passed because the follow-up tag depends on where the lead came
  // from, which only its tags now record.
  const stageConfig = stageActionsFor(lead.stageName, pipelineName, tags);

  return (
    <aside
      className="flex w-full shrink-0 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)] lg:w-[380px] lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)]"
      aria-label="Lead cockpit"
    >
      {/* Header: identity + call, stays put while the body scrolls.

          The phone number opens the lead's CRM contact record in a new tab
          rather than being a tel: link, because the setter must dial from the
          client's business number and a tel: link dials from their own
          handset, showing the lead a personal mobile. The CRM's softphone
          owns the business number, the recording, and the call log.

          It lands on the contact record, not the dialer: the CRM exposes no
          way to open the dialer pre-filled, so the setter clicks the phone
          icon there. A named target means a whole dialing session reuses one
          tab instead of leaving forty behind. */}
      <div className="flex items-start gap-3 border-b border-divider px-4 pb-3.5 pt-4">
        <Avatar name={name} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-[15px] font-semibold text-text">{name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
            {hasPhone && crmUrl ? (
              <a
                href={crmUrl}
                target="ghl-contact"
                rel="noopener noreferrer"
                title="Open in the CRM to call from the client's number"
                className="inline-flex items-center gap-1 font-data text-brand-text hover:underline"
              >
                <Phone size={11} aria-hidden />
                {formatPhone(phone) || phone}
              </a>
            ) : hasPhone ? (
              <span className="inline-flex items-center gap-1 font-data text-muted">
                <Phone size={11} aria-hidden />
                {formatPhone(phone) || phone}
              </span>
            ) : (
              <span className="text-faint">No phone on file</span>
            )}
            {email && (
              <a
                href={`mailto:${email}`}
                className="inline-flex min-w-0 items-center gap-1 truncate text-brand-text hover:underline"
              >
                <Mail size={11} aria-hidden className="shrink-0" />
                <span className="truncate">{email}</span>
              </a>
            )}
          </div>
          <div className="mt-1.5 truncate text-[11px] text-faint">{lead.stageName}</div>
        </div>
        {conversationsUrl && (
          <button
            type="button"
            onClick={openGroupChat}
            title="Create a group chat in the CRM (copies this lead's name)"
            aria-label="Create a group chat in the CRM"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-2 text-muted transition-colors hover:bg-surface-3 hover:text-brand-text"
          >
            <Users size={14} />
          </button>
        )}
        {onOpenChat && (
          <button
            type="button"
            onClick={() => onOpenChat(lead.contactId, name)}
            title="Open this conversation in the Inbox"
            aria-label="Open this conversation in the Inbox"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-2 text-muted transition-colors hover:bg-surface-3 hover:text-brand-text"
          >
            <MessagesSquare size={14} />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close lead cockpit"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-2 text-muted transition-colors hover:bg-surface-3 hover:text-text"
        >
          <X size={14} />
        </button>
      </div>

      {/* Body: everything below scrolls on its own, the board above/behind
          it keeps whatever scroll position it was at.

          A stage configured in setterStageActions.ts renders its own
          purpose-built dialing panel and nothing else. Every other stage keeps
          the original cockpit (log call, tags, book, history) until we build
          out that stage. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* The lead's funnel booking. Inside the final 24h with the lead
            still in the Appt Booked stage (= never confirmed), this turns
            into the manual-confirm alert. */}
        {appointment && (
          <div
            className={
              "mx-4 mt-3 rounded-[var(--radius)] border px-3 py-2.5 " +
              (confirmDue
                ? "border-danger/30 bg-danger-tint"
                : "border-border bg-surface-2")
            }
          >
            <p
              className={
                "text-[12.5px] font-semibold " + (confirmDue ? "text-danger" : "text-text")
              }
            >
              {apptState === "passed" ? "Appointment passed · " : "Appointment · "}
              {formatApptTime(appointment.startMs)}
            </p>
            {confirmDue && (
              <p className="mt-0.5 text-[12px] leading-snug text-danger">
                Under 24 hours out and still unconfirmed. Call the lead and
                confirm this appointment manually.
              </p>
            )}
          </div>
        )}
        {stageConfig ? (
          <>
            <StageActions
              tenantId={tenantId}
              contactId={lead.contactId}
              leadName={name}
              phone={phone}
              email={email}
              config={stageConfig}
              onBookAppointment={onBookAppointment}
              onAutomationStart={onAutomationStart}
              dialed={dialed}
              onToggleDial={onToggleDial}
              answered={answered}
              appointment={appointment}
            />
            {/* Read-only: the stage panel's own buttons are the only tag
                writers here, this just shows what is already on the live
                contact so the setter can see prior automation state. */}
            <Section title="Tags on contact">
              {detailQuery.isError ? (
                <DetailLoadError what="tags" onRetry={() => detailQuery.refetch()} />
              ) : detailQuery.isLoading ? (
                <p className="text-[12.5px] text-muted">Loading tags...</p>
              ) : tags.length === 0 ? (
                <p className="text-[12.5px] text-faint">No tags on this contact yet.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[11.5px] font-semibold text-muted"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </Section>
          </>
        ) : (
          <>
        <Section title="Answered the phone">
          <LeadAnsweredButton
            tenantId={tenantId}
            contactId={lead.contactId}
            answered={answered}
          />
        </Section>

        <Section title="Log this call">
          <DialLogger tenantId={tenantId} pipelineId={pipelineId} pipelineName={pipelineName} lead={lead} />
        </Section>

        <Section title="Tags">
          {detailQuery.isError ? (
            <DetailLoadError what="tags" onRetry={() => detailQuery.refetch()} />
          ) : (
            <TagField tenantId={tenantId} contactId={lead.contactId} tags={tags} dials={dials} />
          )}
        </Section>

        <Section title="Book an estimate">
          <SlotPicker tenantId={tenantId} contactId={lead.contactId} leadName={name} />
        </Section>

        <Section title="Call history">
          {detailQuery.isLoading ? (
            <p className="text-[12.5px] text-muted">Loading history...</p>
          ) : detailQuery.isError ? (
            <DetailLoadError what="call history" onRetry={() => detailQuery.refetch()} />
          ) : dials.length === 0 ? (
            <p className="text-[12.5px] text-faint">No dials logged yet.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {dials.map((d) => (
                <li
                  key={d.id}
                  className={
                    "rounded-[var(--radius)] border px-3 py-2.5 " +
                    (isOptimisticDial(d.id)
                      ? "border-dashed border-brand/40 bg-brand-tint/40"
                      : "border-border bg-surface-2")
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display text-[12.5px] font-semibold text-text">
                      {formatOutcome(d.outcome)}
                    </span>
                    <span className="font-data shrink-0 text-[11px] text-faint">
                      {timeAgo(d.dialedAt, now)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span
                      className={
                        "rounded-full px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide " +
                        (d.spoke ? "bg-positive-tint text-positive" : "bg-surface-3 text-faint")
                      }
                    >
                      {d.spoke ? "Spoke" : "No answer"}
                    </span>
                    {isOptimisticDial(d.id) && (
                      <span className="text-[10px] font-medium text-faint">Saving...</span>
                    )}
                  </div>
                  {d.note && (
                    <p className="mt-1.5 whitespace-pre-wrap break-words text-[12px] text-muted">
                      {d.note}
                    </p>
                  )}
                  {d.tagsApplied.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {d.tagsApplied.map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium text-muted"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
          </>
        )}

        {/* Every stage, both branches: the hand-off to the owner, then notes on
            the live contact record and a direct task creator. */}
        <HandoffToOwner
          tenantId={tenantId}
          contactId={lead.contactId}
          onDone={onAutomationStart}
        />
        <SetterNotesTasks tenantId={tenantId} contactId={lead.contactId} leadName={name} />
      </div>
    </aside>
  );
}
