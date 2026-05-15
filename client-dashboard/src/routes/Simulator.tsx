import { useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, TrendingDown, TrendingUp } from "lucide-react";
import Shell from "../components/Shell";
import BrandedButton from "../components/BrandedButton";
import AnimatedNumber from "../components/AnimatedNumber";
import { useLeads } from "../context/LeadsContext";
import { useClient } from "../context/ClientContext";
import { useAuth } from "../context/AuthContext";
import { computeStats } from "../lib/computeStats";
import { formatMoney, formatRoas } from "../lib/formatMoney";
import { computeProjection, pctDelta } from "../lib/computeProjection";

const SPEND_MIN = 500;
const SPEND_MAX = 20_000;
const SPEND_STEP = 250;

const CPL_MIN = 10;
const CPL_MAX = 500;
const CPL_STEP = 5;

const CLOSE_MIN = 0.05;
const CLOSE_MAX = 0.5;
const CLOSE_STEP = 0.01;

const JOB_MIN = 500;
const JOB_MAX = 25_000;
const JOB_STEP = 100;

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n) || Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

interface SliderRowProps {
  label: string;
  display: string;
  value: number;
  min: number;
  max: number;
  step: number;
  minLabel: string;
  maxLabel: string;
  onChange: (value: number) => void;
}

function SliderRow({
  label,
  display,
  value,
  min,
  max,
  step,
  minLabel,
  maxLabel,
  onChange,
}: SliderRowProps) {
  const handle = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(parseFloat(e.target.value));
  };
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="label-cap">{label}</span>
        <span className="stat-num text-xl">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handle}
        className="w-full"
        style={{ accentColor: "var(--brand-primary)" }}
        aria-label={label}
      />
      <div className="flex items-center justify-between text-xs text-[var(--text-faint)] tabular-figs">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: ReactNode;
}

function MetricCard({ label, value }: MetricCardProps) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-4">
      <div className="label-cap truncate">{label}</div>
      <div className="stat-num text-2xl">{value}</div>
    </div>
  );
}

interface DeltaPillProps {
  label: string;
  delta: number; // fractional, e.g. 0.42 = +42%
  absLabel: string;
}

function DeltaPill({ label, delta, absLabel }: DeltaPillProps) {
  const up = delta >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  const color = up ? "var(--brand-primary)" : "#b91c1c";
  const pct = Math.abs(delta) * 100;
  const pctStr = pct >= 100 ? pct.toFixed(0) : pct.toFixed(1);
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <div className="label-cap truncate">{label}</div>
      <div className="flex items-center gap-2">
        <Icon size={16} style={{ color }} aria-hidden="true" />
        <span
          className="stat-num text-lg tabular-figs"
          style={{ color }}
        >
          {up ? "+" : "-"}
          {pctStr}%
        </span>
        <span className="text-xs text-[var(--text-muted)] tabular-figs">
          {absLabel}
        </span>
      </div>
    </div>
  );
}

