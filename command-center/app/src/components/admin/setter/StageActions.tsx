import { useEffect, useState } from "react";
import { CalendarPlus } from "lucide-react";
import SetterTaskModal from "./SetterTaskModal";
import { Button } from "../../ui/Button";
import {
  useSetterTagsMutation,
  useSetterCalendarsQuery,
  useCancelSetterAppointment,
} from "../../../hooks/useApi";
import { useToast } from "../../../context/ToastContext";
import type { StageAction, StageActionConfig } from "../../../lib/setterStageActions";
import type { LeadAppointment } from "../../../lib/setterApptConfirm";
import type { BookingIntent } from "../../../lib/setterBooking";

// The stage-specific cockpit body. A row of visual dial checkboxes (purely
// visual, reset per lead), a grid of outcome buttons that each apply one CRM
// tag (that client's GHL automation is what moves the lead), and a Book
// appointment control: pick the appointment type (a calendar) here, then jump
// to the Calendar tab with this contact and type pre-filled. A button flagged
// promptTask opens the follow-up task prompt once its tag is applied.

interface Props {
  tenantId: string;
  contactId: string;
  leadName: string;
  phone: string;
  email: string;
  config: StageActionConfig;
  onBookAppointment?: (intent: BookingIntent) => void;
  // Fired once a stage-action tag has landed on the CRM contact (and any
  // follow-up task prompt is done): the suite locks this lead's card while
  // the client's automation acts on the tag. Closing the cockpit is the
  // caller's side of that, so it must NOT fire while the task modal is
  // still open or the modal would unmount under the setter.
  onAutomationStart?: () => void;
  // Dial-attempt ticks, owned by the Setter Suite (keyed contact+stage) so
  // the board card's segment bar mirrors these checkboxes. May be shorter
  // than config.dials; missing entries are unticked.
  dialed: boolean[];
  onToggleDial: (index: number) => void;
  // The lead's tracked booking, required by actions flagged
  // cancelAppointment. Null/undefined when no live booking was found; those
  // actions still tag but tell the setter to cancel in the CRM by hand.
  appointment?: LeadAppointment | null;
}

