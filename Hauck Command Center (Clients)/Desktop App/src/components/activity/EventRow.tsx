import type { ApiActivity, ApiNotification } from "@hauck/core";
import { cn } from "@/lib/cn";
import { relativeTime, formatDateTime } from "@/lib/format";
import { toneClasses } from "@/lib/status";
import { eventMeta, humanizeAction } from "./eventMeta";

// A single event in the timeline. The same row serves both the notification
// center and the activity log; `unread` is only ever true in the notification
// view (the log has no read state). Unread rows are tappable to mark read.
export function EventRow({
  event,
  unread = false,
  onMarkRead,
}: {
  event: ApiActivity | ApiNotification;
  unread?: boolean;
  onMarkRead?: (id: number) => void;
}) {
  const { tone, Icon } = eventMeta(event.action);
  const summary = event.payload?.summary?.trim() || humanizeAction(event.action);
  const interactive = unread && !!onMarkRead;

  const inner = (
    <>
      {/* Leading tone chip with the action icon. */}
      <div
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          toneClasses[tone],
        )}
        aria-hidden
      >
        <Icon size={16} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className={cn("min-w-0 flex-1 text-sm leading-snug", unread ? "text-text" : "text-muted")}>
            {summary}
          </p>
          {unread && (
            <span
              className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand"
              aria-label="Unread"
            />
          )}
        </div>
        <time
          dateTime={event.created_at}
          title={formatDateTime(event.created_at)}
          className="mt-1 block font-data text-[11.5px] text-faint"
        >
          {relativeTime(event.created_at)}
        </time>
      </div>
    </>
  );

  const base = "flex w-full gap-3 px-4 py-3 text-left transition-colors";

  if (interactive) {
    return (
      <button
        type="button"
        onClick={() => onMarkRead?.(event.id)}
        className={cn(base, "bg-brand-tint/60 hover:bg-brand-tint")}
        aria-label="Mark notification as read"
      >
        {inner}
      </button>
    );
  }

  return <div className={cn(base, unread && "bg-brand-tint/60")}>{inner}</div>;
}
