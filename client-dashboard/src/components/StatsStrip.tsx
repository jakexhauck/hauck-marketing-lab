import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import type { Stats } from "../types";
import AnimatedNumber from "./AnimatedNumber";
import StatCard from "./StatCard";
import Sparkline from "./Sparkline";
import { formatMoney, formatRoas } from "../lib/formatMoney";
import type { RolePermission } from "../lib/rolePermissions";
import { useClient } from "../context/ClientContext";

interface StatsStripProps {
  stats: Stats;
  permissions: RolePermission;
  repWonValue?: number;
  repLeadsCount?: number;
}

// Fake-but-stable upward-trending sparkline data, used until we wire historical data.
const SPARK_DATA = [6, 7, 6, 9, 8, 11, 10, 13, 12, 15, 14, 17, 18, 21];

interface HeroProps {
  label: string;
  value: ReactNode;
  meta: ReactNode;
}

function HeroCard({ label, value, meta }: HeroProps) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl px-5 py-5 text-white"
      style={{
        backgroundColor: "var(--brand-primary)",
        minHeight: "180px",
        backgroundImage:
          "radial-gradient(120% 80% at 100% 0%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 55%), radial-gradient(80% 60% at 0% 100%, rgba(0,0,0,0.32) 0%, rgba(0,0,0,0) 60%)",
      }}
    >
      <div className="relative z-10 flex h-full flex-col justify-between gap-4">
        <div className="flex items-start justify-between gap-3">
          <span className="label-cap-light">{label}</span>
          <div className="flex items-center gap-1 rounded-full bg-white/15 px-2 py-1 backdrop-blur-sm">
            <ArrowUpRight size={12} className="text-emerald-200" aria-hidden="true" />
            <span className="tabular-figs text-[10px] font-bold tracking-wide text-white">
              Trending
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="hero-num text-white" style={{ fontSize: "56px" }}>
            {value}
          </div>
          <div className="tabular-figs flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] font-semibold text-white/85">
            {meta}
          </div>
        </div>

        <div className="absolute bottom-4 right-4">
          <Sparkline data={SPARK_DATA} width={110} height={26} />
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
            <span className="font-display font-bold text-white">
              {formatRoas(stats.roas)}
            </span>
            <span className="text-white/60">ROAS</span>
            <Dot />
            <span className="text-white">{stats.wonMtd}</span>
            <span className="text-white/60">deals</span>
            <Dot />
            <span className="text-white">
              {stats.cpa === null ? "-" : formatMoney(stats.cpa)}
            </span>
            <span className="text-white/60">CPA</span>
          </>
        }
      />
    );
    secondary = (
      <div className="grid grid-cols-3 gap-2 px-5">
        <StatCard label="Leads" value={<AnimatedNumber value={stats.leadsMtd} />} />
        <StatCard label="Booked" value={<AnimatedNumber value={stats.bookedMtd} />} />
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
        <StatCard label="My Booked" value={<AnimatedNumber value={stats.bookedMtd} />} />
        <StatCard label={`My ${wonLabel}`} value={<AnimatedNumber value={stats.wonMtd} />} />
      </div>
    );
  } else {
    // Manager
    const bookedRate =
      stats.leadsMtd === 0
        ? 0
        : Math.round((stats.bookedMtd / stats.leadsMtd) * 100);
    hero = (
      <HeroCard
        label="Booked rate"
        value={
          <AnimatedNumber value={bookedRate} format={(n) => `${Math.round(n)}%`} />
        }
        meta={
          <>
            <span className="text-white">{stats.bookedMtd}</span>
            <span className="text-white/60">booked</span>
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
        <StatCard label="Booked" value={<AnimatedNumber value={stats.bookedMtd} />} />
        <StatCard
          label="Contacted"
          value={
            <AnimatedNumber
              value={Math.max(0, stats.leadsMtd - stats.bookedMtd - stats.wonMtd)}
            />
          }
        />
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
