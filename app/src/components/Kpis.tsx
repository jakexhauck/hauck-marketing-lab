import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/tauri";
import type { KpiEntry } from "../lib/types";
import { KpiInput, type KpiField } from "./KpiInput";

type Props = {
  root: string;
  clientSlug: string;
};

type CardDef = {
  field: KpiField;
  label: (window: string) => string;
  meta: string;
  format: (v: number) => string;
  color: string;
  // delta tone for "up" direction relative to scoring; "up" means higher number
  // is undesirable (CPM/CPA), "down" means higher is desirable (CTR/CVR/ROAS).
  deltaInversion: "lower-is-better" | "higher-is-better" | "neutral";
};

const CARDS: CardDef[] = [
  {
    field: "spend",
    label: (w) => `SPEND · ${w}`,
    meta: "of $2,500 cap",
    format: (v) => `$${Math.round(v).toLocaleString()}`,
    color: "#ec9849",
    deltaInversion: "neutral",
  },
  {
    field: "cpm",
    label: () => "CPM",
    meta: "bench $24–30",
    format: (v) => `$${v.toFixed(2)}`,
    color: "#f87171",
    deltaInversion: "lower-is-better",
  },
  {
    field: "ctr",
    label: () => "CTR",
    meta: "bench 1.2–2.0",
    format: (v) => `${v.toFixed(1)}%`,
    color: "#5fe699",
    deltaInversion: "higher-is-better",
  },
  {
    field: "cvr",
    label: () => "CVR",
    meta: "bench 3–5%",
    format: (v) => `${v.toFixed(1)}%`,
    color: "#fbbf24",
    deltaInversion: "higher-is-better",
  },
  {
    field: "cpa",
    label: () => "CPA",
    meta: "target $35",
    format: (v) => `$${Math.round(v)}`,
    color: "#f87171",
    deltaInversion: "lower-is-better",
  },
  {
    field: "roas",
    label: () => "ROAS",
    meta: "scale floor 2.0×",
    format: (v) => `${v.toFixed(1)}×`,
    color: "#fbbf24",
    deltaInversion: "higher-is-better",
  },
];

function valueOf(entry: KpiEntry | null | undefined, field: KpiField): number | null {
  if (!entry) return null;
  const v = entry[field];
  return v === null || v === undefined ? null : v;
}

function buildPoints(series: number[]): string {
  if (series.length === 0) return "";
  if (series.length === 1) return `0,12 60,12`;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min || 1;
  const step = 60 / (series.length - 1);
  return series
    .map((v, i) => {
      const x = i * step;
      // invert y so higher values sit toward top of 24px viewBox
      const y = 22 - ((v - min) / range) * 20;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function deltaText(
  latest: number | null,
  prior: number | null,
  inversion: CardDef["deltaInversion"],
): { text: string; tone: "up" | "down" | "flat" } {
  if (latest === null || prior === null || prior === 0) {
    return { text: "—", tone: "flat" };
  }
  const pct = ((latest - prior) / Math.abs(prior)) * 100;
  if (Math.abs(pct) < 0.5) return { text: "▸ flat", tone: "flat" };
  const arrow = pct > 0 ? "▲" : "▼";
  const text = `${arrow} ${Math.abs(pct).toFixed(0)}%`;
  if (inversion === "neutral") return { text, tone: "flat" };
  const bad =
    (inversion === "lower-is-better" && pct > 0) ||
    (inversion === "higher-is-better" && pct < 0);
  return { text, tone: bad ? "up" : "down" };
}

export function Kpis({ root, clientSlug }: Props) {
  const [latest, setLatest] = useState<KpiEntry | null>(null);
  const [history, setHistory] = useState<KpiEntry[]>([]);
  const [editingField, setEditingField] = useState<KpiField | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [lat, hist] = await Promise.all([
        api.readLatestKpis(root, clientSlug),
        api.readKpiHistory(root, clientSlug, 12),
      ]);
      setLatest(lat);
      setHistory(hist);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, [root, clientSlug]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const prior = useMemo<KpiEntry | null>(() => {
    if (history.length < 2) return null;
    // history is newest-first; index 0 is latest, 1 is prior
    return history[1] ?? null;
  }, [history]);

  const seriesByField = useMemo(() => {
    const map: Record<KpiField, number[]> = {
      spend: [],
      cpm: [],
      ctr: [],
      cvr: [],
      cpa: [],
      roas: [],
    };
    // oldest-first for left-to-right sparkline
    const ordered = [...history].reverse();
    for (const entry of ordered) {
      for (const card of CARDS) {
        const v = valueOf(entry, card.field);
        if (v !== null) map[card.field].push(v);
      }
    }
    return map;
  }, [history]);

  const windowLabel = latest?.window ?? "7d";

  return (
    <>
      <section className="kpis reveal reveal-2">
        {CARDS.map((card) => {
          const v = valueOf(latest, card.field);
          const p = valueOf(prior, card.field);
          const delta = deltaText(v, p, card.deltaInversion);
          const points = buildPoints(seriesByField[card.field]);
          return (
            <button
              type="button"
              className="kpi"
              key={card.field}
              onClick={() => setEditingField(card.field)}
              aria-label={`Edit ${card.field.toUpperCase()}`}
            >
              <div className="kpi-label">{card.label(windowLabel)}</div>
              <div className="kpi-value">{v === null ? "—" : card.format(v)}</div>
              <div className="kpi-meta">
                <span>{card.meta}</span>
                <span className={`kpi-delta ${delta.tone}`}>{delta.text}</span>
              </div>
              <svg className="kpi-spark" viewBox="0 0 60 24">
                {points && (
                  <polyline
                    fill="none"
                    stroke={card.color}
                    strokeWidth="1.4"
                    points={points}
                  />
                )}
              </svg>
            </button>
          );
        })}
      </section>

      {error && (
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 11,
            color: "var(--signal-stop)",
            margin: "-24px 0 24px",
            letterSpacing: "0.04em",
          }}
        >
          {error}
        </div>
      )}

      {editingField && (
        <KpiInput
          root={root}
          clientSlug={clientSlug}
          latest={latest}
          focusField={editingField}
          onClose={() => setEditingField(null)}
          onSaved={refresh}
        />
      )}
    </>
  );
}
