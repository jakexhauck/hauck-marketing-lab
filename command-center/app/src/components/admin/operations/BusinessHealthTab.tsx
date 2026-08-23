import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  Calendar,
  Check,
  Clock,
  DollarSign,
  Heart,
  LineChart,
  Percent,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  useAdminErrorsQuery,
  useBusinessHealthQuery,
  useSaveBusinessHealthMutation,
} from "../../../hooks/useApi";
import { formatMoney } from "../../../lib/format";
import {
  EMPTY_INPUTS,
  benchmark,
  computeMetrics,
  formatRatio,
  periodKey,
  type BenchKind,
  type BusinessHealthInputs,
  type Computed,
  type PeriodType,
} from "../../../lib/businessHealth";

// The Operations pillar's Business Health tab: the whole-agency numbers. This
// used to be the Command home; Command is now the shortcut launcher, so the
// numbers live here as a page of their own.
//
// Two zoned panels (Money, Clients & Retention) over one period at a time.
// Every tinted tile is a hand-entered input; every "Auto" tile is computed from
// those inputs on each render, so the dashboard recomputes as you type exactly
// like the approved mockup. Phase 1 is manual entry, which is why "Auto" means
// "derived", not "pulled from GHL/Meta".
//
// Persistence is one row per period key (see migration 0030): switching the
// toggle loads a different row, and a period nobody has filled in opens
// all-zero rather than showing fabricated numbers.
//
// The kicker, title and pillar tab bar come from PillarPage, so this renders
// only the controls row, the two panels and its own scoped .bh-* block.

const PERIOD_TABS: { type: PeriodType; label: string }[] = [
  { type: "month", label: "This month" },
  { type: "quarter", label: "Quarter" },
  { type: "year", label: "Year" },
];

type Palette = "indigo" | "green" | "sky" | "amber" | "rose";

// An "Auto" tile: read-only, derived from the inputs on every render.
interface AutoTile {
  kind: "auto";
  key: keyof Computed;
  label: string;
  sub: string;
  icon: LucideIcon;
  palette: Palette;
  format: (c: Computed) => string;
  chip?: BenchKind;
}

// An input tile: the value IS the stored field.
interface InputTile {
  kind: "input";
  field: keyof BusinessHealthInputs;
  label: string;
  sub: string;
  icon: LucideIcon;
  palette: Palette;
  prefix?: string;
  unit?: string;
  chip?: BenchKind;
}

type Tile = AutoTile | InputTile;

const MONEY_TILES: Tile[] = [
  {
    kind: "auto",
    key: "cac",
    label: "CAC",
    sub: "cost to acquire a client",
    icon: UserCheck,
    palette: "amber",
    format: (c) => formatMoney(c.cac),
    chip: "cac",
  },
  {
    kind: "auto",
    key: "avgLtv",
    label: "Avg LTV",
    sub: "lifetime value per client",
    icon: Heart,
    palette: "green",
    format: (c) => formatMoney(c.avgLtv),
  },
  {
    kind: "auto",
    key: "ltvCac",
    label: "LTV : CAC",
    sub: "return per acquisition dollar",
    icon: LineChart,
    palette: "indigo",
    format: (c) => formatRatio(c.ltvCac),
    chip: "ltvCac",
  },
  {
    kind: "auto",
    key: "roas",
    label: "ROAS",
    sub: "revenue per ad dollar",
    icon: TrendingUp,
    palette: "green",
    format: (c) => formatRatio(c.roas),
    chip: "roas",
  },
  {
    kind: "input",
    field: "newMrr",
    label: "New MRR",
    sub: "recurring revenue added",
    icon: DollarSign,
    palette: "sky",
    prefix: "$",
  },
  {
    kind: "input",
    field: "profitMarginPct",
    label: "Profit Margin",
    sub: "after delivery cost",
    icon: Percent,
    palette: "green",
    unit: "%",
    chip: "margin",
  },
  {
    kind: "input",
    field: "marketingSpend",
    label: "Marketing Spend",
    sub: "feeds CAC and ROAS",
    icon: DollarSign,
    palette: "amber",
    prefix: "$",
  },
  {
    kind: "input",
    field: "newRevenue",
    label: "New Revenue",
    sub: "first-order revenue",
    icon: Activity,
    palette: "sky",
    prefix: "$",
  },
];

