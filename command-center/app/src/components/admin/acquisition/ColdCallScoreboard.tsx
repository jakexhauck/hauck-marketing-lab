import { useMemo } from "react";
import { useAdminLeadsQuery } from "../../../hooks/useAdminLeads";
import { useColdCallsQuery } from "../../../hooks/useColdCall";

// Cold Call > Scoreboard: the numbers, and where each one comes from.
//
// Two sources, and the page is explicit about which is which, because they are
// not equally trustworthy:
//
//   - Booked and worked come from the LEADS themselves. Every one is the
//     footprint of a button pressed on the Leads page, so they cannot be
//     inflated by typing.
//   - Dials and pickups come from the Tracker, which is typed by hand. Until the
//     dialer logs each call itself, these are self-reported and the page says so
//     rather than presenting them as measurement.
//
// Getting that distinction wrong is how a commission argument starts, so it is
// on the page rather than in someone's memory.

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

  const fromTracker = useMemo(() => {
    const days = trackerQuery.data?.days ?? [];
    const sum = (pick: (d: (typeof days)[number]) => number | null) =>
      days.reduce((total, day) => total + (pick(day) ?? 0), 0);
    const dials = sum((d) => d.callsMade);
    const pickups = sum((d) => d.pickups);
    return {
      dials,
      pickups,
      // Guard the divide: an unlogged month is blank, not 0%.
      pickupRate: dials > 0 ? `${Math.round((pickups / dials) * 100)}%` : "·",
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
        <div className="pk-section-h">Typed into the tracker</div>
        {!callerId ? (
          <div className="pk-needs">
            Dials and pickups are logged per person. Pick someone above to see
            theirs.
          </div>
        ) : (
        <div className="pk-report">
          <Stat value={fromTracker.dials} label="Dials this month" />
          <Stat value={fromTracker.pickups} label="Pickups this month" />
          <Stat value={fromTracker.pickupRate} label="Pickup rate" />
        </div>
        )}
        <div className="pk-needs" style={{ marginTop: 12 }}>
          These three are hand-entered on the Tracker page, so they are a claim
          rather than a measurement. They become real numbers when the dialer logs
          each call itself.
        </div>
      </section>
    </div>
  );
}