export default function Simulator() {
  const navigate = useNavigate();
  const { leads } = useLeads();
  const { client } = useClient();
  const { currentUser } = useAuth();

  const baseline = useMemo(() => {
    const stats = computeStats(leads, client.monthlySpend);
    const spend = client.monthlySpend || SPEND_MIN;
    const leadsMtd = stats.leadsMtd;
    const wonMtd = stats.wonMtd;
    const revenueMtd = stats.revenueMtd;

    const rawCpl = leadsMtd > 0 ? spend / leadsMtd : 75;
    const rawClose = leadsMtd > 0 ? wonMtd / leadsMtd : 0.2;
    const rawJob = wonMtd > 0 ? revenueMtd / wonMtd : 5000;

    return {
      spend: clamp(spend, SPEND_MIN, SPEND_MAX),
      cpl: clamp(rawCpl, CPL_MIN, CPL_MAX),
      closeRate: clamp(rawClose, CLOSE_MIN, CLOSE_MAX),
      avgJobValue: clamp(rawJob, JOB_MIN, JOB_MAX),
      revenueMtd,
      roas: stats.roas,
    };
  }, [leads, client.monthlySpend]);

  const [spend, setSpend] = useState<number>(baseline.spend);
  const [cpl, setCpl] = useState<number>(baseline.cpl);
  const [closeRate, setCloseRate] = useState<number>(baseline.closeRate);
  const [avgJobValue, setAvgJobValue] = useState<number>(baseline.avgJobValue);

  const projection = useMemo(
    () => computeProjection({ spend, cpl, closeRate, avgJobValue }),
    [spend, cpl, closeRate, avgJobValue]
  );

  const baselineProjection = useMemo(
    () =>
      computeProjection({
        spend: baseline.spend,
        cpl: baseline.cpl,
        closeRate: baseline.closeRate,
        avgJobValue: baseline.avgJobValue,
      }),
    [baseline]
  );

  const baseRevenue =
    baseline.revenueMtd > 0 ? baseline.revenueMtd : baselineProjection.revenue;
  const baseRoas =
    baseline.roas !== null && baseline.roas > 0
      ? baseline.roas
      : baselineProjection.roas ?? 0;

  const revenueDelta = pctDelta(projection.revenue, baseRevenue);
  const roasDelta = pctDelta(projection.roas ?? 0, baseRoas);

  const reset = () => {
    setSpend(baseline.spend);
    setCpl(baseline.cpl);
    setCloseRate(baseline.closeRate);
    setAvgJobValue(baseline.avgJobValue);
  };

  const role = currentUser?.role;
  const isOwnerOrManager = role === "owner" || role === "manager";

  return (
    <Shell>
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-5 py-3">
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="-ml-1 flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
          aria-label="Back to dashboard"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="label-cap truncate">What-if simulator</div>
          <div className="mt-0.5 truncate font-display text-lg font-bold tracking-tight text-[var(--text)]">
            Scale model
          </div>
        </div>
      </header>

      {!isOwnerOrManager ? (
        <main className="flex flex-1 items-center justify-center px-5 py-12">
          <div className="flex max-w-sm flex-col items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center">
            <span className="label-cap-strong" style={{ color: "var(--brand-primary)" }}>
              Restricted
            </span>
            <p className="font-display text-lg font-bold tracking-tight text-[var(--text)]">
              Owner / manager only
            </p>
            <p className="text-sm text-[var(--text-muted)]">
              This view shows revenue-level modelling. Ask your account owner
              for access.
            </p>
          </div>
        </main>
      ) : (
        <main className="flex flex-1 flex-col gap-4 px-5 pb-8 pt-4">
          {/* Hero */}
          <div
            className="relative overflow-hidden rounded-3xl p-6 text-white"
            style={{
              backgroundColor: "var(--brand-primary)",
              backgroundImage:
                "radial-gradient(120% 80% at 100% 0%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 55%), radial-gradient(80% 60% at 0% 100%, rgba(0,0,0,0.32) 0%, rgba(0,0,0,0) 60%)",
            }}
          >
            <div className="flex flex-col gap-3">
              <span className="label-cap-light">Projected revenue</span>
              <div className="hero-num text-white" style={{ fontSize: "56px" }}>
                <AnimatedNumber
                  value={projection.revenue}
                  format={(n) => formatMoney(n)}
                />
              </div>
              <div className="tabular-figs flex flex-wrap items-center gap-x-1.5 text-[12px] font-semibold text-white/85">
                <span className="font-display font-bold text-white">
                  {formatRoas(projection.roas)}
                </span>
                <span className="text-white/60">ROAS at</span>
                <span className="text-white">{formatMoney(spend)}</span>
                <span className="text-white/60">spend</span>
              </div>
            </div>
          </div>

          {/* Metric tiles */}
          <div className="grid grid-cols-3 gap-2">
            <MetricCard
              label="Jobs"
              value={
                <AnimatedNumber
                  value={projection.jobs}
                  format={(n) => Math.round(n).toLocaleString("en-US")}
                />
              }
            />
            <MetricCard
              label="Leads"
              value={
                <AnimatedNumber
                  value={projection.leads}
                  format={(n) => Math.round(n).toLocaleString("en-US")}
                />
              }
            />
            <MetricCard
              label="ROAS"
              value={
                <AnimatedNumber
                  value={projection.roas ?? 0}
                  format={(n) => formatRoas(n)}
                />
              }
            />
          </div>

          {/* vs current delta strip */}
          <div className="flex flex-col gap-2">
            <span
              className="label-cap-strong px-1"
              style={{ color: "var(--brand-primary)" }}
            >
              vs current
            </span>
            <div className="grid grid-cols-2 gap-2">
              <DeltaPill
                label="Revenue"
                delta={revenueDelta}
                absLabel={formatMoney(baseRevenue)}
              />
              <DeltaPill
                label="ROAS"
                delta={roasDelta}
                absLabel={formatRoas(baseRoas || null)}
              />
            </div>
          </div>

          {/* Sliders */}
          <div className="flex flex-col gap-3">
            <span
              className="label-cap-strong px-1"
              style={{ color: "var(--brand-primary)" }}
            >
              Levers
            </span>
            <SliderRow
              label="Monthly spend"
              display={formatMoney(spend)}
              value={spend}
              min={SPEND_MIN}
              max={SPEND_MAX}
              step={SPEND_STEP}
              minLabel={formatMoney(SPEND_MIN)}
              maxLabel={formatMoney(SPEND_MAX)}
              onChange={setSpend}
            />
            <SliderRow
              label="Cost per lead"
              display={formatMoney(cpl)}
              value={cpl}
              min={CPL_MIN}
              max={CPL_MAX}
              step={CPL_STEP}
              minLabel={formatMoney(CPL_MIN)}
              maxLabel={formatMoney(CPL_MAX)}
              onChange={setCpl}
            />
            <SliderRow
              label="Close rate"
              display={`${Math.round(closeRate * 100)}%`}
              value={closeRate}
              min={CLOSE_MIN}
              max={CLOSE_MAX}
              step={CLOSE_STEP}
              minLabel={`${Math.round(CLOSE_MIN * 100)}%`}
              maxLabel={`${Math.round(CLOSE_MAX * 100)}%`}
              onChange={setCloseRate}
            />
            <SliderRow
              label="Avg job value"
              display={formatMoney(avgJobValue)}
              value={avgJobValue}
              min={JOB_MIN}
              max={JOB_MAX}
              step={JOB_STEP}
              minLabel={formatMoney(JOB_MIN)}
              maxLabel={formatMoney(JOB_MAX)}
              onChange={setAvgJobValue}
            />
          </div>

          <div className="pt-2">
            <BrandedButton
              variant="secondary"
              onClick={reset}
              className="w-full"
            >
              Reset to current
            </BrandedButton>
          </div>
        </main>
      )}
    </Shell>
  );
}
