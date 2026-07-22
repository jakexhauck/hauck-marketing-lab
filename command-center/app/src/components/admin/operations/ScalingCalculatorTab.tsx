import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Calendar,
  ChevronRight,
  ClipboardList,
  CornerDownRight,
  Phone,
  Users,
  Zap,
} from "lucide-react";
import {
  computeScaling,
  formatScaling,
  DAYS_PER_MONTH,
  DEFAULT_INPUTS,
  type ScalingInputs,
} from "../../../lib/scalingCalculator";
import {
  useScalingCalculatorQuery,
  useSaveScalingCalculatorMutation,
} from "../../../hooks/useApi";

// The Operations pillar's Calculator tab: seven inputs in one compact card above
// a result row that ends in the oversized daily-target hero. Ported from
// command-center/docs/mockups/admin-redesign/scaling-calculator-C.html; the
// header, tagline and tab bar come from the shared PillarPage shell, so this
// renders only the stage contents.
//
// The compute is entirely client-side and synchronous (every keystroke
// recomputes all five outputs, no round-trip). Persistence is a debounced
// convenience on top: it remembers Jake's last numbers, it never gates the
// numbers on screen. The math itself lives in lib/scalingCalculator.ts.

type ScalingField = keyof ScalingInputs;

// Draft state is the raw string as typed, so a half-entered or cleared field
// stays exactly as typed instead of snapping back to a coerced number.
type Draft = Record<ScalingField, string>;

interface FieldDef {
  key: ScalingField;
  label: string;
  affix: "money" | "pct";
}

const FIELDS: FieldDef[] = [
  { key: "currentRevenue", label: "Current Revenue", affix: "money" },
  { key: "monthlyCashGoal", label: "Monthly Cash Goal", affix: "money" },
  { key: "offerPrice", label: "Offer Price", affix: "money" },
  { key: "avgCashClose", label: "Avg Cash / Close", affix: "money" },
  { key: "closingPct", label: "Closing %", affix: "pct" },
  { key: "showRatePct", label: "Show Rate %", affix: "pct" },
  { key: "bookingRatePct", label: "Booking Rate %", affix: "pct" },
];

function toDraft(inputs: ScalingInputs): Draft {
  return {
    currentRevenue: String(inputs.currentRevenue),
    monthlyCashGoal: String(inputs.monthlyCashGoal),
    offerPrice: String(inputs.offerPrice),
    avgCashClose: String(inputs.avgCashClose),
    closingPct: String(inputs.closingPct),
    showRatePct: String(inputs.showRatePct),
    bookingRatePct: String(inputs.bookingRatePct),
  };
}

