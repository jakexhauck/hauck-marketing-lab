import type { ReactNode } from "react";
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
  repLeadsCount?: number;
}

interface HeroProps {
  label: string;
  value: ReactNode;
  meta: ReactNode;
}

// No decorative trend markers here: every number on this card is real, and a
// sparkline or "Trending" badge would imply history we are not measuring yet.
function HeroCard({ label, value, meta }: HeroProps) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl px-5 py-5 text-[var(--brand-fg)]"
      style={{
        backgroundColor: "var(--brand-primary)",
        minHeight: "180px",
        backgroundImage:
          "radial-gradient(120% 80% at 100% 0%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 55%), radial-gradient(80% 60% at 0% 100%, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0) 60%)",
      }}
    >
      <div className="relative z-10 flex h-full flex-col justify-between gap-4">
        <span className="label-cap" style={{ color: "var(--brand-fg)", opacity: 0.7 }}>{label}</span>

        <div className="flex flex-col gap-2">
          <div className="hero-num text-[var(--brand-fg)]" style={{ fontSize: "56px" }}>
            {value}
          </div>
          <div className="tabular-figs flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] font-semibold text-[var(--brand-fg)]/75">
            {meta}
          </div>
        </div>
      </div>
    </div>
  );
}

function Dot() {
  return <span className="px-1 text-white/40">·</span>;
}

export default function StatsStrip({
  stats,
  permissions,
  repWonValue,
  repLeadsCount,
}: StatsStripProps) {
  const { client } = useClient();
  const showRevenue = permissions.seeRevenue;
  const isRep = permissions.assignedOnly;
  const wonLabel = client.pipeline.wonLabel;

  let hero: ReactNode;
  let secondary: ReactNode;

  if (showRevenue) {
    // Owner
    hero = (
      <HeroCard
        label="Revenue this month"
        value={
          <AnimatedNumber
            value={stats.revenueMtd}
            format={(n) => formatMoney(n)}
          />
        }
        meta={
          <>
            {stats.roas !== null && (
              <>
                <span className="font-display font-bold text-white">
                  {formatRoas(stats.roas)}
                </span>
                <span className="text-white/60">ROAS</span>
                <Dot />
              </>
            )}
            <span className="text-white">{stats.wonMtd}</span>
            <span className="text-white/60">deals</span>
            {stats.cpa !== null && (
              <>
                <Dot />
                <span className="text-white">{formatMoney(stats.cpa)}</span>
                <span className="text-white/60">CPA</span>
              </>
            )}
          </>
        }
      />
    );
    secondary = (
      <div className="grid grid-cols-3 gap-2 px-5">
        <StatCard label="Leads" value={<AnimatedNumber value={stats.leadsMtd} />} />
        <StatCard label="Progressed" value={<AnimatedNumber value={stats.progressedMtd} />} />
        <StatCard label={wonLabel} value={<AnimatedNumber value={stats.wonMtd} />} />
      </div>
    );
  } else if (isRep) {
    // Rep
    const commission = Math.round((repWonValue ?? 0) * 0.1);
    hero = (
      <HeroCard
        label={`My ${wonLabel} this month`}
        value={<AnimatedNumber value={stats.wonMtd} />}
        meta={
          <>
            <span className="text-white/60">est. commission</span>
            <span className="text-white">{formatMoney(commission)}</span>
            <Dot />
            <span className="text-white">{repLeadsCount ?? stats.leadsMtd}</span>
            <span className="text-white/60">leads in pipeline</span>
          </>
        }
      />
    );
    secondary = (
      <div className="grid grid-cols-3 gap-2 px-5">
        <StatCard label="My Leads" value={<AnimatedNumber value={stats.leadsMtd} />} />
        <StatCard label="My Progressed" value={<AnimatedNumber value={stats.progressedMtd} />} />
        <StatCard label={`My ${wonLabel}`} value={<AnimatedNumber value={stats.wonMtd} />} />
      </div>
    );
  } else {
    // Manager
    const progressRate =
      stats.leadsMtd === 0
        ? 0
        : Math.round((stats.progressedMtd / stats.leadsMtd) * 100);
    hero = (
      <HeroCard
        label="Progress rate"
        value={
          <AnimatedNumber value={progressRate} format={(n) => `${Math.round(n)}%`} />
        }
        meta={
          <>
            <span className="text-white">{stats.progressedMtd}</span>
            <span className="text-white/60">progressed</span>
            <Dot />
            <span className="text-white">{stats.leadsMtd}</span>
            <span className="text-white/60">total leads</span>
          </>
        }
      />
    );
    secondary = (
      <div className="grid grid-cols-3 gap-2 px-5">
        <StatCard label="Leads" value={<AnimatedNumber value={stats.leadsMtd} />} />
        <StatCard label="Progressed" value={<AnimatedNumber value={stats.progressedMtd} />} />
        <StatCard label="New" value={<AnimatedNumber value={stats.newMtd} />} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-0 pb-4 pt-3">
      <div className="px-5">{hero}</div>
      {secondary}
    </div>
  );
}
