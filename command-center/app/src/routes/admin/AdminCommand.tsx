import { useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  Calendar,
  Check,
  Clock,
  DollarSign,
  HeartHandshake,
  LineChart,
  Percent,
  Repeat,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useBusinessHealthQuery, useSaveBusinessHealthMutation } from "../../hooks/useApi";
import { formatMoney } from "../../lib/format";
import {
  ZERO_INPUTS,
  benchmark,
  computeMetrics,
  periodKey,
  type BenchResult,
  type BenchmarkKind,
  type BusinessHealthInputs,
  type PeriodType,
} from "../../lib/businessHealth";

// Command home = Business Health: the whole-agency numbers at a glance. Two
// zoned bento panels (Money, Clients & Retention) of agency-global manual
// metrics with live-computed unit economics and benchmark chips.
//
// Phase 1 is hand entry (app DB is the source of truth). The "Auto" badge means
// COMPUTED from the other inputs (CAC, ROAS, LTV, LTV:CAC, End clients), not
// auto-filled from GHL/Meta. Each input autosaves to the current period's row.

// ---- input <-> string-draft plumbing -------------------------------------
// The editable tiles keep their raw typed string so decimals type cleanly; the
// numeric inputs (for compute + save) are parsed on demand. A blank field reads
// as 0, so an unsaved period shows honest empty tiles.
type Draft = Record<keyof BusinessHealthInputs, string>;
const FIELDS = Object.keys(ZERO_INPUTS) as (keyof BusinessHealthInputs)[];

const toDraft = (i: BusinessHealthInputs): Draft =>
  FIELDS.reduce((acc, k) => {
    acc[k] = String(i[k]);
    return acc;
  }, {} as Draft);

const toNums = (d: Draft): BusinessHealthInputs =>
  FIELDS.reduce((acc, k) => {
    const n = parseFloat(d[k]);
    acc[k] = Number.isFinite(n) ? n : 0;
    return acc;
  }, {} as BusinessHealthInputs);

const ratio = (v: number) => `${v.toFixed(1)}x`;

