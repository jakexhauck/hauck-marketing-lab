import { useId, useMemo } from "react";
import { formatMoney, formatNumber } from "../../lib/format";
import type { DailyPoint } from "../../lib/adsData";

// The signature of the Paid Ads surface: a daily delivery tape. Spend reads as a
// gold area (money), leads as a brand line over it: two independently-scaled
// series so the shape of delivery and the shape of results can be compared at a
// glance. Hand-drawn SVG (no chart dependency); the viewBox scales to width.

const W = 720;
const H = 200;
const PAD = { top: 16, right: 12, bottom: 22, left: 12 };

function buildPath(values: number[], plotW: number, plotH: number): { line: string; area: string } {
  const max = Math.max(...values, 1);
  const n = values.length;
  const x = (i: number) => PAD.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  let line = "";
  values.forEach((v, i) => {
    line += `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
  });
  const baseY = (PAD.top + plotH).toFixed(1);
  const area = `${line}L${x(n - 1).toFixed(1)},${baseY} L${x(0).toFixed(1)},${baseY} Z`;
  return { line: line.trim(), area };
}

export function DeliveryTrend({ daily }: { daily: DailyPoint[] }) {
  // useId() includes colons, which break url(#id) references in SVG; strip them.
  const gradId = `spend-grad-${useId().replace(/:/g, "")}`;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const { spendPath, leadsLine, gridY } = useMemo(() => {
    const spend = daily.map((d) => d.spend);
    const leads = daily.map((d) => d.leads);
    return {
      spendPath: buildPath(spend, plotW, plotH),
      leadsLine: buildPath(leads, plotW, plotH).line,
      gridY: [0.25, 0.5, 0.75].map((f) => PAD.top + plotH * f),
    };
  }, [daily, plotW, plotH]);

  const firstDate = daily[0]?.date;
  const lastDate = daily[daily.length - 1]?.date;
  const fmtAxis = (iso?: string) =>
    iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Daily spend and leads">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--ledger)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--ledger)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Hairline grid, the cockpit baseline. */}
        {gridY.map((gy, i) => (
          <line
            key={i}
            x1={PAD.left}
            x2={W - PAD.right}
            y1={gy}
            y2={gy}
            stroke="var(--divider)"
            strokeWidth={1}
          />
        ))}

        {/* Spend: gold area + line (money). */}
        <path d={spendPath.area} fill={`url(#${gradId})`} />
        <path
          d={spendPath.line}
          fill="none"
          stroke="var(--ledger)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Leads: brand line (results). */}
        <path
          d={leadsLine}
          fill="none"
          stroke="var(--brand)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Per-day hover targets with a native tooltip. */}
        {daily.map((d, i) => {
          const n = daily.length;
          const cx = PAD.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
          return (
            <rect
              key={d.date}
              x={cx - plotW / (2 * Math.max(1, n))}
              y={PAD.top}
              width={plotW / Math.max(1, n)}
              height={plotH}
              fill="transparent"
            >
              <title>{`${fmtAxis(d.date)} · ${formatMoney(d.spend)} · ${formatNumber(d.leads)} leads`}</title>
            </rect>
          );
        })}

        <text x={PAD.left} y={H - 6} className="font-data" fontSize={11} fill="var(--text-faint)">
          {fmtAxis(firstDate)}
        </text>
        <text
          x={W - PAD.right}
          y={H - 6}
          textAnchor="end"
          className="font-data"
          fontSize={11}
          fill="var(--text-faint)"
        >
          {fmtAxis(lastDate)}
        </text>
      </svg>

      <div className="mt-2 flex items-center gap-5 px-1">
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-[2px] bg-ledger" aria-hidden />
          <span className="text-[12px] text-muted">Spend</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-[2px] bg-brand" aria-hidden />
          <span className="text-[12px] text-muted">Leads</span>
        </span>
      </div>
    </div>
  );
}
