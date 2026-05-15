import type { Stats } from "../types";
import AnimatedNumber from "./AnimatedNumber";
import StatCard from "./StatCard";
import { formatMoney, formatRoas } from "../lib/formatMoney";

interface StatsStripProps {
  stats: Stats;
}

export default function StatsStrip({ stats }: StatsStripProps) {
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
        label="Won"
        accent="brand"
        value={<AnimatedNumber value={stats.wonMtd} />}
        secondary={`${formatMoney(stats.revenueMtd)} revenue`}
      />
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
    </div>
  );
}
