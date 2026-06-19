import { cn } from "../../lib/cn";
import { formatCompact, formatNumber, formatPercent } from "../../lib/format";
import { ctr, type AdMetrics } from "../../lib/adsData";

// The acquisition funnel: how delivery narrows from impressions down to closed
// customers. A sibling of the pipeline ribbon on Overview: same brand-tint
// palette (lighter at the wide top, full brand at the bottom), shaped as a
// centered taper. Bar widths use a sqrt scale with a floor so the small bottom
// stages stay legible; the printed counts and step rates are exact.

interface Stage {
  key: string;
  label: string;
  count: number;
  // Conversion from the previous stage, shown on the connector. Null for the top.
  step: number | null;
  stepLabel: string;
  tone: string;
}

const TONES = [
  "bg-[color-mix(in_srgb,var(--brand)_30%,transparent)]",
  "bg-[color-mix(in_srgb,var(--brand)_50%,transparent)]",
  "bg-[color-mix(in_srgb,var(--brand)_72%,transparent)]",
  "bg-brand",
];

export function AdFunnel({ m }: { m: AdMetrics }) {
  const stages: Stage[] = [
    { key: "impr", label: "Impressions", count: m.impressions, step: null, stepLabel: "", tone: TONES[0] },
    {
      key: "clicks",
      label: "Clicks",
      count: m.clicks,
      step: ctr(m),
      stepLabel: "CTR",
      tone: TONES[1],
    },
    {
      key: "leads",
      label: "Leads",
      count: m.leads,
      step: m.clicks > 0 ? m.leads / m.clicks : null,
      stepLabel: "click → lead",
      tone: TONES[2],
    },
    {
      key: "customers",
      label: "Customers",
      count: m.customers,
      step: m.leads > 0 ? m.customers / m.leads : null,
      stepLabel: "lead → close",
      tone: TONES[3],
    },
  ];

  const max = Math.max(...stages.map((s) => s.count), 1);
  const widthFor = (count: number) => {
    const w = Math.sqrt(count / max) * 100;
    return `${Math.max(7, Math.round(w))}%`;
  };

  return (
    <div className="flex flex-col">
      {stages.map((s, i) => (
        <div key={s.key}>
          <div className="flex items-center gap-4 py-1.5">
            <div className="w-28 shrink-0 text-right sm:w-32">
              <div className="text-[12.5px] text-muted">{s.label}</div>
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div
                className={cn(
                  "flex h-9 items-center justify-end rounded-[var(--radius-sm)] px-2.5 transition-[width]",
                  s.tone,
                )}
                style={{ width: widthFor(s.count) }}
                title={`${s.label}: ${formatNumber(s.count)}`}
              >
                <span className="font-data text-[12.5px] text-brand-fg tnum">
                  {formatCompact(s.count)}
                </span>
              </div>
              <span className="font-data text-[12px] text-faint tnum">{formatNumber(s.count)}</span>
            </div>
          </div>
          {i < stages.length - 1 && stages[i + 1].step != null && (
            <div className="ml-[7.5rem] flex items-center gap-1.5 py-0.5 pl-4 sm:ml-[8.5rem]">
              <span className="h-3 w-px bg-border-strong" aria-hidden />
              <span className="font-data text-[11px] text-muted tnum">
                {formatPercent(stages[i + 1].step, 1)}
              </span>
              <span className="label-cap">{stages[i + 1].stepLabel}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
