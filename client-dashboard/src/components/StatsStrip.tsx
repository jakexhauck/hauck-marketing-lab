import type { Stats } from "../types";
import AnimatedNumber from "./AnimatedNumber";
import StatCard from "./StatCard";
import { formatMoney, formatRoas } from "../lib/formatMoney";
import type { RolePermission } from "../lib/rolePermissions";
import { useClient } from "../context/ClientContext";

interface StatsStripProps {
  stats: Stats;
  permissions: RolePermission;
  repWonValue?: number;
}

export default function StatsStrip({ stats, permissions, repWonValue }: StatsStripProps) {
  const { client } = useClient();
  const showRevenue = permissions.seeRevenue;
  const isRep = permissions.assignedOnly;
  const wonLabel = client.pipeline.wonLabel;

  return (
    <div
      className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 py-3"
      role="list"
      aria-label="Key performance indicators"
    >
      <StatCard
        label="Leads"
        value={<AnimatedNumber value={stats.leadsMtd} />}
        secondary="this month"
      />
      <StatCard
        label="Booked"
        value={<AnimatedNumber value={stats.bookedMtd} />}
        secondary="this month"
      />
      <StatCard
        label={wonLabel}
        accent="brand"
        value={<AnimatedNumber value={stats.wonMtd} />}
        secondary={showRevenue ? `${formatMoney(stats.revenueMtd)} revenue` : "this month"}
      />
      {showRevenue && (
        <>
          <StatCard
            label="CPA"
            value={
              stats.cpa === null ? (
                "-"
              ) : (
                <AnimatedNumber value={stats.cpa} format={(n) => formatMoney(n)} />
              )
            }
            secondary={`${formatMoney(stats.spendMtd)} spend`}
          />
          <StatCard
            label="ROAS"
            accent="brand"
            value={formatRoas(stats.roas)}
            secondary="vs. spend"
          />
        </>
      )}
      {!showRevenue && isRep && (
        <StatCard
          label={`My ${wonLabel} MTD`}
          accent="brand"
          value={formatMoney(repWonValue ?? 0)}
          secondary={`est commission ${formatMoney(Math.round((repWonValue ?? 0) * 0.1))}`}
        />
      )}
      {!showRevenue && !isRep && (
        <StatCard
          label="Booked Rate"
          value={
            stats.leadsMtd === 0
              ? "-"
              : `${Math.round((stats.bookedMtd / stats.leadsMtd) * 100)}%`
          }
          secondary="booked / leads"
        />
      )}
    </div>
  );
}
