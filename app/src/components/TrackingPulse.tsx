import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/tauri";
import type { TrackingAudit as TrackingAuditModel, TrackingStatus } from "../lib/types";
import { TrackingAudit } from "./TrackingAudit";

type Props = {
  root: string;
  clientSlug: string;
};

type DialView = {
  ringClass: string;
  valClass: string;
  pct: number;
  display: string;
};

function statusDial(status: TrackingStatus): DialView {
  switch (status) {
    case "ok":
      return { ringClass: "", valClass: "", pct: 100, display: "✓" };
    case "warning":
      return { ringClass: "amber", valClass: "warn", pct: 60, display: "!" };
    case "missing":
      return { ringClass: "red", valClass: "stop", pct: 15, display: "✕" };
  }
}

function emqDial(score: number | null): DialView {
  if (score === null) {
    return { ringClass: "", valClass: "", pct: 0, display: "—" };
  }
  const pct = Math.max(0, Math.min(100, (score / 10) * 100));
  let ringClass = "red";
  let valClass = "stop";
  if (score >= 9) {
    ringClass = "";
    valClass = "";
  } else if (score >= 7) {
    ringClass = "amber";
    valClass = "warn";
  }
  return { ringClass, valClass, pct, display: score.toFixed(1) };
}

export function TrackingPulse({ root, clientSlug }: Props) {
  const [audit, setAudit] = useState<TrackingAuditModel | null>(null);
  const [editing, setEditing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await api.readTrackingAudit(root, clientSlug);
      setAudit(data);
    } catch {
      setAudit(null);
    }
  }, [root, clientSlug]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    (async () => {
      unlisten = await api.onDataChanged((evt) => {
        if (evt.kind !== "tracking") return;
        if (evt.client_slug !== null && evt.client_slug !== clientSlug) return;
        refresh();
      });
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, [clientSlug, refresh]);

  const hasAudit = audit !== null;

  const pixel: DialView = hasAudit
    ? statusDial(audit!.pixel_status)
    : { ringClass: "", valClass: "", pct: 100, display: "✓" };
  const capi: DialView = hasAudit
    ? statusDial(audit!.capi_status)
    : { ringClass: "", valClass: "", pct: 100, display: "✓" };
  const emq: DialView = hasAudit
    ? emqDial(audit!.emq_score ?? null)
    : { ringClass: "amber", valClass: "warn", pct: 72, display: "7.2" };

  const note = hasAudit
    ? audit!.pulse_note
    : "Server-side events flowing. EMQ could climb to 8.5+ by adding hashed phone + zip on the lead form. Optional but recommended before scale.";

  return (
    <>
      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">▸ TRACKING PULSE</span>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              type="button"
              className="panel-edit"
              onClick={() => setEditing(true)}
              aria-label="Edit tracking audit"
            >
              Audit
            </button>
            <span className="panel-meta">NEXUS</span>
          </div>
        </div>

        <div className="dials">
          <div className="dial">
            <div
              className={`dial-ring ${pixel.ringClass}`.trim()}
              style={{ "--pct": `${pixel.pct}%` } as React.CSSProperties}
            >
              <div className={`dial-val ${pixel.valClass}`.trim()}>{pixel.display}</div>
            </div>
            <div className="dial-name">PIXEL</div>
          </div>
          <div className="dial">
            <div
              className={`dial-ring ${capi.ringClass}`.trim()}
              style={{ "--pct": `${capi.pct}%` } as React.CSSProperties}
            >
              <div className={`dial-val ${capi.valClass}`.trim()}>{capi.display}</div>
            </div>
            <div className="dial-name">CAPI</div>
          </div>
          <div className="dial">
            <div
              className={`dial-ring ${emq.ringClass}`.trim()}
              style={{ "--pct": `${emq.pct}%` } as React.CSSProperties}
            >
              <div className={`dial-val ${emq.valClass}`.trim()}>{emq.display}</div>
            </div>
            <div className="dial-name">EMQ</div>
          </div>
        </div>

        {note && <div className="pulse-line">{note}</div>}
        {!hasAudit && (
          <div className="pulse-line dim" style={{ marginTop: 12, paddingTop: 12 }}>
            Audit pending — values shown are placeholders.
          </div>
        )}
      </div>

      {editing && (
        <TrackingAudit
          root={root}
          clientSlug={clientSlug}
          current={audit}
          onClose={() => setEditing(false)}
          onSaved={refresh}
        />
      )}
    </>
  );
}
