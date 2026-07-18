import {
  useGoogleCalendarConnection,
  useStartGoogleCalendarConnect,
  useUnlinkGoogleCalendar,
} from "../../hooks/useApi";

// Lets a client link their OWN Google Calendar from the Jobs page, so the
// calendar greys out hours they are already busy. It sits here rather than in
// Settings because this is where the gap is visible: they are looking at a
// calendar that does not know about the rest of their day.
//
// The app reads availability only. It never requests or shows event titles.
export default function GoogleCalendarLink() {
  const conn = useGoogleCalendarConnection();
  const start = useStartGoogleCalendarConnect();
  const unlink = useUnlinkGoogleCalendar();

  // Nothing to offer while we do not know, and nothing to offer if the broker
  // is not wired in this environment. A dead button is worse than no button.
  if (conn.isLoading || conn.data?.status === "not_configured") return null;

  const onLink = async () => {
    const res = await start.mutateAsync().catch(() => null);
    if (res?.redirectUrl) window.location.href = res.redirectUrl;
  };

  if (conn.data?.connected) {
    return (
      <span className="flex items-center gap-2 font-display text-[12px] font-semibold text-muted">
        Google Calendar linked
        <button
          type="button"
          onClick={() => unlink.mutate()}
          disabled={unlink.isPending}
          className="rounded-[10px] border border-border bg-surface px-2.5 py-1 text-[12px] text-muted hover:bg-surface-2 disabled:opacity-60"
        >
          {unlink.isPending ? "Unlinking..." : "Unlink"}
        </button>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={onLink}
        disabled={start.isPending}
        className="rounded-[10px] border border-border bg-surface px-3 py-1.5 font-display text-[12px] font-semibold text-text hover:bg-surface-2 disabled:opacity-60"
      >
        {start.isPending ? "Opening Google..." : "Link Google Calendar"}
      </button>
      {start.isError ? (
        <span className="font-display text-[12px] text-danger">
          Could not reach Google. Try again.
        </span>
      ) : null}
    </span>
  );
}
