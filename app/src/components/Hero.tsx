import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/tauri";
import type { DiagnosisFile, DiagnosisVerdict } from "../lib/types";

type Props = {
  clientName: string;
  root: string;
  clientSlug: string;
  onOpenDiagnosis?: () => void;
};

const VERDICT_PILL: Record<DiagnosisVerdict, { label: string; className: string }> = {
  kill: { label: "▸ KILL", className: "verdict verdict-kill" },
  hold: { label: "▸ HOLD", className: "verdict" },
  scale: { label: "▸ SCALE +20%", className: "verdict verdict-scale" },
};

export function Hero({ clientName, root, clientSlug, onOpenDiagnosis }: Props) {
  const [diagnosis, setDiagnosis] = useState<DiagnosisFile | null>(null);

  const load = useCallback(async () => {
    try {
      const latest = await api.readLatestDiagnosis(root, clientSlug);
      setDiagnosis(latest);
    } catch {
      setDiagnosis(null);
    }
  }, [root, clientSlug]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const latest = await api.readLatestDiagnosis(root, clientSlug);
        if (!cancelled) setDiagnosis(latest);
      } catch {
        if (!cancelled) setDiagnosis(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [root, clientSlug]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    (async () => {
      unlisten = await api.onDataChanged((evt) => {
        if (evt.kind !== "diagnosis") return;
        if (evt.client_slug !== null && evt.client_slug !== clientSlug) return;
        load();
      });
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, [clientSlug, load]);

  const pill = diagnosis
    ? VERDICT_PILL[diagnosis.verdict]
    : { label: "▸ NO DATA", className: "verdict" };
  const markerLeft = diagnosis
    ? `${Math.max(0, Math.min(100, diagnosis.scale_score))}%`
    : "0%";

  return (
    <section className="hero reveal reveal-1">
      <div className="hero-eyebrow">
        <span>OPERATIONAL STATUS</span>
        <span className={pill.className}>{pill.label}</span>
        {onOpenDiagnosis && (
          <button
            type="button"
            className="panel-edit"
            onClick={onOpenDiagnosis}
            title="Run a fresh Zenith diagnosis"
          >
            ▸ RUN DIAGNOSIS
          </button>
        )}
        <span style={{ marginLeft: "auto", color: "var(--text-faint)", fontWeight: 400 }}>
          EVAL WINDOW · 7d / 14d
        </span>
      </div>

      {diagnosis ? (
        <>
          <h1>{diagnosis.headline}</h1>
          <p className="hero-body">{diagnosis.body}</p>
        </>
      ) : (
        <>
          <h1>
            <span className="tag">No data</span>: no diagnosis on file for{" "}
            {clientName} yet.
          </h1>
          <p className="hero-body">
            Run a fresh Zenith diagnosis to populate this hero. Until then, the
            scale spectrum below is unset.
          </p>
        </>
      )}

      {diagnosis && (
        <div className="spectrum">
          <div className="spectrum-track">
            <div className="spectrum-marker" style={{ left: markerLeft }} />
          </div>
          <div className="spectrum-labels">
            <span>KILL</span>
            <span>HOLD</span>
            <span>SCALE +20%</span>
          </div>
        </div>
      )}
    </section>
  );
}
