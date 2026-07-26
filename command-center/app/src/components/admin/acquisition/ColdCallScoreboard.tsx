import { useMemo } from "react";
import { useAdminLeadsQuery } from "../../../hooks/useAdminLeads";
import { useColdCallsQuery } from "../../../hooks/useColdCall";
import { recordedTotals } from "../../../lib/coldCall";

// Cold Call > Scoreboard: the numbers, and where each one comes from.
//
// Since 0052 the dialing numbers are measured rather than claimed: every dial,
// pickup and pass-through here is the footprint of an outcome button pressed on
// the call card, appended to cold_call_dials and never editable afterwards. The
// same is true of worked and booked, which come from the leads themselves.
//
// Hand-typed cells still exist on the Tracker, for dialing done off-app. They
// are NOT mixed into the numbers above; they get their own line, naming how many
// days carry one. Blurring the two is how a commission argument starts.

function monthParam(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="pk-report-tile">
      <div className="pk-report-val">{value}</div>
      <div className="pk-report-label">{label}</div>
    </div>
  );
}

// callerId "" means everyone; otherwise one person's numbers. The tracker block
// needs a specific person (its rows are per caller since 0050), so on "Everyone"
// it says so rather than showing one person's dials as if they were the total.
export default function ColdCallScoreboard({ callerId = "" }: { callerId?: string }) {
  const now = new Date();
  const month = monthParam(now);
  const today = todayIso();
  const monthPrefix = `${month}-`;

  const leadsQuery = useAdminLeadsQuery();
  const trackerQuery = useColdCallsQuery(month, callerId || undefined);

  const fromLeads = useMemo(() => {
    const all = leadsQuery.data?.leads ?? [];
    const leads = callerId ? all.filter((l) => l.assignedTo === callerId) : all;
    return {
      workedToday: leads.filter((l) => l.lastContact === today).length,
      workedMonth: leads.filter((l) => (l.lastContact ?? "").startsWith(monthPrefix)).length,
      bookedMonth: leads.filter((l) => (l.appointmentDate ?? "").startsWith(monthPrefix)).length,
      callbacksDue: leads.filter(
        (l) => l.followUpDate && l.followUpDate <= today && l.status !== "Dead" && l.status !== "Closed",
      ).length,
      remaining: leads.filter((l) => ["New", "Contacted", "No Answer"].includes(l.status)).length,
    };
  }, [leadsQuery.data, today, monthPrefix, callerId]);

  // Measured only: what the app recorded, ignoring anything typed over it.
  const recorded = useMemo(() => {
    const totals = recordedTotals(trackerQuery.data?.days ?? []);
    const rate = (part: number, whole: number) =>
      whole > 0 ? `${Math.round((part / whole) * 100)}%` : "·";
    return {
      ...totals,
      pickupRate: rate(totals.pickups, totals.callsMade),
      pitchRate: rate(totals.passThrough, totals.pickups),
    };
  }, [trackerQuery.data]);

  return (
    <div className="flex flex-col gap-7">
      <section>
        <div className="pk-section-h">Recorded by the app</div>
        <div className="pk-report">
          <Stat value={fromLeads.workedToday} label="Prospects worked today" />
          <Stat value={fromLeads.workedMonth} label="Prospects worked this month" />
          <Stat value={fromLeads.bookedMonth} label="Meetings booked this month" />
          <Stat value={fromLeads.callbacksDue} label="Callbacks due now" />
          <Stat value={fromLeads.remaining} label="Left in the queue" />
        </div>
      </section>

      <section>
        <div className="pk-section-h">Dialing, as the app recorded it</div>
        {!callerId ? (
          <div className="pk-needs">
            Dials are recorded per person. Pick someone above to see theirs.
          </div>
        ) : (
          <>
            <div className="pk-report">
              <Stat value={recorded.callsMade} label="Dials this month" />
              <Stat value={recorded.pickups} label="Pickups" />
              <Stat value={recorded.pickupRate} label="Pickup rate" />
              <Stat value={recorded.passThrough} label="Got to the pitch" />
              <Stat value={recorded.pitchRate} label="Pickup to pitch" />
            </div>
            <div className="pk-needs" style={{ marginTop: 12 }}>
              {recorded.days === 0
                ? "Nothing recorded this month yet. Every outcome pressed on the Leads or Callbacks page lands here on its own."
                : `Counted from ${recorded.callsMade} attempt${
                    recorded.callsMade === 1 ? "" : "s"
                  } logged across ${recorded.days} day${
                    recorded.days === 1 ? "" : "s"
                  }. Each one is an outcome button pressed on a call; nothing here can be typed.`}
            </div>
            {recorded.typedDays > 0 && (
              <div className="pk-needs" style={{ marginTop: 8 }}>
                {recorded.typedDays} day{recorded.typedDays === 1 ? " has" : "s have"} a
                hand-typed count on the Tracker, for dialing done off-app. Those
                are not included above.
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
