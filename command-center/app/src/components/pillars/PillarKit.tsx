// Shared UI primitives for the pillar infrastructure. Every pillar surface (the
// pillar page, lane workspace, and Infrastructure map) reuses these so the
// system reads the same way everywhere. Pure presentation, driven by the config
// types from lib/pillars. Reads the shared admin theme tokens; green is a
// rationed accent, status colors are the only added literals.

import {
  Settings,
  Megaphone,
  Handshake,
  Rocket,
  Wrench,
  HeartHandshake,
  Boxes,
  type LucideIcon,
} from "lucide-react";
import type { PillarStatus, ScoreboardField } from "../../lib/pillars";

const ICONS: Record<string, LucideIcon> = {
  Settings,
  Megaphone,
  Handshake,
  Rocket,
  Wrench,
  HeartHandshake,
  Boxes,
};

// Map a config icon string to a lucide component, falling back to Boxes.
export function pillarIcon(name: string): LucideIcon {
  return ICONS[name] ?? Boxes;
}

const STATUS_LABEL: Record<PillarStatus, string> = {
  planned: "Planned",
  building: "Building",
  live: "Live",
};

export function StatusDot({ status, withLabel }: { status: PillarStatus; withLabel?: boolean }) {
  return (
    <span className="pk-dotwrap">
      <span className={`pk-dot pk-dot-${status}`} aria-hidden />
      {withLabel && <span className="pk-dotlabel">{STATUS_LABEL[status]}</span>}
    </span>
  );
}

// The future Hermes agent slot. Greyed and dashed until an agent is assigned.
export function HermesSlot({ compact }: { compact?: boolean }) {
  return (
    <span className={`pk-hermes${compact ? " pk-hermes-compact" : ""}`} title="A Hermes agent will run this later.">
      <span className="pk-hermes-dot" aria-hidden />
      Hermes
      <span className="pk-hermes-tag">future</span>
    </span>
  );
}

export function Scoreboard({ fields }: { fields: ScoreboardField[] }) {
  if (!fields.length) return null;
  return (
    <div className="pk-scoreboard">
      {fields.map((f, i) => (
        <div className="pk-score" key={i}>
          <div className="pk-score-val">{f.value ?? "—"}</div>
          <div className="pk-score-label">{f.label}</div>
        </div>
      ))}
    </div>
  );
}

