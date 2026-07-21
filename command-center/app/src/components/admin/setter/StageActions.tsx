import { useEffect, useState } from "react";
import { CalendarPlus } from "lucide-react";
import SetterTaskModal from "./SetterTaskModal";
import { Button } from "../../ui/Button";
import { useSetterTagsMutation, useSetterCalendarsQuery } from "../../../hooks/useApi";
import { useToast } from "../../../context/ToastContext";
import type { StageAction, StageActionConfig } from "../../../lib/setterStageActions";
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
}

export default function StageActions({
  tenantId,
  contactId,
  leadName,
  phone,
  email,
  config,
  onBookAppointment,
}: Props) {
  const { showToast } = useToast();
  const tagsMutation = useSetterTagsMutation();
  const [pendingTag, setPendingTag] = useState<string | null>(null);
  const [taskOpen, setTaskOpen] = useState(false);

  // Visual dial tracking. Ephemeral: reset whenever the selected lead changes,
  // so one lead's ticks never carry over to the next.
  const dialCount = config.dials ?? 0;
  const [dialed, setDialed] = useState<boolean[]>(() => Array(dialCount).fill(false));
  useEffect(() => {
    setDialed(Array(dialCount).fill(false));
  }, [contactId, dialCount]);

  // The client's booking calendars are the appointment types. Default to the
  // first so Book is usable immediately; the setter can switch it.
  const calendarsQuery = useSetterCalendarsQuery(tenantId, !!onBookAppointment);
  const calendars = calendarsQuery.data?.calendars ?? [];
  const firstCalendarId = calendars[0]?.id ?? "";
  const [calendarId, setCalendarId] = useState("");
  useEffect(() => {
    if (firstCalendarId && !calendarId) setCalendarId(firstCalendarId);
  }, [firstCalendarId, calendarId]);

  const runAction = (action: StageAction) => {
    if (tagsMutation.isPending) return;
    setPendingTag(action.tag);
    tagsMutation.mutate(
      { tenantId, contactId, add: [action.tag] },
      {
        onSuccess: () => {
          setPendingTag(null);
          showToast(`${action.label} · tag applied`);
          if (action.promptTask) setTaskOpen(true);
        },
        onError: () => {
          setPendingTag(null);
          showToast("Could not apply that tag, please try again");
        },
      },
    );
  };

  const book = () => {
    if (!onBookAppointment || !calendarId) return;
    onBookAppointment({
      contact: { id: contactId, name: leadName, phone, email },
      calendarId,
    });
  };

  return (
    <div className="flex flex-col">
      {dialCount > 0 && (
        <section className="border-b border-divider px-4 py-4">
          <h3 className="label-cap mb-2.5 text-faint">Dial attempts</h3>
          <div className="flex items-center gap-5">
            {dialed.map((on, i) => (
              <label key={i} className="flex cursor-pointer select-none items-center gap-2">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => setDialed((prev) => prev.map((v, j) => (j === i ? !v : v)))}
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
                loading={tagsMutation.isPending && pendingTag === action.tag}
                disabled={tagsMutation.isPending}
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
          onClose={() => setTaskOpen(false)}
        />
      )}
    </div>
  );
}