export default function AdminCommand() {
  const [periodType, setPeriodType] = useState<PeriodType>("month");
  const period = periodKey(periodType);

  const query = useBusinessHealthQuery(period, true);
  const mutation = useSaveBusinessHealthMutation();

  // Draft is the editable source of truth; seed it once per period when that
  // period's row arrives. Keyed on the returned period so a save-driven cache
  // update (same period, new timestamp) never clobbers an in-progress edit.
  const [draft, setDraft] = useState<Draft>(() => toDraft(ZERO_INPUTS));
  const seededRef = useRef<string | null>(null);
  useEffect(() => {
    const data = query.data;
    if (data && seededRef.current !== data.period) {
      setDraft(toDraft(data.inputs));
      seededRef.current = data.period;
    }
  }, [query.data]);

  // Debounced autosave. pendingRef always holds the latest edit for the period
  // it was made in, so flushing on period-switch/unmount saves the right row.
  const pendingRef = useRef<{
    period: string;
    periodType: PeriodType;
    inputs: Partial<BusinessHealthInputs>;
  } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mutateRef = useRef(mutation.mutate);
  mutateRef.current = mutation.mutate;

  const flush = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const p = pendingRef.current;
    if (p) {
      pendingRef.current = null;
      mutateRef.current(p);
    }
  };

  // Flush any pending edit when the period changes or the page unmounts.
  useEffect(() => () => flush(), [period]);

  const setField = (field: keyof BusinessHealthInputs, raw: string) => {
    setDraft((prev) => {
      const next = { ...prev, [field]: raw };
      pendingRef.current = { period, periodType, inputs: toNums(next) };
      return next;
    });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, 600);
  };

  const inputs = toNums(draft);
  const computed = computeMetrics(inputs);

  // Resolve a benchmark chip. CAC/ROAS/LTV:CAC read the computed value; margin
  // and churn read the raw input.
  const chipFor = (kind: BenchmarkKind): BenchResult => {
    const v =
      kind === "cac"
        ? computed.cac
        : kind === "roas"
          ? computed.roas
          : kind === "ltvCac"
            ? computed.ltvCac
            : kind === "margin"
              ? inputs.profitMarginPct
              : inputs.churnPct;
    return benchmark(kind, v);
  };

  return (
    <div className="pk-root">
      <BusinessHealthStyle />
      <div className="pk-kicker">Command</div>
      <h1 className="pk-title">Business Health</h1>
      <p className="pk-tagline">Your whole-agency numbers at a glance.</p>

      <div className="bh-controls">
        <div className="bh-tabs" role="tablist" aria-label="Period">
          {(
            [
              ["month", "This month"],
              ["quarter", "Quarter"],
              ["year", "Year"],
            ] as [PeriodType, string][]
          ).map(([type, label]) => (
            <button
              key={type}
              type="button"
              role="tab"
              aria-selected={periodType === type}
              className={`bh-tab${periodType === type ? " on" : ""}`}
              onClick={() => setPeriodType(type)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="bh-zones">
        {/* MONEY ZONE */}
        <section className="bh-panel money">
          <PanelHead icon={DollarSign} title="Money" sub="Unit economics and revenue efficiency" />
          <div className="bh-pgrid">
            <AutoStat
              tone="amber"
              icon={UserCheck}
              label="CAC"
              value={formatMoney(computed.cac)}
              sub="cost to acquire a client"
              chip={chipFor("cac")}
            />
            <AutoStat
              tone="green"
              icon={HeartHandshake}
              label="Avg LTV"
              value={formatMoney(computed.avgLtv)}
              sub="lifetime value per client"
            />
            <AutoStat
              tone="indigo"
              icon={LineChart}
              label="LTV : CAC"
              value={ratio(computed.ltvCac)}
              sub="return per acquisition dollar"
              chip={chipFor("ltvCac")}
            />
            <AutoStat
              tone="green"
              icon={TrendingUp}
              label="ROAS"
              value={ratio(computed.roas)}
              sub="revenue per ad dollar"
              chip={chipFor("roas")}
            />
            <InputStat
              tone="sky"
              icon={Repeat}
              label="New MRR"
              pre="$"
              value={draft.newMrr}
              onChange={(v) => setField("newMrr", v)}
              sub="recurring revenue added"
            />
            <InputStat
              tone="green"
              icon={Percent}
              label="Profit Margin"
              unit="%"
              value={draft.profitMarginPct}
              onChange={(v) => setField("profitMarginPct", v)}
              sub="after delivery cost"
              chip={chipFor("margin")}
            />
            <InputStat
              tone="amber"
              icon={DollarSign}
              label="Marketing Spend"
              pre="$"
              value={draft.marketingSpend}
              onChange={(v) => setField("marketingSpend", v)}
              sub="feeds CAC and ROAS"
            />
            <InputStat
              tone="sky"
              icon={Activity}
              label="New Revenue"
              pre="$"
              value={draft.newRevenue}
              onChange={(v) => setField("newRevenue", v)}
              sub="first-order revenue"
            />
          </div>
        </section>

        {/* CLIENTS & RETENTION ZONE */}
        <section className="bh-panel clients">
          <PanelHead
            icon={Users}
            title="Clients & Retention"
            sub="Roster movement and staying power"
          />
          <div className="bh-pgrid">
            {/* Total Clients: computed end count + the start/new/churned breakdown */}
            <div className="bh-stat indigo bh-span2">
              <span className="bh-auto">Auto</span>
              <div className="bh-ico">
                <Users size={17} />
              </div>
              <div className="bh-lbl">Total Clients</div>
              <div className="bh-val bh-disp">
                <span>{computed.endClients}</span>
              </div>
              <div className="bh-sub">active at period end (start + new - churned)</div>
              <div className="bh-breakdown">
                <BreakdownInput
                  label="Start"
                  value={draft.startClients}
                  onChange={(v) => setField("startClients", v)}
                />
                <BreakdownInput
                  label="New"
                  value={draft.newClients}
                  onChange={(v) => setField("newClients", v)}
                />
                <BreakdownInput
                  label="Churned"
                  value={draft.churnedClients}
                  onChange={(v) => setField("churnedClients", v)}
                />
                <div className="bh-bk calc">
                  <span className="bh-bk-l">End</span>
                  <span className="bh-bk-v">{computed.endClients}</span>
                </div>
              </div>
            </div>

            <InputStat
              tone="rose"
              icon={TrendingDown}
              label="Churn"
              unit="%"
              value={draft.churnPct}
              onChange={(v) => setField("churnPct", v)}
              sub="monthly logo churn"
              chip={chipFor("churn")}
            />
            <InputStat
              tone="indigo"
              icon={Clock}
              label="Avg Retention"
              unit="mo"
              value={draft.avgRetentionMonths}
              onChange={(v) => setField("avgRetentionMonths", v)}
              sub="how long clients stay"
            />
            <InputStat
              tone="sky"
              icon={Calendar}
              label="Avg Revenue / Client"
              pre="$"
              unit="/mo"
              span2
              value={draft.avgRevenuePerClient}
              onChange={(v) => setField("avgRevenuePerClient", v)}
              sub="average monthly billing across the roster"
            />
          </div>
        </section>
      </div>

      <div className="bh-footnote">
        {query.isError
          ? "Could not load this period. Your edits still save when the connection returns."
          : "Manual entry. Type into any tinted tile and the Auto tiles recompute live; each edit saves to this period."}
      </div>
    </div>
  );
}

// ---- presentational pieces ------------------------------------------------

function PanelHead({ icon: Icon, title, sub }: { icon: LucideIcon; title: string; sub: string }) {
  return (
    <div className="bh-phead">
      <div className="bh-phico">
        <Icon size={17} />
      </div>
      <div>
        <div className="bh-pht">{title}</div>
        <div className="bh-phs">{sub}</div>
      </div>
    </div>
  );
}

type Tone = "indigo" | "green" | "sky" | "amber" | "rose";

function Chip({ res }: { res: BenchResult }) {
  return (
    <span className={`bh-chip ${res.tone}`}>
      {res.tone === "ok" ? <Check size={12} /> : <AlertCircle size={12} />}
      {res.label}
    </span>
  );
}

function AutoStat({
  tone,
  icon: Icon,
  label,
  value,
  sub,
  chip,
}: {
  tone: Tone;
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
  chip?: BenchResult;
}) {
  return (
    <div className={`bh-stat ${tone}`}>
      <span className="bh-auto">Auto</span>
      <div className="bh-ico">
        <Icon size={17} />
      </div>
      <div className="bh-lbl">{label}</div>
      <div className="bh-val bh-disp">
        <span>{value}</span>
      </div>
      <div className="bh-sub">{sub}</div>
      {chip && <Chip res={chip} />}
    </div>
  );
}

function InputStat({
  tone,
  icon: Icon,
  label,
  value,
  onChange,
  sub,
  pre,
  unit,
  chip,
  span2,
}: {
  tone: Tone;
  icon: LucideIcon;
  label: string;
  value: string;
  onChange: (v: string) => void;
  sub: string;
  pre?: string;
  unit?: string;
  chip?: BenchResult;
  span2?: boolean;
}) {
  return (
    <div className={`bh-stat ${tone}${span2 ? " bh-span2" : ""}`}>
      <div className="bh-ico">
        <Icon size={17} />
      </div>
      <div className="bh-lbl">{label}</div>
      <div className="bh-val">
        {pre && <span className="bh-pre">{pre}</span>}
        <input
          className="bh-vin"
          type="text"
          inputMode="decimal"
          value={value}
          aria-label={label}
          onFocus={(e) => e.target.select()}
          onChange={(e) => onChange(e.target.value)}
        />
        {unit && <span className="bh-unit">{unit}</span>}
      </div>
      <div className="bh-sub">{sub}</div>
      {chip && <Chip res={chip} />}
    </div>
  );
}

function BreakdownInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="bh-bk">
      <span className="bh-bk-l">{label}</span>
      <input
        className="bh-mini"
        type="text"
        inputMode="numeric"
        value={value}
        aria-label={label}
        onFocus={(e) => e.target.select()}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// Scoped style block. Ported from docs/mockups/admin-redesign/business-health-B.html,
// prefixed .bh-* and re-tokenised onto the Modern Motion admin theme, keeping the
// five tinted stat palettes explicit so the bento stays colorful in light + dark.
function BusinessHealthStyle() {
  return (
    <style>{`
      .pk-kit .bh-controls { display: flex; align-items: center; gap: 16px; margin-top: 18px; flex-wrap: wrap; }
      .pk-kit .bh-tabs { display: inline-flex; gap: 4px; background: var(--surface-2); padding: 5px; border-radius: 15px; margin-left: auto; }
      .pk-kit .bh-tab { border: 0; background: transparent; cursor: pointer; font: inherit; font-size: 13.5px; font-weight: 600; color: var(--text-muted); padding: 8px 16px; border-radius: 11px; transition: color .15s, background .15s, box-shadow .15s; }
      .pk-kit .bh-tab:hover { color: var(--text); }
      .pk-kit .bh-tab.on { background: var(--surface); color: var(--text); box-shadow: var(--shadow-sm); }

      .pk-kit .bh-zones { display: grid; grid-template-columns: 1.15fr 1fr; gap: 16px; align-items: start; margin-top: 20px; }
      @media (max-width: 1080px) { .pk-kit .bh-zones { grid-template-columns: 1fr; } }

      .pk-kit .bh-panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 18px 18px 20px; box-shadow: var(--shadow-sm); }
      .pk-kit .bh-phead { display: flex; align-items: center; gap: 10px; padding: 2px 4px 14px; }
      .pk-kit .bh-phico { width: 30px; height: 30px; border-radius: 10px; display: grid; place-items: center; color: #fff; flex-shrink: 0; }
      .pk-kit .bh-panel.money .bh-phico { background: linear-gradient(135deg,#10b981,#0ea5e9); }
      .pk-kit .bh-panel.clients .bh-phico { background: linear-gradient(135deg,#6366f1,#8b5cf6); }
      .pk-kit .bh-pht { font-family: var(--font-display); font-weight: 600; font-size: 16.5px; }
      .pk-kit .bh-phs { font-size: 12px; color: var(--text-faint); margin-top: 1px; }

      .pk-kit .bh-pgrid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
      @media (max-width: 720px) { .pk-kit .bh-pgrid { grid-template-columns: 1fr; } .pk-kit .bh-span2 { grid-column: span 1; } .pk-kit .bh-tabs { margin-left: 0; } }

      .pk-kit .bh-stat { position: relative; border-radius: 18px; padding: 15px 16px; display: flex; flex-direction: column; }
      .pk-kit .bh-stat.indigo { background: #eef0ff; } .pk-kit .bh-stat.green { background: #e7f7f0; }
      .pk-kit .bh-stat.sky { background: #e6f5fd; } .pk-kit .bh-stat.amber { background: #fdf3e2; }
      .pk-kit .bh-stat.rose { background: #fdecec; }
      [data-theme="dark"] .pk-kit .bh-stat.indigo { background: rgba(99,102,241,.16); }
      [data-theme="dark"] .pk-kit .bh-stat.green { background: rgba(16,185,129,.15); }
      [data-theme="dark"] .pk-kit .bh-stat.sky { background: rgba(14,165,233,.15); }
      [data-theme="dark"] .pk-kit .bh-stat.amber { background: rgba(245,158,11,.15); }
      [data-theme="dark"] .pk-kit .bh-stat.rose { background: rgba(239,68,68,.15); }

      .pk-kit .bh-ico { width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; color: #fff; margin-bottom: 9px; }
      .pk-kit .bh-stat.indigo .bh-ico { background: #6366f1; } .pk-kit .bh-stat.green .bh-ico { background: #10b981; }
      .pk-kit .bh-stat.sky .bh-ico { background: #0ea5e9; } .pk-kit .bh-stat.amber .bh-ico { background: #f59e0b; }
      .pk-kit .bh-stat.rose .bh-ico { background: #ef4444; }

      .pk-kit .bh-lbl { font-size: 12.5px; font-weight: 600; color: var(--text-muted); }
      .pk-kit .bh-sub { font-size: 11.5px; color: var(--text-faint); margin-top: 3px; }

      .pk-kit .bh-val { display: flex; align-items: baseline; gap: 1px; margin-top: 2px; font-family: var(--font-display); font-weight: 700; font-size: 27px; letter-spacing: -.02em; color: var(--text); font-variant-numeric: tabular-nums; }
      .pk-kit .bh-val .bh-pre, .pk-kit .bh-val .bh-unit { color: var(--text-muted); }
      .pk-kit .bh-unit { font-size: 16px; }
      .pk-kit .bh-vin { border: 0; background: transparent; color: var(--text); padding: 2px 3px; border-radius: 9px; width: 4.5ch; min-width: 1ch; max-width: 100%; font: inherit; font-variant-numeric: tabular-nums; transition: background .12s, box-shadow .12s; }
      .pk-kit .bh-vin:hover { background: color-mix(in srgb, var(--surface) 60%, transparent); }
      .pk-kit .bh-vin:focus { outline: 0; background: var(--surface); box-shadow: 0 0 0 2px var(--brand); position: relative; z-index: 1; }

      .pk-kit .bh-chip { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 999px; margin-top: 9px; width: fit-content; }
      .pk-kit .bh-chip.ok { background: rgba(16,185,129,.16); color: #0a7d58; }
      .pk-kit .bh-chip.watch { background: rgba(245,158,11,.18); color: #9a6206; }
      .pk-kit .bh-chip.bad { background: rgba(239,68,68,.14); color: #c23434; }
      [data-theme="dark"] .pk-kit .bh-chip.ok { color: #34d399; }
      [data-theme="dark"] .pk-kit .bh-chip.watch { color: #fbbf24; }
      [data-theme="dark"] .pk-kit .bh-chip.bad { color: #f87171; }

      .pk-kit .bh-auto { position: absolute; top: 13px; right: 13px; font-size: 9px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--text-faint); background: color-mix(in srgb, var(--surface) 65%, transparent); border: 1px solid var(--border); padding: 3px 6px; border-radius: 999px; }

      .pk-kit .bh-span2 { grid-column: span 2; }
      .pk-kit .bh-breakdown { display: flex; gap: 8px; margin-top: 11px; }
      .pk-kit .bh-bk { flex: 1; background: color-mix(in srgb, var(--surface) 55%, transparent); border-radius: 11px; padding: 7px 9px; min-width: 0; }
      [data-theme="dark"] .pk-kit .bh-bk { background: rgba(255,255,255,.06); }
      .pk-kit .bh-bk-l { display: block; font-size: 10px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--text-faint); }
      .pk-kit .bh-mini { border: 0; background: transparent; font-family: var(--font-display); font-weight: 700; font-size: 17px; color: var(--text); width: 100%; padding: 2px; border-radius: 7px; font-variant-numeric: tabular-nums; }
      .pk-kit .bh-mini:hover { background: color-mix(in srgb, var(--surface) 70%, transparent); }
      [data-theme="dark"] .pk-kit .bh-mini:hover { background: rgba(255,255,255,.08); }
      .pk-kit .bh-mini:focus { outline: 0; background: var(--surface); box-shadow: 0 0 0 2px #0ea5e9; }
      .pk-kit .bh-bk.calc .bh-bk-v { font-family: var(--font-display); font-weight: 700; font-size: 17px; color: var(--text-muted); display: block; padding: 2px; }

      .pk-kit .bh-footnote { font-size: 11px; color: var(--text-faint); padding: 14px 2px 4px; }
    `}</style>
  );
}