// Scoped styles for the whole pillar kit. Mounted once per page (id-guarded by
// the browser deduping identical <style> is not automatic, so pages render this
// once near the root of their tree).
export function PillarStyle() {
  return (
    <style>{`
      .pk-root { color: var(--text); font-family: var(--font-body); padding: 28px 36px 60px; min-height: 100%; max-width: 1280px; margin: 0 auto; }
      .pk-root *, .pk-root *::before, .pk-root *::after { box-sizing: border-box; }

      .pk-back { display: inline-flex; align-items: center; gap: 7px; color: var(--text-muted); font-size: 13.5px; font-weight: 500; text-decoration: none; margin-bottom: 18px; }
      .pk-back:hover { color: var(--brand-text); }
      .pk-back svg { width: 15px; height: 15px; }

      .pk-kicker { color: var(--text-muted); font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
      .pk-num { color: var(--brand-text); }

      /* header card */
      .pk-head { display: flex; gap: 18px; align-items: flex-start; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); padding: 22px 24px; }
      .pk-head-ic { width: 52px; height: 52px; border-radius: 14px; flex-shrink: 0; display: grid; place-items: center; background: var(--brand-tint); color: var(--brand-text); }
      .pk-head-ic svg { width: 26px; height: 26px; }
      .pk-head-body { flex: 1; min-width: 0; }
      .pk-title { font-family: var(--font-display); font-size: 26px; font-weight: 600; letter-spacing: -0.03em; margin-top: 2px; }
      .pk-tagline { color: var(--text-muted); font-size: 14px; margin-top: 4px; }
      .pk-goal { color: var(--text); font-size: 14.5px; line-height: 1.6; margin-top: 12px; max-width: 720px; }
      .pk-head-side { display: flex; flex-direction: column; align-items: flex-end; gap: 12px; }

      /* status dots */
      .pk-dotwrap { display: inline-flex; align-items: center; gap: 6px; }
      .pk-dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
      .pk-dot-planned { background: var(--text-faint); }
      .pk-dot-building { background: var(--brand); box-shadow: 0 0 0 3px var(--brand-tint); }
      .pk-dot-live { background: #22c55e; box-shadow: 0 0 0 3px rgba(34,197,94,0.18); }
      .pk-dotlabel { font-size: 12px; font-weight: 600; color: var(--text-muted); }

      /* hermes slot */
      .pk-hermes { display: inline-flex; align-items: center; gap: 7px; padding: 5px 11px; border: 1px dashed var(--border); border-radius: 999px; color: var(--text-faint); font-size: 12px; font-weight: 600; background: var(--surface-2); }
      .pk-hermes-compact { padding: 3px 9px; font-size: 11px; }
      .pk-hermes-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--text-faint); opacity: 0.7; }
      .pk-hermes-tag { font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; opacity: 0.8; }

      /* scoreboard */
      .pk-scoreboard { display: flex; gap: 10px; }
      .pk-score { background: var(--surface-2); border: 1px solid var(--border); border-radius: 12px; padding: 10px 14px; min-width: 92px; }
      .pk-score-val { font-family: var(--font-display); font-size: 20px; font-weight: 600; letter-spacing: -0.02em; }
      .pk-score-label { color: var(--text-muted); font-size: 11.5px; font-weight: 500; margin-top: 2px; }

      /* section heads */
      .pk-section { margin-top: 28px; }
      .pk-section-h { font-family: var(--font-display); font-size: 13px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 12px; }

      /* lane cards grid */
      .pk-lanes { display: grid; grid-template-columns: repeat(auto-fill, minmax(248px, 1fr)); gap: 12px; }
      .pk-lane { display: block; text-decoration: none; color: inherit; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); padding: 15px 16px; transition: transform .14s, border-color .14s, box-shadow .14s; }
      .pk-lane:hover { transform: translateY(-2px); border-color: var(--brand); box-shadow: 0 10px 30px rgba(0,0,0,0.08); }
      .pk-lane-future { opacity: 0.62; }
      .pk-lane-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .pk-lane-label { font-family: var(--font-display); font-size: 15px; font-weight: 600; letter-spacing: -0.01em; }
      .pk-lane-what { color: var(--text-muted); font-size: 13px; line-height: 1.5; margin-top: 6px; }
      .pk-lane-foot { display: flex; align-items: center; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
      .pk-motion { font-size: 10.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; padding: 2px 8px; border-radius: 999px; }
      .pk-motion-deploy { color: #2563eb; background: rgba(37,99,235,0.1); }
      .pk-motion-manage { color: #b45309; background: rgba(245,158,11,0.12); }

      /* pipeline flow */
      .pk-flow { display: flex; align-items: stretch; gap: 0; flex-wrap: wrap; }
      .pk-flow .pk-lane { flex: 1; min-width: 190px; }
      .pk-flow-arrow { display: grid; place-items: center; color: var(--text-faint); padding: 0 6px; }
      .pk-flow-arrow svg { width: 18px; height: 18px; }

      /* build space */
      .pk-build { margin-top: 28px; border: 1px dashed var(--border); border-radius: var(--radius-lg); padding: 22px; text-align: center; color: var(--text-muted); font-size: 14px; background: var(--surface-2); }
      .pk-build b { color: var(--text); font-family: var(--font-display); font-weight: 600; }

      /* generic prose + lists used by the lane workspace */
      .pk-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); padding: 20px 22px; }
      .pk-steps { counter-reset: step; list-style: none; padding: 0; margin: 0; }
      .pk-steps li { position: relative; padding: 8px 0 8px 38px; color: var(--text); font-size: 14.5px; line-height: 1.55; border-bottom: 1px solid var(--divider); }
      .pk-steps li:last-child { border-bottom: none; }
      .pk-steps li::before { counter-increment: step; content: counter(step); position: absolute; left: 0; top: 7px; width: 24px; height: 24px; border-radius: 50%; background: var(--brand-tint); color: var(--brand-text); font-family: var(--font-display); font-size: 12px; font-weight: 700; display: grid; place-items: center; }
      .pk-bullets { margin: 0; padding-left: 20px; }
      .pk-bullets li { color: var(--text-muted); font-size: 14px; margin: 6px 0; }
      .pk-bullets li::marker { color: var(--brand-text); }
      .pk-links { display: flex; flex-wrap: wrap; gap: 10px; }
      .pk-link { display: inline-flex; align-items: center; gap: 7px; padding: 9px 14px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface); color: var(--text); font-size: 13px; font-weight: 600; text-decoration: none; transition: border-color .14s, color .14s; }
      .pk-link:hover { border-color: var(--brand); color: var(--brand-text); }
      .pk-link svg { width: 14px; height: 14px; }
      .pk-empty { text-align: center; color: var(--text-muted); padding: 40px 0; font-size: 14px; }
    `}</style>
  );
}
