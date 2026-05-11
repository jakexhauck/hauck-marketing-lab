import { useEffect, useState } from "react";
import { cn } from "../lib/cn";
import { api } from "../lib/tauri";
import type { ChecklistItem, ChecklistStatus, LaunchChecklist as LaunchChecklistType } from "../lib/types";
import { LaunchChecklist } from "./LaunchChecklist";

type Props = {
  root: string;
  clientName: string;
  clientSlug: string;
  drawerOpen: boolean;
  onAskAurelius: (bundledPrompt: string) => void;
};

const STATUS_GLYPH: Record<ChecklistStatus, string> = {
  go: "✓",
  hold: "–",
  stop: "✗",
};

function buildAureliusPrompt(clientName: string, items: ChecklistItem[]): string {
  const goCount = items.filter((i) => i.status === "go").length;
  const total = items.length;
  const lines = items
    .map((i) => {
      const base = `- [${STATUS_GLYPH[i.status]}] ${i.label}`;
      const note = i.note && i.note.trim().length > 0 ? `\n  *${i.note.trim()}*` : "";
      return base + note;
    })
    .join("\n");

  return [
    `Sir, I'd like a readiness check on ${clientName} before we launch.`,
    ``,
    `Current pre-launch checklist:`,
    ``,
    lines,
    ``,
    `Cleared: ${goCount} of ${total}.`,
    ``,
    `Please:`,
    `1. Identify which checks need the most attention before launch.`,
    `2. Push back on any "GO" status that looks premature.`,
    `3. Recommend specific actions for each "STOP" or "HOLD" item.`,
    `4. Give a final verdict: READY / NOT READY / READY WITH CAVEATS.`,
    `5. Save your verdict to outputs/launch-readiness/ when complete.`,
  ].join("\n");
}

export function PreLaunchDashboard({ root, clientName, clientSlug, drawerOpen, onAskAurelius }: Props) {
  const [checklist, setChecklist] = useState<LaunchChecklistType | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setChecklist(null);
    setError(null);
    api
      .readLaunchChecklist(root, clientSlug)
      .then((data) => {
        if (!cancelled) setChecklist(data);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [root, clientSlug]);

  const handleItemStatusChange = async (id: string, next: ChecklistStatus) => {
    if (!checklist) return;
    const updated: LaunchChecklistType = {
      ...checklist,
      items: checklist.items.map((it) => (it.id === id ? { ...it, status: next } : it)),
    };
    setChecklist(updated);
    setSaving(true);
    setError(null);
    try {
      await api.writeLaunchChecklist(root, clientSlug, updated);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleAsk = () => {
    if (!checklist) return;
    onAskAurelius(buildAureliusPrompt(clientName, checklist.items));
  };

  if (!checklist) {
    return (
      <main className={cn("main", drawerOpen && "backdrop-dim")} style={{ position: "relative" }}>
        <div className="prelaunch-loader">
          {error ? `ERROR · ${error}` : "READING CHECKLIST…"}
        </div>
      </main>
    );
  }

  const items = checklist.items;
  const total = items.length;
  const goCount = items.filter((i) => i.status === "go").length;
  const pct = total === 0 ? 0 : Math.round((goCount / total) * 100);
  const firstBlocker = items.find((i) => i.status !== "go");
  const allClear = !firstBlocker;

  return (
    <main className={cn("main", drawerOpen && "backdrop-dim")} style={{ position: "relative" }}>
      <section className="hero reveal reveal-1">
        <div className="hero-eyebrow">
          <span>LAUNCH READINESS · {goCount} / {total} CLEARED</span>
          <span
            className="verdict"
            style={
              allClear
                ? {
                    background: "rgba(95, 230, 153, 0.13)",
                    borderColor: "rgba(95, 230, 153, 0.36)",
                    color: "var(--signal-go)",
                  }
                : undefined
            }
          >
            ▸ {allClear ? "READY" : "BLOCKED"}
          </span>
          <span style={{ marginLeft: "auto", color: "var(--text-faint)", fontWeight: 400 }}>
            CLIENT · {clientName.toUpperCase()}
          </span>
        </div>
        <h1>
          {allClear ? (
            <>
              <strong>READY TO LAUNCH</strong>
            </>
          ) : (
            <>
              BLOCKED ON <strong>{firstBlocker!.label}</strong>
            </>
          )}
        </h1>

        <div className="spectrum">
          <div className="prelaunch-progress">
            <div
              className="prelaunch-progress-fill"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="spectrum-labels" style={{ marginTop: 14 }}>
            <span>BLOCKED</span>
            <span>WORKING</span>
            <span>READY · {pct}%</span>
          </div>
        </div>
      </section>

      <section className="panel reveal reveal-2" style={{ marginBottom: 24 }}>
        <div className="panel-head">
          <span className="panel-title">PRE-LAUNCH CHECKLIST</span>
          <span className="panel-meta">{saving ? "SAVING…" : "AUTOSAVE"}</span>
        </div>
        <LaunchChecklist
          items={checklist.items}
          onItemStatusChange={handleItemStatusChange}
          busy={saving}
        />
        {error ? <div className="prelaunch-err">ERROR · {error}</div> : null}
      </section>

      <button
        type="button"
        className="ask-aurelius-btn reveal reveal-3"
        onClick={handleAsk}
        disabled={saving}
      >
        <span className="ask-aurelius-glyph">◯</span>
        <span className="ask-aurelius-label">ASK AURELIUS IF WE'RE READY</span>
      </button>
    </main>
  );
}
