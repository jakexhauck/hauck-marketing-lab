import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { connectColdSmsGoogle, disconnectColdSmsGoogle, getColdSmsWeek } from "../../../lib/api";
import { PROSPECT_ZONES, formatDay, weekOf, zoneShort } from "../../../lib/coldSmsWeek";
import { GoogleBar, WeekGrid } from "../coldSms/SmsBookingWizard";

// Sales > Calendar (Jake, 2026-10-14): the Book call wizard's week, on its own,
// in the exact same style. Same endpoint and the same three layers (Google in
// blue, booked demos in purple, open slots in green), read only: nobody is
// being booked here, so the open slots are drawn but not clickable. Unlike the
// wizard it may look back, to see the calls already taken this week.

const FALLBACK_ZONE = "America/New_York";

export default function SalesCalendar() {
  const qc = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [zone, setZone] = useState(FALLBACK_ZONE);
  const [viewZone, setViewZone] = useState("");
  const shown = viewZone || zone;
  const days = useMemo(() => weekOf(Date.now(), shown, offset), [shown, offset]);
  const range = { start: days[0].start, end: days[6].start + 24 * 3600_000 };

  const week = useQuery({
    queryKey: ["admin", "cold-sms", "week", shown, range.start],
    queryFn: () => getColdSmsWeek(range.start, range.end),
    staleTime: 30_000,
  });
  useEffect(() => {
    if (week.data?.timezone && week.data.timezone !== zone) setZone(week.data.timezone);
  }, [week.data?.timezone, zone]);

  const google = useMutation({
    mutationFn: async (on: boolean) => {
      if (on) {
        const { redirectUrl } = await connectColdSmsGoogle("sales");
        window.location.href = redirectUrl;
      } else {
        await disconnectColdSmsGoogle();
        await qc.invalidateQueries({ queryKey: ["admin", "cold-sms", "week"] });
      }
    },
  });

  return (
    <div className="flex h-[calc(100vh-190px)] min-h-[560px] flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-surface">
      <div className="flex flex-wrap items-center gap-2 px-5 pb-2.5 pt-3.5">
        <button
          type="button"
          aria-label="Previous week"
          disabled={offset <= -8}
          onClick={() => setOffset((o) => Math.max(-8, o - 1))}
          className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--border)] bg-surface disabled:opacity-40"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          aria-label="Next week"
          disabled={offset >= 8}
          onClick={() => setOffset((o) => Math.min(8, o + 1))}
          className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--border)] bg-surface disabled:opacity-40"
        >
          <ChevronRight size={16} />
        </button>
        <b className="font-display text-[14px] font-semibold text-text">
          {formatDay(days[0].start + 12 * 3600_000, shown)} to {formatDay(days[6].start + 12 * 3600_000, shown)}
        </b>
        {offset !== 0 && (
          <button
            type="button"
            onClick={() => setOffset(0)}
            className="rounded-lg border border-[var(--border)] bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-muted hover:text-text"
          >
            This week
          </button>
        )}
        <label className="ml-auto flex items-center gap-2 text-[12.5px] font-semibold text-muted">
          Zone
          <select
            value={viewZone}
            onChange={(e) => setViewZone(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-surface-2 px-2 py-1.5 text-[12.5px] font-semibold text-text"
          >
            <option value="">Mine ({zoneShort(zone)})</option>
            {PROSPECT_ZONES.map((z) => (
              <option key={z.zone} value={z.zone}>
                {z.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <GoogleBar
        connected={Boolean(week.data?.google.connected)}
        busy={google.isPending}
        failed={google.isError}
        onConnect={() => google.mutate(true)}
        onDisconnect={() => google.mutate(false)}
      />

      {week.isLoading ? (
        <div className="grid flex-1 place-items-center text-[13px] text-faint">
          <Loader2 className="animate-spin" size={18} />
        </div>
      ) : week.isError ? (
        <div className="grid flex-1 place-items-center text-[13px] text-faint">The calendar did not load.</div>
      ) : !week.data?.calendar ? (
        <div className="grid flex-1 place-items-center text-[13px] text-faint">No "Cold SMS" calendar in GoHighLevel.</div>
      ) : (
        <WeekGrid
          days={days}
          zone={shown}
          myZone={zone}
          sameZone={zoneShort(shown) === zoneShort(zone)}
          minutes={week.data.calendar.minutes}
          data={week.data}
          pick={null}
        />
      )}
    </div>
  );
}
