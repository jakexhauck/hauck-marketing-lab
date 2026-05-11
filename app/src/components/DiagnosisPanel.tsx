import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/tauri";
import type { DiagnosisFile } from "../lib/types";

type Props = {
  root: string;
  clientSlug: string;
};

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "just now";
  const diffMs = Date.now() - then;
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "yesterday";
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yr = Math.floor(day / 365);
  return `${yr}y ago`;
}

export function DiagnosisPanel({ root, clientSlug }: Props) {
  const [diagnosis, setDiagnosis] = useState<DiagnosisFile | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.readLatestDiagnosis(root, clientSlug);
      setDiagnosis(result);
    } catch {
      setDiagnosis(null);
    }
  }, [root, clientSlug]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await api.readLatestDiagnosis(root, clientSlug);
        if (!cancelled) setDiagnosis(result);
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

  if (!diagnosis) {
    return (
      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">▸ DIAGNOSIS</span>
          <span className="panel-meta">ZENITH · no diagnosis yet</span>
        </div>

        <div className="diag-headline">
          <strong>No data</strong> — run a Zenith diagnosis to populate
          findings.
        </div>

        <p
          style={{
            color: "var(--text-muted)",
            fontSize: 13,
            lineHeight: 1.55,
            margin: "12px 0 0",
          }}
        >
          Findings, severity, and recommended next actions will appear here once
          a diagnosis has been written to{" "}
          <code>data/&lt;client&gt;/diagnoses/</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">▸ DIAGNOSIS</span>
        <span className="panel-meta">
          ZENITH · updated {formatRelativeTime(diagnosis.created_at)}
        </span>
      </div>

      <div className="diag-headline">{diagnosis.headline}</div>

      <ul className="diag-list">
        {diagnosis.findings.map((f, idx) => (
          <li key={`${f.attribution}-${idx}`} className="diag-item">
            <span className={`diag-dot ${f.severity}`} />
            <span className="diag-attr">
              {f.attribution} · {f.severity.toUpperCase()}
            </span>
            <span className="diag-text">{f.body}</span>
          </li>
        ))}
      </ul>

      <div className="actions-row">
        <button className="action primary">Dispatch Vortex · 12 hooks</button>
        <button className="action">Open landing audit</button>
        <button className="action">Generate brief</button>
        <button className="action">Export report</button>
      </div>
    </div>
  );
}
