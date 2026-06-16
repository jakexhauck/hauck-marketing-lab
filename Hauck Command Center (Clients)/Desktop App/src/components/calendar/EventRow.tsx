import { useState } from "react";
import { MapPin, Video, ChevronDown } from "lucide-react";
import type { ApiCalendarEvent } from "@hauck/core";
import { Avatar, StatusPill } from "@/components/ui";
import { appointmentStatus } from "@/lib/status";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/cn";

// A single appointment in the agenda. The time column is the anchor: it reads as
// a rail on wide screens and stacks above the detail on narrow ones. Past events
// are dimmed so an operator's eye lands on what's still ahead.
export function EventRow({ event, past }: { event: ApiCalendarEvent; past?: boolean }) {
  const [open, setOpen] = useState(false);
  const meta = appointmentStatus(event.status);
  const start = event.startTime ? formatTime(event.startTime) : "TBD";
  const end = event.endTime ? formatTime(event.endTime) : null;
  const address = event.address?.trim();
  const meetingUrl = event.meetingUrl?.trim();
  const notes = event.notes?.trim();
  const longNote = notes != null && notes.length > 140;

  return (
    <div
      className={cn(
        "group grid gap-x-4 gap-y-3 px-4 py-4 transition-colors hover:bg-surface-2",
        "grid-cols-1 sm:grid-cols-[5.5rem_1fr]",
        past && "opacity-60",
      )}
    >
      {/* Time rail */}
      <div className="flex items-baseline gap-2 sm:flex-col sm:items-start sm:gap-0.5">
        <span className="font-data text-[15px] leading-none text-text tnum">{start}</span>
        {end && (
          <span className="font-data text-[12px] leading-none text-faint tnum">
            <span className="sm:hidden">– </span>
            {end}
          </span>
        )}
      </div>

      {/* Detail */}
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
          <h4 className="min-w-0 font-display text-[15px] leading-tight text-text">
            {event.title || "Untitled appointment"}
          </h4>
          <StatusPill meta={meta} />
        </div>

        {event.contactName && (
          <div className="mt-2 flex items-center gap-2">
            <Avatar name={event.contactName} size="sm" />
            <span className="truncate text-[13px] text-muted">{event.contactName}</span>
          </div>
        )}

        {(address || meetingUrl) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px]">
            {address && (
              <span className="inline-flex min-w-0 items-center gap-1.5 text-muted">
                <MapPin size={13} className="shrink-0 text-faint" />
                <span className="truncate">{address}</span>
              </span>
            )}
            {meetingUrl && (
              <a
                href={meetingUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-brand-tint px-2 py-1 font-medium text-brand-text transition-colors hover:bg-brand hover:text-brand-fg"
              >
                <Video size={13} />
                Join
              </a>
            )}
          </div>
        )}

        {notes && (
          <div className="mt-2.5 text-[12.5px] leading-relaxed text-muted">
            <p className={cn(!open && longNote && "line-clamp-2")}>{notes}</p>
            {longNote && (
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-brand-text hover:underline"
              >
                {open ? "Show less" : "Show more"}
                <ChevronDown
                  size={12}
                  className={cn("transition-transform", open && "rotate-180")}
                />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
