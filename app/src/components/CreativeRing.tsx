import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/tauri";
import type { CreativesManifest } from "../lib/types";
import { CreativesEditor } from "./CreativesEditor";

type Props = {
  root: string;
  clientSlug: string;
};

const dotColor: Record<string, string> = {
  go: "var(--signal-go)",
  hold: "var(--signal-hold)",
  stop: "var(--signal-stop)",
};

const VISIBLE_LIMIT = 7;

export function CreativeRing({ root, clientSlug }: Props) {
  const [manifest, setManifest] = useState<CreativesManifest | null>(null);
  const [editing, setEditing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await api.readCreativesManifest(root, clientSlug);
      setManifest(data);
    } catch {
      setManifest(null);
    }
  }, [root, clientSlug]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    (async () => {
      unlisten = await api.onDataChanged((evt) => {
        if (evt.kind !== "creatives") return;
        if (evt.client_slug !== null && evt.client_slug !== clientSlug) return;
        refresh();
      });
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, [clientSlug, refresh]);

  if (!manifest) {
    return (
      <>
        <div className="panel creative-ring-wrap">
          <div className="panel-head" style={{ justifyContent: "center", gap: 12 }}>
            <span className="panel-title">▸ CREATIVE DIVERSITY</span>
            <button
              type="button"
              className="panel-edit"
              onClick={() => setEditing(true)}
              aria-label="Edit creatives"
            >
              Edit
            </button>
          </div>
          <div className="creative-ring" style={{ "--pct": "0%" } as React.CSSProperties}>
            <div className="creative-ring-inner">
              <div className="num">
                <em>—</em>
              </div>
              <div className="denom">NO DATA</div>
            </div>
          </div>
          <div className="pulse-line dim" style={{ marginTop: 12, paddingTop: 12 }}>
            <strong>No data</strong> — add creatives via Edit to populate this
            panel.
          </div>
        </div>

        {editing && (
          <CreativesEditor
            root={root}
            clientSlug={clientSlug}
            current={null}
            onClose={() => setEditing(false)}
            onSaved={refresh}
          />
        )}
      </>
    );
  }

  const active = manifest.creatives.length;
  const min = manifest.min_active;
  const pct = min > 0 ? (Math.min(active, min) / min) * 100 : 0;
  const visible = manifest.creatives.slice(0, VISIBLE_LIMIT);
  const overflow = active - visible.length;
  const needed = Math.max(0, min - active);

  const footerParts: string[] = [];
  if (overflow > 0) footerParts.push(`+ ${overflow} more`);
  if (needed > 0) footerParts.push(`${needed} needed`);
  const footerText = footerParts.join(" · ");

  return (
    <>
      <div className="panel creative-ring-wrap">
        <div className="panel-head" style={{ justifyContent: "center", gap: 12 }}>
          <span className="panel-title">▸ CREATIVE DIVERSITY</span>
          <button
            type="button"
            className="panel-edit"
            onClick={() => setEditing(true)}
            aria-label="Edit creatives"
          >
            Edit
          </button>
        </div>
        <div className="creative-ring" style={{ "--pct": `${pct}%` } as React.CSSProperties}>
          <div className="creative-ring-inner">
            <div className="num">
              <em>{active}</em>/{min}
            </div>
            <div className="denom">ACTIVE / MIN</div>
          </div>
        </div>
        <ul className="creative-list">
          {visible.map((c) => (
            <li key={c.id}>
              <span>
                <span className="id">{c.id}</span>
                {c.name}
              </span>
              <span style={{ color: dotColor[c.signal] }}>●</span>
            </li>
          ))}
          {footerText && (
            <li style={{ color: "var(--text-faint)" }}>{footerText}</li>
          )}
        </ul>
      </div>

      {editing && (
        <CreativesEditor
          root={root}
          clientSlug={clientSlug}
          current={manifest}
          onClose={() => setEditing(false)}
          onSaved={refresh}
        />
      )}
    </>
  );
}