// Total Clients is rendered on its own (it carries the Start/New/Churned/End
// breakdown), so this list is the rest of the Clients panel.
const CLIENT_TILES: Tile[] = [
  {
    kind: "input",
    field: "churnPct",
    label: "Churn",
    sub: "monthly logo churn",
    icon: TrendingDown,
    palette: "rose",
    unit: "%",
    chip: "churn",
  },
  {
    kind: "input",
    field: "avgRetentionMonths",
    label: "Avg Retention",
    sub: "how long clients stay",
    icon: Clock,
    palette: "indigo",
    unit: " mo",
  },
];

// The value a chip reads, per benchmark kind. Two come from the derived
// metrics, three straight off the inputs.
function chipValue(kind: BenchKind, inputs: BusinessHealthInputs, computed: Computed): number {
  switch (kind) {
    case "cac":
      return computed.cac;
    case "ltvCac":
      return computed.ltvCac;
    case "roas":
      return computed.roas;
    case "churn":
      return inputs.churnPct;
    case "margin":
      return inputs.profitMarginPct;
  }
}

function BenchChip({ kind, value }: { kind: BenchKind; value: number }) {
  const res = benchmark(kind, value);
  return (
    <span className={`bh-chip ${res.tone}`}>
      {res.tone === "ok" ? <Check size={12} /> : <AlertCircle size={12} />}
      {res.label}
    </span>
  );
}

const AUTOSAVE_MS = 600;

// A debounced save plus the period it belongs to, so the write can never land
// under a period the numbers were not typed into.
interface PendingSave {
  period: string;
  periodType: PeriodType;
  inputs: Partial<BusinessHealthInputs>;
}

// Value inputs size to their content so the tile reads as text, not a form
// field. The slack matters: at the display font's weight a "0" is wider than
// 1ch, so sizing to the bare character count clips single-digit values.
function inputWidth(text: string): string {
  return `calc(${Math.max(1, text.length)}ch + 10px)`;
}