export default function StageActions({
  tenantId,
  contactId,
  leadName,
  phone,
  email,
  config,
  onBookAppointment,
  onAutomationStart,
  dialed,
  onToggleDial,
  appointment,
}: Props) {
  const { showToast } = useToast();
  const tagsMutation = useSetterTagsMutation();
  const cancelMutation = useCancelSetterAppointment();
  const [pendingTag, setPendingTag] = useState<string | null>(null);
  const [taskOpen, setTaskOpen] = useState(false);
  // True when a promptTask action's tag has landed and the automation lock
  // is owed as soon as the task modal closes.
  const [lockAfterTask, setLockAfterTask] = useState(false);

  const dialCount = config.dials ?? 0;

  // The client's booking calendars are the appointment types. Default to the
  // first so Book is usable immediately; the setter can switch it.
  const calendarsQuery = useSetterCalendarsQuery(tenantId, !!onBookAppointment);
  const calendars = calendarsQuery.data?.calendars ?? [];
  const firstCalendarId = calendars[0]?.id ?? "";
  const [calendarId, setCalendarId] = useState("");
  useEffect(() => {
    if (firstCalendarId && !calendarId) setCalendarId(firstCalendarId);
  }, [firstCalendarId, calendarId]);

  const busy = tagsMutation.isPending || cancelMutation.isPending;

  const book = () => {
    if (!onBookAppointment || !calendarId) return;
    onBookAppointment({
      contact: { id: contactId, name: leadName, phone, email },
      calendarId,
    });
  };

  // What happens once the tag (and any appointment cancel) has landed.
  const finishAction = (action: StageAction) => {
    if (action.promptTask) {
      setTaskOpen(true);
      setLockAfterTask(true);
    } else if (action.bookAfter) {
      // Straight into rebooking. Deliberately NO automation lock: the setter
      // is actively working this lead on the Calendar tab, greying its card
      // out from under them would fight the SOP.
      if (calendarId) book();
      else showToast("Choose an appointment type below to rebook");
    } else {
      onAutomationStart?.();
    }
  };

  const runAction = (action: StageAction) => {
    if (busy) return;
    setPendingTag(action.tag);
    tagsMutation.mutate(
      { tenantId, contactId, add: [action.tag] },
      {
        onSuccess: () => {
          showToast(`${action.label} · tag applied`);
          if (action.cancelAppointment) {
            // The SOP deletes the existing booking before anything else
            // continues. No tracked booking is still surfaced honestly: the
            // tag landed, the cancel is on the setter in the CRM.
            if (!appointment) {
              setPendingTag(null);
              showToast("No booked appointment found, cancel it in the CRM by hand");
              finishAction(action);
              return;
            }
            cancelMutation.mutate(
              { tenantId, eventId: appointment.id },
              {
                onSuccess: () => {
                  setPendingTag(null);
                  showToast("Appointment cancelled");
                  finishAction(action);
                },
                onError: () => {
                  setPendingTag(null);
                  showToast(
                    "Tag applied but the appointment did not cancel, cancel it in the CRM",
                  );
                  finishAction(action);
                },
              },
            );
            return;
          }
          setPendingTag(null);
          finishAction(action);
        },
        onError: () => {
          setPendingTag(null);
          showToast("Could not apply that tag, please try again");
        },
      },
    );
  };

  return (
    <div className="flex flex-col">
      {dialCount > 0 && (
        <section className="border-b border-divider px-4 py-4">
          <h3 className="label-cap mb-2.5 text-faint">Dial attempts</h3>
          <div className="flex items-center gap-5">
            {Array.from({ length: dialCount }, (_, i) => (
              <label key={i} className="flex cursor-pointer select-none items-center gap-2">
                <input
                  type="checkbox"
                  checked={dialed[i] ?? false}
                  onChange={() => onToggleDial(i)}
                  className="h-4 w-4 accent-brand"
                />
                <span className="text-[13px] font-medium text-text">Dial {i + 1}</span>
              </label>
            ))}
          </div>
        </section>
      )}

      <section className="px-4 py-4">
        <h3 className="label-cap mb-2.5 text-faint">Outcome</h3>
        <div className="grid grid-cols-2 gap-x-2 gap-y-3">
          {config.actions.map((action) => (
            <div key={action.tag} className="flex flex-col gap-1">
              <Button
                variant={action.variant ?? "secondary"}
                size="md"
                onClick={() => runAction(action)}
                loading={busy && pendingTag === action.tag}
                disabled={busy}
                className="w-full"
              >
                {action.label}
              </Button>
              <span
                className="truncate px-0.5 text-center text-[10px] leading-tight text-faint"
                title={`Adds tag: ${action.tag}`}
              >
                + {action.tag}
              </span>
            </div>
          ))}
        </div>
      </section>

      {onBookAppointment && (
        <section className="border-t border-divider px-4 py-4">
          <h3 className="label-cap mb-2.5 text-faint">Appointment</h3>
          <select
            value={calendarId}
            onChange={(e) => setCalendarId(e.target.value)}
            disabled={calendarsQuery.isLoading || calendars.length === 0}
            aria-label="Appointment type"
            className="mb-2.5 w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-[13px] text-text outline-none focus:border-brand/50 disabled:opacity-60"
          >
            {calendarsQuery.isLoading ? (
              <option>Loading types...</option>
            ) : calendars.length === 0 ? (
              <option>No appointment types</option>
            ) : (
              <>
                <option value="" disabled>
                  Choose type...
                </option>
                {calendars.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </>
            )}
          </select>
          <Button
            variant="primary"
            size="md"
            onClick={book}
            disabled={!calendarId}
            className="w-full"
          >
            <CalendarPlus size={15} /> Book appointment
          </Button>
          {calendarsQuery.isError && (
            <p className="mt-1.5 text-[11px] text-danger">Could not load appointment types.</p>
          )}
        </section>
      )}

      {taskOpen && (
        <SetterTaskModal
          tenantId={tenantId}
          contactId={contactId}
          leadName={leadName}
          onClose={() => {
            setTaskOpen(false);
            if (lockAfterTask) {
              setLockAfterTask(false);
              onAutomationStart?.();
            }
          }}
        />
      )}
    </div>
  );
}