// Tolerant parse, matching the mockup: strip grouping commas, anything
// unparseable (blank, "-", mid-typing ".") reads as 0.
function parseField(value: string): number {
  const n = parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function toInputs(draft: Draft): ScalingInputs {
  return {
    currentRevenue: parseField(draft.currentRevenue),
    monthlyCashGoal: parseField(draft.monthlyCashGoal),
    offerPrice: parseField(draft.offerPrice),
    avgCashClose: parseField(draft.avgCashClose),
    closingPct: parseField(draft.closingPct),
    showRatePct: parseField(draft.showRatePct),
    bookingRatePct: parseField(draft.bookingRatePct),
  };
}

// Stable field order, so a saved payload and a freshly loaded row compare equal
// as strings and an unchanged form never writes.
function serialize(inputs: ScalingInputs): string {
  return FIELDS.map((f) => `${f.key}:${inputs[f.key]}`).join("|");
}

const SAVE_DEBOUNCE_MS = 600;

export default function ScalingCalculatorTab() {
  const query = useScalingCalculatorQuery();
  const saveMutation = useSaveScalingCalculatorMutation();
  const saveRef = useRef(saveMutation.mutate);
  saveRef.current = saveMutation.mutate;

  // Start on the defaults so the tiles have real numbers on first paint rather
  // than a blank flash while the stored row loads.
  const [draft, setDraft] = useState<Draft>(() => toDraft(DEFAULT_INPUTS));

  // Seed from the stored row exactly once. Later refetches (the save
  // invalidates its own key) must not overwrite whatever Jake is typing.
  const hydrated = useRef(false);
  // The last state known to match the server, so hydrating does not immediately
  // write the same numbers straight back.
  const lastSaved = useRef<string | null>(null);
  const stored = query.data;
  useEffect(() => {
    if (hydrated.current || !stored) return;
    hydrated.current = true;
    lastSaved.current = serialize(stored);
    setDraft(toDraft(stored));
  }, [stored]);

  const inputs = toInputs(draft);
  const outputs = computeScaling(inputs);
  const inputsRef = useRef(inputs);
  inputsRef.current = inputs;

  // Debounced persist. Skipped until the stored row has loaded, so the initial
  // defaults never overwrite saved numbers on a slow connection.
  const payload = serialize(inputs);
  useEffect(() => {
    if (!hydrated.current || lastSaved.current === payload) return;
    const timer = setTimeout(() => {
      lastSaved.current = payload;
      saveRef.current(inputsRef.current);
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [payload]);

  const setField = (key: ScalingField, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="sc">
      <ScalingStyle />

      <section className="sc-card">
        <div className="sc-head">
          <div className="sc-head-ic" aria-hidden>
            <ClipboardList size={16} />
          </div>
          <div>
            <div className="sc-head-t">Your Numbers</div>
            <div className="sc-head-s">All seven inputs, one compact card.</div>
          </div>
          <span className="sc-note">
            <AlertTriangle size={13} aria-hidden />
            Heavily underestimate your KPIs so it becomes impossible not to hit target.
          </span>
        </div>

        <div className="sc-grid">
          {FIELDS.map((f) => (
            <div className="sc-cell" key={f.key}>
              <label className="sc-flab" htmlFor={`sc-${f.key}`}>
                {f.label}
              </label>
              <span className={`sc-fwrap ${f.affix}`}>
                {f.affix === "money" && <i aria-hidden>$</i>}
                <input
                  id={`sc-${f.key}`}
                  type="text"
                  inputMode="decimal"
                  value={draft[f.key]}
                  onChange={(e) => setField(f.key, e.target.value)}
                />
                {f.affix === "pct" && <i aria-hidden>%</i>}
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="sc-rrow">
        <StatTile
          tone="indigo"
          icon={<Users size={19} />}
          label="New Clients Needed"
          value={formatScaling(outputs.newClientsNeeded)}
          sub="goal ÷ avg cash / close"
        />
        <StatTile
          tone="sky"
          icon={<CornerDownRight size={19} />}
          label="Calls / Shows Needed"
          value={formatScaling(outputs.callsShowsNeeded)}
          sub="clients ÷ closing %"
        />
        <StatTile
          tone="amber"
          icon={<Phone size={19} />}
          label="Total Calls Needed"
          value={formatScaling(outputs.totalCallsNeeded)}
          sub="shows ÷ show rate %"
        />
        <StatTile
          tone="green"
          icon={<Calendar size={19} />}
          label="Total Monthly Input"
          value={formatScaling(outputs.totalMonthlyInput)}
          sub="calls ÷ booking rate %"
        />

        <div className="sc-hero">
          <span className="sc-hbadge">
            <Zap size={13} aria-hidden />
            Daily target
          </span>
          <div className="sc-hk">Total Daily Input Needed</div>
          <div className="sc-hv">{formatScaling(outputs.totalDailyInput)}</div>
          <div className="sc-hs">
            Monthly input ÷ {DAYS_PER_MONTH} days. This is the one number you protect.
          </div>
        </div>
      </div>
    </div>
  );
}

function StatTile({
  tone,
  icon,
  label,
  value,
  sub,
}: {
  tone: "indigo" | "sky" | "amber" | "green";
  icon: ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className={`sc-stat ${tone}`}>
      {/* The chevron sits in the gutter to the right, reading the row as a
          left-to-right chain. Decorative: hidden narrow, where the row wraps. */}
      <span className="sc-arrow" aria-hidden>
        <ChevronRight size={14} strokeWidth={2.4} />
      </span>
      <div className="sc-stat-ic" aria-hidden>
        {icon}
      </div>
      <div className="sc-stat-lbl">{label}</div>
      <div className="sc-stat-val">{value}</div>
      <div className="sc-stat-sub">{sub}</div>
    </div>
  );
}

// Bento Bold styles, ported from the approved mockup and scoped to .pk-kit so
// they read the admin theme tokens and work in light and dark. Every class is
// sc- prefixed: the mockup's bare .stat / .hero / .cc-grid / .fwrap would
// collide with the other admin surfaces sharing this theme.
function ScalingStyle() {
  return (
    <style>{`
      .pk-kit {
        --sc-indigo: #6366f1; --sc-indigo-tint: #eef0ff;
        --sc-green: #10b981;  --sc-green-tint: #e7f7f0;
        --sc-sky: #0ea5e9;    --sc-sky-tint: #e6f5fd;
        --sc-amber: #f59e0b;  --sc-amber-tint: #fdf3e2;
        --sc-note-fg: #8a5a08;
        --sc-cell-bg: #f7f8fb;
        --sc-radius: 22px;
      }
      [data-theme="dark"] .pk-kit {
        --sc-indigo-tint: rgba(99,102,241,.18);
        --sc-green-tint: rgba(16,185,129,.15);
        --sc-sky-tint: rgba(14,165,233,.15);
        --sc-amber-tint: rgba(245,158,11,.15);
        --sc-note-fg: #f0b45c;
        --sc-cell-bg: rgba(255,255,255,.04);
      }

      .pk-kit .sc { display: flex; flex-direction: column; gap: 14px; }

      /* Compact inputs card */
      .pk-kit .sc-card {
        background: var(--surface); border: 1px solid var(--border);
        border-radius: var(--sc-radius); box-shadow: var(--shadow-md); padding: 16px 20px;
      }
      .pk-kit .sc-head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
      .pk-kit .sc-head-ic {
        width: 30px; height: 30px; border-radius: 10px; flex-shrink: 0;
        display: grid; place-items: center; color: #fff; background: var(--grad-brand);
      }
      .pk-kit .sc-head-t { font-family: var(--font-display); font-weight: 600; font-size: 15px; color: var(--text); }
      .pk-kit .sc-head-s { font-size: 12px; color: var(--text-faint); }
      .pk-kit .sc-note {
        margin-left: auto; display: inline-flex; align-items: center; gap: 7px;
        font-size: 12px; font-weight: 500; color: var(--sc-note-fg);
        background: var(--sc-amber-tint); padding: 6px 11px; border-radius: 999px;
      }
      .pk-kit .sc-note svg { color: var(--sc-amber); flex-shrink: 0; }

      .pk-kit .sc-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 10px; }
      .pk-kit .sc-cell {
        display: flex; flex-direction: column; gap: 5px; padding: 10px 12px;
        background: var(--sc-cell-bg); border: 1px solid var(--border); border-radius: 14px;
      }
      .pk-kit .sc-flab {
        font-size: 11.5px; font-weight: 500; color: var(--text-muted);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .pk-kit .sc-fwrap { display: inline-flex; align-items: baseline; }
      .pk-kit .sc-fwrap i { font-style: normal; color: var(--text-faint); font-size: 15px; font-weight: 600; }
      .pk-kit .sc-fwrap.money i { margin-right: 1px; }
      .pk-kit .sc-fwrap.pct i { margin-left: 1px; }
      .pk-kit .sc-fwrap input {
        border: 0; background: transparent; font-family: var(--font-display); font-weight: 600;
        font-size: 20px; letter-spacing: -.01em; color: var(--text); width: 100%; min-width: 0;
        padding: 2px 0; font-variant-numeric: tabular-nums; border-bottom: 2px solid transparent;
      }
      .pk-kit .sc-fwrap input:focus { outline: 0; border-bottom-color: var(--sc-indigo); }

      /* Results row: four tiles then the oversized daily hero. */
      .pk-kit .sc-rrow { display: grid; grid-template-columns: repeat(4, 1fr) 1.5fr; gap: 14px; }
      .pk-kit .sc-stat { border-radius: var(--sc-radius); padding: 20px; position: relative; }
      .pk-kit .sc-stat.indigo { background: var(--sc-indigo-tint); }
      .pk-kit .sc-stat.green { background: var(--sc-green-tint); }
      .pk-kit .sc-stat.sky { background: var(--sc-sky-tint); }
      .pk-kit .sc-stat.amber { background: var(--sc-amber-tint); }
      .pk-kit .sc-stat-ic {
        width: 36px; height: 36px; border-radius: 11px; display: grid; place-items: center;
        color: #fff; margin-bottom: 14px;
      }
      .pk-kit .sc-stat.indigo .sc-stat-ic { background: var(--sc-indigo); }
      .pk-kit .sc-stat.green .sc-stat-ic { background: var(--sc-green); }
      .pk-kit .sc-stat.sky .sc-stat-ic { background: var(--sc-sky); }
      .pk-kit .sc-stat.amber .sc-stat-ic { background: var(--sc-amber); }
      .pk-kit .sc-stat-lbl { font-size: 13px; font-weight: 600; color: var(--text-muted); }
      .pk-kit .sc-stat-val {
        font-family: var(--font-display); font-weight: 700; font-size: 38px; letter-spacing: -.02em;
        margin-top: 4px; color: var(--text); font-variant-numeric: tabular-nums;
      }
      .pk-kit .sc-stat-sub { font-size: 11.5px; color: var(--text-faint); margin-top: 6px; }
      .pk-kit .sc-arrow {
        position: absolute; top: 50%; right: -21px; z-index: 3; transform: translateY(-50%);
        width: 26px; height: 26px; border-radius: 50%; background: var(--surface);
        display: grid; place-items: center; color: var(--text-faint);
        box-shadow: 0 2px 8px -2px rgba(20,22,28,.2);
      }

      .pk-kit .sc-hero {
        border-radius: var(--sc-radius); padding: 24px 26px; position: relative; overflow: hidden;
        background: var(--grad-brand); color: #fff; box-shadow: 0 18px 40px -18px rgba(99,102,241,.85);
        display: flex; flex-direction: column; justify-content: center;
      }
      .pk-kit .sc-hero::after {
        content: ""; position: absolute; right: -60px; top: -70px; width: 230px; height: 230px;
        border-radius: 50%; background: rgba(255,255,255,.12);
      }
      .pk-kit .sc-hbadge {
        position: absolute; top: 22px; right: 24px; z-index: 1;
        display: inline-flex; align-items: center; gap: 6px; background: rgba(255,255,255,.16);
        padding: 6px 11px; border-radius: 999px; font-size: 11.5px; font-weight: 600;
      }
      .pk-kit .sc-hk {
        font-size: 12px; font-weight: 600; letter-spacing: .13em; text-transform: uppercase;
        color: rgba(255,255,255,.82);
      }
      .pk-kit .sc-hv {
        font-family: var(--font-display); font-weight: 700; font-size: 92px; line-height: .95;
        letter-spacing: -.03em; margin: 6px 0 4px; font-variant-numeric: tabular-nums;
      }
      .pk-kit .sc-hs { font-size: 13.5px; color: rgba(255,255,255,.85); max-width: 260px; }

      @media (max-width: 1180px) {
        .pk-kit .sc-rrow { grid-template-columns: repeat(2, 1fr); }
        .pk-kit .sc-hero { grid-column: 1 / -1; }
        .pk-kit .sc-arrow { display: none; }
      }
      @media (max-width: 980px) { .pk-kit .sc-grid { grid-template-columns: repeat(4, 1fr); } }
      @media (max-width: 620px) {
        .pk-kit .sc-grid { grid-template-columns: repeat(2, 1fr); }
        .pk-kit .sc-rrow { grid-template-columns: 1fr; }
        .pk-kit .sc-hv { font-size: 74px; }
        .pk-kit .sc-note { margin-left: 0; }
      }
    `}</style>
  );
}