export default function BusinessHealthTab() {
  const [periodType, setPeriodType] = useState<PeriodType>("month");
  const period = periodKey(periodType);

  const query = useBusinessHealthQuery(period, true);
  const save = useSaveBusinessHealthMutation();

  // Local copy of the row so typing recomputes instantly, ahead of the save.
  const [inputs, setInputs] = useState<BusinessHealthInputs>(EMPTY_INPUTS);
  // Raw text for fields mid-edit, so a half-typed or cleared field does not
  // snap back to "0" under the cursor.
  const [drafts, setDrafts] = useState<Partial<Record<keyof BusinessHealthInputs, string>>>({});

  // Edits waiting on the debounce, carrying the period they were typed into.
  // The period is captured HERE rather than read at flush time: a flush can run
  // after a period switch (that switch is exactly what triggers it), and by then
  // the component is already rendering the new period, so reading the current
  // period at flush time files the old period's numbers under the new key.
  const pendingRef = useRef<PendingSave | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveMutate = save.mutate;
  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    if (!pending || Object.keys(pending.inputs).length === 0) return;
    pendingRef.current = null;
    saveMutate(pending);
  }, [saveMutate]);

  // Seed from the server row. Skipped while edits are pending so a response
  // landing mid-typing cannot clobber the field in hand.
  const serverInputs = query.data?.inputs;
  const serverStamp = query.data?.updatedAt ?? null;
  useEffect(() => {
    if (!serverInputs) return;
    if (pendingRef.current) return;
    setInputs(serverInputs);
    setDrafts({});
    // serverStamp changes on every save, which is what re-seeds after the
    // server clamps a value (a 340% margin comes back as 100).
  }, [serverInputs, serverStamp, period]);

  // A period switch must not strand an unsaved edit in the old period.
  useEffect(() => {
    return () => flush();
  }, [period, flush]);

  const setField = (field: keyof BusinessHealthInputs, raw: string) => {
    const parsed = Number(raw);
    const value = Number.isFinite(parsed) ? parsed : 0;
    setDrafts((d) => ({ ...d, [field]: raw }));
    setInputs((prev) => ({ ...prev, [field]: value }));

    const pending = pendingRef.current;
    // Only merge into edits for this same period; anything left over from
    // another period is its own save, not part of this one.
    if (pending && pending.period !== period) {
      saveMutate(pending);
      pendingRef.current = null;
    }
    const base = pendingRef.current?.inputs ?? {};
    pendingRef.current = { period, periodType, inputs: { ...base, [field]: value } };

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, AUTOSAVE_MS);
  };

  const clearDraft = (field: keyof BusinessHealthInputs) => {
    setDrafts((d) => {
      const next = { ...d };
      delete next[field];
      return next;
    });
  };

  const fieldText = (field: keyof BusinessHealthInputs) =>
    drafts[field] ?? String(inputs[field]);

  const computed = computeMetrics(inputs);

  const renderTile = (tile: Tile) => {
    const Icon = tile.icon;
    const isAuto = tile.kind === "auto";
    const key = isAuto ? tile.key : tile.field;
    const text = isAuto ? "" : fieldText(tile.field);
    return (
      <div key={key} className={`bh-stat ${tile.palette}`}>
        {isAuto && <span className="bh-auto">Auto</span>}
        <span className="bh-ico" aria-hidden>
          <Icon size={17} />
        </span>
        <div className="bh-lbl">{tile.label}</div>
        <div className="bh-val">
          {isAuto ? (
            <span className="bh-out">{tile.format(computed)}</span>
          ) : (
            <>
              {tile.prefix && <span className="bh-fix">{tile.prefix}</span>}
              <input
                className="bh-vin"
                inputMode="decimal"
                aria-label={tile.label}
                value={text}
                style={{ width: inputWidth(text) }}
                onChange={(e) => setField(tile.field, e.target.value)}
                onBlur={() => {
                  clearDraft(tile.field);
                  flush();
                }}
              />
              {tile.unit && <span className="bh-fix bh-unit">{tile.unit}</span>}
            </>
          )}
        </div>
        <div className="bh-sub">{tile.sub}</div>
        {tile.chip && <BenchChip kind={tile.chip} value={chipValue(tile.chip, inputs, computed)} />}
      </div>
    );
  };

  const breakdown: { field: keyof BusinessHealthInputs; label: string }[] = [
    { field: "startClients", label: "Start" },
    { field: "newClients", label: "New" },
    { field: "churnedClients", label: "Churned" },
  ];

  return (
    <div>
      <BusinessHealthStyle />

      <div className="bh-controls" style={{ marginTop: 0 }}>
        <div className="bh-tabs" role="tablist" aria-label="Period">
          {PERIOD_TABS.map((tab) => (
            <button
              key={tab.type}
              type="button"
              role="tab"
              aria-selected={periodType === tab.type}
              className={`bh-tab${periodType === tab.type ? " on" : ""}`}
              onClick={() => setPeriodType(tab.type)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bh-zones">
        {/* Money: unit economics and revenue efficiency. */}
        <section className="bh-panel">
          <div className="bh-phead">
            <span className="bh-phico money" aria-hidden>
              <DollarSign size={17} />
            </span>
            <div>
              <div className="bh-pht">Money</div>
              <div className="bh-phs">Unit economics and revenue efficiency</div>
            </div>
          </div>
          <div className="bh-grid">{MONEY_TILES.map(renderTile)}</div>
        </section>

        {/* Clients & Retention: roster movement and staying power. */}
        <section className="bh-panel">
          <div className="bh-phead">
            <span className="bh-phico clients" aria-hidden>
              <Users size={17} />
            </span>
            <div>
              <div className="bh-pht">Clients &amp; Retention</div>
              <div className="bh-phs">Roster movement and staying power</div>
            </div>
          </div>
          <div className="bh-grid">
            <div className="bh-stat indigo bh-span2">
              <span className="bh-auto">Auto</span>
              <span className="bh-ico" aria-hidden>
                <Users size={17} />
              </span>
              <div className="bh-lbl">Total Clients</div>
              <div className="bh-val">
                <span className="bh-out">{computed.endClients}</span>
              </div>
              <div className="bh-sub">active at period end (start + new, less churned)</div>
              <div className="bh-breakdown">
                {breakdown.map((b) => {
                  const text = fieldText(b.field);
                  return (
                    <div key={b.field} className="bh-bk">
                      <span className="bh-bk-l">{b.label}</span>
                      <input
                        className="bh-mini"
                        inputMode="numeric"
                        aria-label={`${b.label} clients`}
                        value={text}
                        onChange={(e) => setField(b.field, e.target.value)}
                        onBlur={() => {
                          clearDraft(b.field);
                          flush();
                        }}
                      />
                    </div>
                  );
                })}
                <div className="bh-bk calc">
                  <span className="bh-bk-l">End</span>
                  <span className="bh-bk-v">{computed.endClients}</span>
                </div>
              </div>
            </div>

            {CLIENT_TILES.map(renderTile)}

            <div className="bh-stat sky bh-span2">
              <span className="bh-ico" aria-hidden>
                <Calendar size={17} />
              </span>
              <div className="bh-lbl">Avg Revenue / Client</div>
              <div className="bh-val">
                <span className="bh-fix">$</span>
                <input
                  className="bh-vin"
                  inputMode="decimal"
                  aria-label="Average revenue per client"
                  value={fieldText("avgRevenuePerClient")}
                  style={{ width: inputWidth(fieldText("avgRevenuePerClient")) }}
                  onChange={(e) => setField("avgRevenuePerClient", e.target.value)}
                  onBlur={() => {
                    clearDraft("avgRevenuePerClient");
                    flush();
                  }}
                />
                <span className="bh-fix bh-unit">/mo</span>
              </div>
              <div className="bh-sub">average monthly billing across the roster</div>
            </div>
          </div>
        </section>
      </div>

      <div className="bh-foot">
        {query.isError
          ? "Could not load this period."
          : query.isLoading
            ? "Loading this period..."
            : save.isError
              ? "Could not save the last change."
              : serverStamp
                ? "Saved. Every tinted tile is hand-entered; the Auto tiles compute from them."
                : "Empty period. Type into any tinted tile to start it."}
      </div>

      <BackgroundErrors />
    </div>
  );
}

// The readable end of error_log (0119): what broke in the background while
// nobody was watching. Burst counts answer "is something systemic wrong";
// the list answers "what exactly". Deliberately plain: this is a receipt
// reader, not a dashboard.
function BackgroundErrors() {
  const query = useAdminErrorsQuery(true);

  if (query.isLoading) {
    return (
      <div className="bh-foot" role="status">
        Loading background failures...
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div className="bh-foot" role="status">
        Background failure receipts did not load.
      </div>
    );
  }

  const { counts, latest } = query.data;
  return (
    <section
      className="bh-panel"
      aria-label="Background failures"
      style={{ marginTop: "var(--space-4, 16px)" }}
    >
      <div className="bh-phead">
        <span className="bh-phico" style={{ background: "var(--danger-tint, #fee2e2)", color: "var(--danger)" }} aria-hidden>
          <TriangleAlert size={17} />
        </span>
        <div>
          <div className="bh-pht">Background failures</div>
          <div className="bh-phs">
            {counts.hour} in the last hour, {counts.day} in the last 24. A burst means something systemic.
          </div>
        </div>
      </div>
      {latest.length === 0 ? (
        <div className="bh-foot">None recorded. Quiet is the goal.</div>
      ) : (
        <div className="bh-grid" style={{ gridTemplateColumns: "1fr", gap: 0 }}>
          {latest.slice(0, 10).map((row) => (
            <div
              key={row.id}
              style={{
                display: "grid",
                gridTemplateColumns: "150px 110px 1fr",
                gap: "12px",
                padding: "8px 12px",
                borderBottom: "1px solid var(--divider)",
                fontSize: "12.5px",
                alignItems: "baseline",
              }}
            >
              <span className="tnum text-faint">
                {new Date(row.created_at).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
              <span className="font-semibold text-text">{row.source}</span>
              <span className="text-muted" style={{ overflowWrap: "anywhere" }}>
                {row.message}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// Business Health styles, scoped to .pk-kit so they read the Modern Motion
// tokens and work in light and dark. The five tinted stat palettes stay
// explicit (with dark variants) so the bento keeps its colour in both themes.
function BusinessHealthStyle() {
  return (
    <style>{`
      .pk-kit .bh-controls { display: flex; align-items: center; gap: 16px; margin-top: 18px; flex-wrap: wrap; }
      .pk-kit .bh-tabs {
        display: inline-flex; gap: 4px; margin-left: auto; padding: 5px; border-radius: 15px;
        background: color-mix(in srgb, var(--text) 6%, transparent);
      }
      .pk-kit .bh-tab {
        border: 0; background: transparent; cursor: pointer; font: inherit;
        font-size: 13.5px; font-weight: 600; color: var(--text-muted);
        padding: 8px 16px; border-radius: 11px; transition: color .15s, background .15s;
      }
      .pk-kit .bh-tab:hover { color: var(--text); }
      .pk-kit .bh-tab.on { background: var(--surface); color: var(--text); box-shadow: var(--shadow-sm); }

      .pk-kit .bh-zones {
        display: grid; grid-template-columns: 1.15fr 1fr; gap: 16px;
        align-items: start; margin-top: 18px;
      }
      .pk-kit .bh-panel {
        background: var(--surface); border: 1px solid var(--border);
        border-radius: var(--radius-lg); padding: 18px 18px 20px; box-shadow: var(--shadow-md);
      }
      .pk-kit .bh-phead { display: flex; align-items: center; gap: 10px; padding: 2px 4px 14px; }
      .pk-kit .bh-phico {
        width: 30px; height: 30px; border-radius: 10px; display: grid; place-items: center;
        color: #fff; flex-shrink: 0;
      }
      .pk-kit .bh-phico.money { background: linear-gradient(135deg, #10b981, #0ea5e9); }
      .pk-kit .bh-phico.clients { background: var(--grad-brand); }
      .pk-kit .bh-pht { font-family: var(--font-display); font-weight: 600; font-size: 16.5px; }
      .pk-kit .bh-phs { font-size: 12px; color: var(--text-faint); margin-top: 1px; }

      .pk-kit .bh-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
      .pk-kit .bh-span2 { grid-column: span 2; }

      /* Tinted stat tiles. --bh-t is the tile wash, --bh-a its icon accent. */
      .pk-kit .bh-stat {
        position: relative; display: flex; flex-direction: column;
        border-radius: 18px; padding: 15px 16px; background: var(--bh-t);
      }
      .pk-kit .bh-stat.indigo { --bh-t: #eef0ff; --bh-a: #6366f1; }
      .pk-kit .bh-stat.green  { --bh-t: #e7f7f0; --bh-a: #10b981; }
      .pk-kit .bh-stat.sky    { --bh-t: #e6f5fd; --bh-a: #0ea5e9; }
      .pk-kit .bh-stat.amber  { --bh-t: #fdf3e2; --bh-a: #f59e0b; }
      .pk-kit .bh-stat.rose   { --bh-t: #fdecec; --bh-a: #ef4444; }
      [data-theme="dark"] .pk-kit .bh-stat.indigo { --bh-t: rgba(99,102,241,0.15); }
      [data-theme="dark"] .pk-kit .bh-stat.green  { --bh-t: rgba(16,185,129,0.14); }
      [data-theme="dark"] .pk-kit .bh-stat.sky    { --bh-t: rgba(14,165,233,0.14); }
      [data-theme="dark"] .pk-kit .bh-stat.amber  { --bh-t: rgba(245,158,11,0.14); }
      [data-theme="dark"] .pk-kit .bh-stat.rose   { --bh-t: rgba(239,68,68,0.14); }

      .pk-kit .bh-ico {
        width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center;
        color: #fff; background: var(--bh-a); margin-bottom: 9px;
      }
      .pk-kit .bh-lbl { font-size: 12.5px; font-weight: 600; color: var(--text-muted); }
      .pk-kit .bh-sub { font-size: 11.5px; color: var(--text-faint); margin-top: 3px; }

      .pk-kit .bh-val { display: flex; align-items: baseline; gap: 1px; margin-top: 2px; }
      .pk-kit .bh-val, .pk-kit .bh-out, .pk-kit .bh-vin, .pk-kit .bh-fix {
        font-family: var(--font-display); font-weight: 700; font-size: 27px;
        letter-spacing: -.02em; font-variant-numeric: tabular-nums lining-nums;
      }
      .pk-kit .bh-out { color: var(--text); }
      .pk-kit .bh-fix { color: var(--text-muted); }
      .pk-kit .bh-unit { font-size: 16px; }
      .pk-kit .bh-vin {
        border: 0; background: transparent; color: var(--text);
        padding: 2px 3px; border-radius: 9px; min-width: 1ch;
        transition: background .12s, box-shadow .12s;
      }
      .pk-kit .bh-vin:hover { background: color-mix(in srgb, var(--surface) 60%, transparent); }
      .pk-kit .bh-vin:focus {
        outline: 0; background: var(--surface);
        box-shadow: 0 0 0 2px var(--brand); position: relative; z-index: 1;
      }

      .pk-kit .bh-chip {
        display: inline-flex; align-items: center; gap: 5px; width: fit-content;
        font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 999px; margin-top: 9px;
      }
      .pk-kit .bh-chip.ok    { background: rgba(16,185,129,.16); color: #0a7d58; }
      .pk-kit .bh-chip.watch { background: rgba(245,158,11,.18); color: #9a6206; }
      .pk-kit .bh-chip.bad   { background: rgba(239,68,68,.14); color: #c23434; }
      [data-theme="dark"] .pk-kit .bh-chip.ok    { color: #6ee7b7; }
      [data-theme="dark"] .pk-kit .bh-chip.watch { color: #fcd34d; }
      [data-theme="dark"] .pk-kit .bh-chip.bad   { color: #fca5a5; }

      .pk-kit .bh-auto {
        position: absolute; top: 13px; right: 13px;
        font-size: 9px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
        color: var(--text-faint); background: color-mix(in srgb, var(--surface) 65%, transparent);
        border: 1px solid var(--border); padding: 3px 6px; border-radius: 999px;
      }

      .pk-kit .bh-breakdown { display: flex; gap: 8px; margin-top: 11px; }
      .pk-kit .bh-bk {
        flex: 1; min-width: 0; border-radius: 11px; padding: 7px 9px;
        background: color-mix(in srgb, var(--surface) 55%, transparent);
      }
      .pk-kit .bh-bk-l {
        display: block; font-size: 10px; font-weight: 600; letter-spacing: .04em;
        text-transform: uppercase; color: var(--text-faint);
      }
      .pk-kit .bh-mini, .pk-kit .bh-bk-v {
        font-family: var(--font-display); font-weight: 700; font-size: 17px;
        font-variant-numeric: tabular-nums;
      }
      .pk-kit .bh-mini {
        border: 0; background: transparent; color: var(--text);
        width: 100%; padding: 2px; border-radius: 7px;
      }
      .pk-kit .bh-mini:hover { background: color-mix(in srgb, var(--surface) 70%, transparent); }
      .pk-kit .bh-mini:focus { outline: 0; background: var(--surface); box-shadow: 0 0 0 2px var(--brand); }
      .pk-kit .bh-bk.calc .bh-bk-v { color: var(--text-muted); }

      .pk-kit .bh-foot { font-size: 11px; color: var(--text-faint); padding: 14px 2px 0; }

      @media (max-width: 1080px) { .pk-kit .bh-zones { grid-template-columns: 1fr; } }
      @media (max-width: 720px) {
        .pk-kit .bh-grid { grid-template-columns: 1fr; }
        .pk-kit .bh-span2 { grid-column: span 1; }
        .pk-kit .bh-tabs { margin-left: 0; }
      }
    `}</style>
  );
}
