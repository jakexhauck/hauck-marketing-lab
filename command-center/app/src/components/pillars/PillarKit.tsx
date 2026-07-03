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
import type { ReactNode } from "react";
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

// A small "not set up yet" note shown inside an un-gated lane or tab.
export function NeedsSetup({ children }: { children: ReactNode }) {
  return (
    <div className="pk-needs">
      <span className="pk-needs-dot" aria-hidden />
      {children}
    </div>
  );
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

export function Scoreboard({ fields }: { fields: ScoreboardField[] }) {
  if (!fields.length) return null;
  return (
    <div className="pk-scoreboard">
      {fields.map((f, i) => (
        <div className="pk-score" key={i}>
          <div className="pk-score-val">{f.value ?? "·"}</div>
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
      /* ===== Modern Motion design kit, scoped to the admin via .pk-kit =====
         Indigo/violet brand, glass surfaces, soft glows, JetBrains Mono data,
         gradient page titles, and a gentle load reveal. Overriding the brand
         tokens here recolors the whole admin (Tailwind reads the same vars)
         without touching the client app. */
      .pk-kit {
        --brand: #4f46e5; --brand-strong: #4338ca; --brand-2: #7c73f0;
        --brand-tint: #eceaff; --brand-tint-strong: #ddd9fb;
        --brand-text: #4f46e5; --brand-fg: #ffffff;
        --grad-brand: linear-gradient(135deg, #4f46e5 0%, #7c73f0 100%);
        --shadow-brand: 0 8px 22px rgba(79,70,229,0.28);
        --positive: #16a34a; --warning: #d97706; --danger: #dc2626;
        --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace;
        background-image:
          radial-gradient(60rem 40rem at 10% -8%, rgba(124,115,240,0.14), transparent 60%),
          radial-gradient(52rem 38rem at 100% 0%, rgba(79,70,229,0.10), transparent 55%),
          radial-gradient(46rem 36rem at 50% 120%, rgba(99,102,241,0.07), transparent 60%);
        background-attachment: fixed;
      }
      [data-theme="dark"] .pk-kit {
        --brand: #7c73f0; --brand-strong: #6d63e8; --brand-2: #a5b4fc;
        --brand-tint: rgba(124,115,240,0.18); --brand-tint-strong: rgba(124,115,240,0.30);
        --brand-text: #bcb6ff; --brand-fg: #0b0f17;
        --grad-brand: linear-gradient(135deg, #7c73f0 0%, #a5b4fc 100%);
        --shadow-brand: 0 8px 24px rgba(124,115,240,0.34);
        background-image:
          radial-gradient(60rem 40rem at 10% -8%, rgba(124,115,240,0.16), transparent 60%),
          radial-gradient(52rem 38rem at 100% 0%, rgba(79,70,229,0.13), transparent 55%);
      }

      /* Glass surfaces: the header card and section cards float on the glow. */
      .pk-kit .pk-head, .pk-kit .pk-card {
        background: rgba(255,255,255,0.72); backdrop-filter: blur(14px) saturate(1.1);
        -webkit-backdrop-filter: blur(14px) saturate(1.1);
        border-color: rgba(120,115,160,0.16); box-shadow: var(--shadow-md);
      }
      [data-theme="dark"] .pk-kit .pk-head, [data-theme="dark"] .pk-kit .pk-card {
        background: rgba(22,26,36,0.62); border-color: rgba(255,255,255,0.08);
      }

      /* Gradient page titles (the signature). Large, bold, clears 3:1. */
      .pk-kit .pk-title {
        background: linear-gradient(120deg, var(--text) 0%, #4f46e5 62%, #7c73f0 100%);
        -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
      }
      [data-theme="dark"] .pk-kit .pk-title {
        background: linear-gradient(120deg, #ffffff 0%, #a5b4fc 70%, #c4b5fd 100%);
        -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
      }

      /* Structural labels in mono; data/figures in mono tabular. */
      .pk-kit .pk-kicker, .pk-kit .pk-section-h, .pk-kit .pk-list-sec-h { font-family: var(--font-mono); }
      .pk-kit .pk-score-val, .pk-kit .pk-report-val, .pk-kit .pk-li-val, .pk-kit .pk-tabcount {
        font-family: var(--font-mono); font-variant-numeric: tabular-nums; letter-spacing: -0.01em;
      }

      /* Pills and active tab pick up indigo; soft brand glow on the active tab. */
      .pk-kit .pk-tab.on { text-shadow: 0 0 0 transparent; }

      /* Gentle load reveal on the top-level blocks of a workspace. This also
         re-fires on every tab switch (the tab body remounts), so it is tuned
         snappy on purpose: this is a daily console, and a slow reveal on each
         click gets old fast. Short travel, ~340ms, tight stagger. */
      @media (prefers-reduced-motion: no-preference) {
        .pk-kit .pk-root > * { animation: pkReveal 0.34s cubic-bezier(0.23,1,0.32,1) backwards; }
        .pk-kit .pk-root > *:nth-child(2) { animation-delay: 0.04s; }
        .pk-kit .pk-root > *:nth-child(3) { animation-delay: 0.08s; }
        .pk-kit .pk-root > *:nth-child(n+4) { animation-delay: 0.12s; }
      }
      @keyframes pkReveal { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

      /* Tactile hover on the collection cards (pointer devices only). Subtle
         lift so the surfaces feel alive; task rows are excluded so the lift
         never implies the whole row is a click target. */
      @media (hover: hover) and (pointer: fine) {
        .pk-kit .pk-person, .pk-kit .pk-report-tile {
          transition: transform .14s var(--ease-out), border-color .14s var(--ease-out), box-shadow .14s var(--ease-out);
        }
        .pk-kit .pk-person:hover, .pk-kit .pk-report-tile:hover {
          transform: translateY(-2px);
          border-color: color-mix(in srgb, var(--brand) 55%, var(--border));
          box-shadow: 0 10px 30px rgba(0,0,0,0.08);
        }
      }

      /* ===== Full shell (inherited from the design kit): glass rail + topbar ===== */
      .pk-kit .adm-rail { background: rgba(255,255,255,0.60); backdrop-filter: blur(18px) saturate(1.4); -webkit-backdrop-filter: blur(18px) saturate(1.4); border-right: 1px solid rgba(120,115,160,0.16); }
      [data-theme="dark"] .pk-kit .adm-rail { background: rgba(18,22,31,0.55); border-right-color: rgba(255,255,255,0.07); }
      .pk-kit .adm-nav-item { display: flex; align-items: center; gap: 11px; padding: 10px 12px; border-radius: 10px; font-size: 14px; font-weight: 500; color: var(--text-muted); position: relative; text-decoration: none; transition: color .2s, background .2s, transform .15s; }
      .pk-kit .adm-nav-item svg { flex: none; opacity: .85; }
      .pk-kit .adm-nav-item:hover { background: color-mix(in srgb, var(--surface) 72%, transparent); color: var(--text); transform: translateX(2px); }
      .pk-kit .adm-nav-item.on { color: #fff; background: var(--grad-brand); box-shadow: var(--shadow-brand); }
      .pk-kit .adm-nav-item.on svg { opacity: 1; }
      .pk-kit .adm-topbar { height: 56px; display: flex; align-items: center; gap: 16px; padding: 0 22px; background: rgba(255,255,255,0.60); backdrop-filter: blur(18px) saturate(1.4); -webkit-backdrop-filter: blur(18px) saturate(1.4); border-bottom: 1px solid rgba(120,115,160,0.16); position: sticky; top: 0; z-index: 20; }
      [data-theme="dark"] .pk-kit .adm-topbar { background: rgba(18,22,31,0.55); border-bottom-color: rgba(255,255,255,0.07); }
      .pk-kit .adm-search { flex: 1; max-width: 360px; display: flex; align-items: center; gap: 9px; background: color-mix(in srgb, var(--surface) 75%, transparent); border: 1px solid var(--border); border-radius: 999px; padding: 8px 14px; color: var(--text-faint); font-size: 13px; }
      .pk-kit .adm-search input { border: 0; background: transparent; outline: none; color: var(--text); font: inherit; font-size: 13px; width: 100%; }
      .pk-kit .adm-search input::placeholder { color: var(--text-faint); }
      .pk-kit .adm-iconbtn { width: 36px; height: 36px; border-radius: 50%; border: 1px solid var(--border); background: color-mix(in srgb, var(--surface) 72%, transparent); display: grid; place-items: center; cursor: pointer; color: var(--text-muted); transition: background .2s, color .2s, transform .12s; }
      .pk-kit .adm-iconbtn:hover { background: var(--surface); color: var(--brand-text); }
      .pk-kit .adm-iconbtn:active { transform: scale(.94); }
      .pk-kit .adm-iconbtn.danger:hover { color: var(--danger); border-color: var(--danger); }
      .pk-kit .adm-avatar { width: 36px; height: 36px; border-radius: 50%; background: var(--grad-brand); color: #fff; font-family: var(--font-display); font-size: 13px; font-weight: 600; display: grid; place-items: center; box-shadow: var(--shadow-brand); }
      .pk-kit .adm-brandmark { width: 34px; height: 34px; border-radius: 10px; background: var(--grad-brand); box-shadow: var(--shadow-brand); display: grid; place-items: center; color: #fff; font-family: var(--font-display); font-weight: 700; font-size: 15px; }

      /* Full-width: the workspace fills the screen, no centered column. */
      .pk-root { color: var(--text); font-family: var(--font-body); padding: 24px 32px 64px; min-height: 100%; width: 100%; }
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
      .pk-dot-live { background: var(--positive); box-shadow: 0 0 0 3px color-mix(in srgb, var(--positive) 22%, transparent); }
      .pk-dotlabel { font-size: 12px; font-weight: 600; color: var(--text-muted); }

      /* tab bar */
      .pk-tabs { display: flex; gap: 4px; flex-wrap: wrap; border-bottom: 1px solid var(--border); margin: 22px 0 24px; }
      .pk-tab { display: inline-flex; align-items: center; gap: 8px; padding: 10px 16px; border: 0; background: transparent; color: var(--text-muted); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; text-decoration: none; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: color .14s, border-color .14s; }
      .pk-tab:hover { color: var(--text); }
      .pk-tab.on { color: var(--brand-text); border-bottom-color: var(--brand); }
      .pk-tab .pk-tabcount { font-size: 11px; font-weight: 700; color: var(--text-muted); background: var(--surface-2); border-radius: 999px; padding: 1px 7px; }

      /* needs-setup note */
      .pk-needs { display: flex; align-items: center; gap: 9px; padding: 11px 14px; border: 1px dashed var(--border); border-radius: 12px; background: var(--surface-2); color: var(--text-muted); font-size: 13px; }
      .pk-needs-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--text-faint); flex-shrink: 0; }

      /* team */
      .pk-people { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
      .pk-person { display: flex; align-items: center; gap: 13px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); padding: 14px 16px; }
      .pk-person-av { width: 40px; height: 40px; border-radius: 11px; flex-shrink: 0; display: grid; place-items: center; font-family: var(--font-display); font-weight: 700; font-size: 14px; }
      .pk-person-av.human { background: color-mix(in srgb, var(--positive) 14%, transparent); color: var(--positive); }
      .pk-person-av.agent { background: var(--brand-tint); color: var(--brand-text); }
      .pk-person-name { font-family: var(--font-display); font-size: 15px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
      .pk-person-role { color: var(--text-muted); font-size: 12.5px; margin-top: 2px; }
      .pk-kindtag { font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; padding: 2px 7px; border-radius: 999px; }
      .pk-kindtag.agent { color: var(--brand-text); background: var(--brand-tint); }
      .pk-kindtag.human { color: var(--positive); background: color-mix(in srgb, var(--positive) 14%, transparent); }

      /* tasks */
      .pk-tasks { display: flex; flex-direction: column; gap: 8px; }
      .pk-taskrow { display: flex; align-items: flex-start; gap: 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 13px 16px; }
      .pk-taskbox { width: 16px; height: 16px; border-radius: 5px; border: 1.5px solid var(--border); flex-shrink: 0; margin-top: 2px; display: grid; place-items: center; }
      .pk-taskbox.doing { border-color: var(--brand); }
      .pk-taskbox.done { border-color: #22c55e; background: #22c55e; }
      .pk-taskbox.done svg { width: 11px; height: 11px; stroke: #fff; }
      .pk-task-main { flex: 1; min-width: 0; }
      .pk-task-title { font-size: 14.5px; font-weight: 500; }
      .pk-task-note { color: var(--text-muted); font-size: 12.5px; margin-top: 3px; }
      .pk-task-stat { font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-muted); flex-shrink: 0; }

      /* report tiles */
      .pk-report { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
      .pk-report-tile { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); padding: 18px 20px; }
      .pk-report-val { font-family: var(--font-display); font-size: 26px; font-weight: 600; letter-spacing: -0.02em; }
      .pk-report-label { color: var(--text-muted); font-size: 13px; margin-top: 4px; }

      /* scoreboard: a light stat strip, not boxes */
      .pk-scoreboard { display: flex; gap: 30px; }
      .pk-score { padding: 0; }
      .pk-score-val { font-family: var(--font-display); font-size: 20px; font-weight: 600; letter-spacing: -0.02em; }
      .pk-score-label { color: var(--text-muted); font-size: 11.5px; font-weight: 500; margin-top: 2px; }

      /* clean list view: airy rows with dividers, no heavy cards */
      .pk-list { display: flex; flex-direction: column; }
      .pk-list-sec-h { font-family: var(--font-display); font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); margin: 26px 0 2px; }
      .pk-list-sec-h:first-child { margin-top: 4px; }
      .pk-li { display: flex; align-items: center; gap: 16px; padding: 18px 12px; border-bottom: 1px solid var(--divider); text-decoration: none; color: inherit; border-radius: 10px; transition: background .12s; }
      a.pk-li:hover { background: var(--surface-2); }
      .pk-li-idx { width: 26px; height: 26px; border-radius: 50%; background: var(--surface-2); color: var(--text-muted); font-family: var(--font-display); font-size: 12px; font-weight: 700; display: grid; place-items: center; flex-shrink: 0; }
      .pk-li-main { flex: 1; min-width: 0; }
      .pk-li-label { font-family: var(--font-display); font-size: 15.5px; font-weight: 600; letter-spacing: -0.01em; display: flex; align-items: center; gap: 10px; }
      .pk-li-sub { color: var(--text-muted); font-size: 13.5px; margin-top: 3px; line-height: 1.5; }
      .pk-li-meta { display: flex; align-items: center; gap: 14px; flex-shrink: 0; }
      .pk-li-val { font-family: var(--font-display); font-size: 18px; font-weight: 600; letter-spacing: -0.02em; }
      .pk-li-chev { color: var(--text-faint); display: grid; place-items: center; }
      .pk-li-chev svg { width: 17px; height: 17px; }
      a.pk-li:hover .pk-li-chev { color: var(--brand-text); }

      /* section heads */
      .pk-section { margin-top: 28px; }
      .pk-section-h { font-family: var(--font-display); font-size: 13px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 12px; }

      /* lane cards grid: small emoji boxes */
      .pk-lanes { display: grid; grid-template-columns: repeat(auto-fill, minmax(208px, 1fr)); gap: 12px; }
      .pk-lane { position: relative; display: block; text-decoration: none; color: inherit; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); padding: 15px 16px; transition: transform .14s, border-color .14s, box-shadow .14s; }
      .pk-lane:hover { transform: translateY(-2px); border-color: var(--brand); box-shadow: 0 10px 30px rgba(0,0,0,0.08); }
      .pk-lane-future { opacity: 0.62; }
      .pk-lane-emoji { font-size: 24px; line-height: 1; display: block; }
      .pk-lane-idx { position: absolute; top: 12px; right: 14px; width: 22px; height: 22px; border-radius: 50%; background: var(--surface-2); color: var(--text-muted); font-family: var(--font-display); font-size: 11px; font-weight: 700; display: grid; place-items: center; }
      .pk-lane-top { display: flex; align-items: center; gap: 8px; margin-top: 11px; }
      .pk-lane-label { font-family: var(--font-display); font-size: 15px; font-weight: 600; letter-spacing: -0.01em; }
      .pk-lane-what { color: var(--text-muted); font-size: 13px; line-height: 1.5; margin-top: 6px; }
      .pk-lane-foot { display: flex; align-items: center; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
      .pk-motion { font-size: 10.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; padding: 2px 8px; border-radius: 999px; }
      .pk-motion-deploy { color: var(--brand-text); background: var(--brand-tint); }
      .pk-motion-manage { color: var(--warning); background: color-mix(in srgb, var(--warning) 14%, transparent); }

      /* pipeline flow */
      .pk-flow { display: flex; align-items: stretch; gap: 0; flex-wrap: wrap; }
      .pk-flow .pk-lane { flex: 1; min-width: 190px; }
      .pk-flow-arrow { display: grid; place-items: center; color: var(--text-faint); padding: 0 6px; }
      .pk-flow-arrow svg { width: 18px; height: 18px; }

      /* flow-card contents (Command home): icon chip, throughput value, note.
         .pk-lane already supplies the card shell (border/shadow/hover). */
      .pk-lane-ic { width: 32px; height: 32px; border-radius: 9px; flex-shrink: 0; display: grid; place-items: center; background: var(--grad-brand); color: #fff; }
      .pk-lane-val { font-family: var(--font-display); font-size: 22px; font-weight: 600; letter-spacing: -0.02em; margin-top: 11px; }
      .pk-lane-note { color: var(--text-muted); font-size: 11.5px; line-height: 1.4; margin-top: 9px; }
      .pk-lane-system { border-color: var(--danger); box-shadow: 0 0 0 1px var(--danger); }
      .pk-lane-system .pk-lane-note { color: var(--danger); }

      /* Operations foundation row: one full-width card beneath the flow. */
      .pk-foundation { display: flex; align-items: center; gap: 14px; margin-top: 12px; }
      .pk-foundation-ic { width: 40px; height: 40px; border-radius: 12px; flex-shrink: 0; display: grid; place-items: center; background: var(--grad-brand); color: #fff; }
      .pk-foundation-body { flex: 1; min-width: 0; }

      /* severity chip: the constraint-board vocabulary (BINDING/WATCH/SLACK) */
      .pk-sev-chip { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; flex-shrink: 0; }
      .pk-sev-chip-high { color: var(--danger); background: var(--danger-tint); }
      .pk-sev-chip-med { color: var(--warning); background: var(--warning-tint); }
      .pk-sev-chip-low { color: var(--positive); background: var(--positive-tint); }

      /* system-constraint banner (Command home) */
      .pk-banner { display: flex; align-items: center; gap: 16px; background: var(--danger-tint); border: 1px solid color-mix(in srgb, var(--danger) 35%, var(--border)); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); padding: 18px 22px; text-decoration: none; color: inherit; }
      .pk-banner-empty { background: var(--surface); border-color: var(--border); }
      .pk-banner-ic { width: 42px; height: 42px; border-radius: 12px; flex-shrink: 0; display: grid; place-items: center; background: color-mix(in srgb, var(--danger) 18%, transparent); color: var(--danger); }
      .pk-banner-empty .pk-banner-ic { background: var(--surface-2); color: var(--text-faint); }
      .pk-banner-kicker { font-size: 11.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); }
      .pk-banner-title { font-family: var(--font-display); font-size: 16px; font-weight: 600; margin-top: 3px; }
      .pk-banner-impact { color: var(--text-muted); font-size: 13px; margin-top: 4px; line-height: 1.5; }
      .pk-banner-cta { display: inline-flex; align-items: center; gap: 7px; padding: 10px 16px; border-radius: 999px; background: var(--grad-brand); color: #fff; font-size: 13.5px; font-weight: 600; box-shadow: var(--shadow-brand); flex-shrink: 0; white-space: nowrap; }

      /* pending KPI tile: a muted placeholder for a metric with no real source yet */
      .pk-report-tile.pk-pending { background: var(--surface-2); box-shadow: none; }
      .pk-report-tile.pk-pending .pk-report-val { color: var(--text-faint); font-size: 14px; font-weight: 600; }
      .pk-report-tile.pk-pending .pk-report-label { color: var(--text-faint); }

      /* build space */
      .pk-build { margin-top: 28px; border: 1px dashed var(--border); border-radius: var(--radius-lg); padding: 22px; text-align: center; color: var(--text-muted); font-size: 14px; background: var(--surface-2); }
      .pk-build b { color: var(--text); font-family: var(--font-display); font-weight: 600; }

      /* ===== Service Delivery: roster rail + delivery overview (Task 3.1) ===== */

      /* Two-pane shell: a persistent roster rail beside the page's own
         .pk-root. The child combinator gives the override enough specificity
         to beat the base .pk-root width/flex rules without !important. */
      .pk-delivery-shell { display: flex; align-items: flex-start; min-height: 100%; }
      .pk-delivery-shell > .pk-root { flex: 1 1 0%; width: auto; min-width: 0; }

      .pk-roster { flex: 0 0 284px; width: 284px; position: sticky; top: 0; align-self: flex-start; height: 100dvh; display: flex; flex-direction: column; background: var(--surface); border-right: 1px solid var(--border); overflow: hidden; }
      .pk-roster-head { padding: 18px 16px 10px; }
      .pk-roster-head-row { display: flex; align-items: center; gap: 8px; }
      .pk-roster-title { font-family: var(--font-display); font-size: 15px; font-weight: 600; letter-spacing: -0.01em; }
      .pk-roster-count { margin-left: auto; font-family: var(--font-mono); font-size: 12px; color: var(--text-faint); }
      .pk-roster-search { display: flex; align-items: center; gap: 8px; margin-top: 12px; padding: 8px 12px; border-radius: 10px; background: var(--surface-2); border: 1px solid var(--border); color: var(--text-faint); }
      .pk-roster-search input { flex: 1; min-width: 0; border: 0; background: transparent; outline: none; color: var(--text); font: inherit; font-size: 13px; }
      .pk-roster-search input::placeholder { color: var(--text-faint); }
      .pk-roster-filters { display: flex; gap: 6px; padding: 10px 16px 12px; flex-wrap: wrap; }
      .pk-roster-filter-btn { padding: 5px 10px; border-radius: 999px; font-size: 11px; font-weight: 500; color: var(--text-muted); border: 1px solid var(--border); background: transparent; cursor: pointer; transition: border-color .15s, color .15s, background .15s; }
      .pk-roster-filter-btn:hover { border-color: var(--brand); color: var(--text); }
      .pk-roster-filter-btn.on { background: var(--brand-tint); color: var(--brand-text); border-color: transparent; }
      .pk-roster-list { flex: 1; overflow-y: auto; padding: 0 10px 14px; }
      .pk-roster-row { display: flex; align-items: center; gap: 12px; padding: 11px 10px; border-radius: 12px; width: 100%; text-decoration: none; color: inherit; border: 1px solid transparent; margin-bottom: 2px; transition: background .13s; }
      .pk-roster-row:hover { background: var(--surface-2); }
      .pk-roster-row.active { background: var(--surface-2); border-color: var(--border); box-shadow: inset 3px 0 0 var(--rc, var(--brand)); }
      .pk-roster-pinned { margin-bottom: 8px; }
      .pk-roster-avatar { width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0; display: grid; place-items: center; font-family: var(--font-display); font-weight: 700; font-size: 13px; color: #fff; }
      .pk-roster-avatar-pinned { background: var(--positive-tint); color: var(--positive); }
      .pk-roster-who { min-width: 0; flex: 1; display: flex; flex-direction: column; }
      .pk-roster-who b { font-family: var(--font-display); font-weight: 600; font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .pk-roster-who span { font-size: 11.5px; color: var(--text-muted); }
      .pk-roster-side { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; flex-shrink: 0; }
      .pk-roster-spend { font-family: var(--font-mono); font-size: 11.5px; color: var(--text-muted); }
      .pk-roster-dot { width: 8px; height: 8px; border-radius: 50%; }
      .pk-roster-dot-healthy { background: var(--positive); }
      .pk-roster-dot-warn { background: var(--warning); }
      .pk-roster-dot-paused { background: var(--text-faint); }
      .pk-roster-empty { padding: 24px 10px; text-align: center; color: var(--text-muted); font-size: 13px; }

      /* Narrow viewports: stack the rail above the main pane instead of a
         fixed-width sticky column eating the whole screen height. */
      @media (max-width: 900px) {
        .pk-delivery-shell { flex-direction: column; }
        .pk-roster { position: static; height: auto; max-height: 50dvh; width: 100%; flex: none; border-right: 0; border-bottom: 1px solid var(--border); }
      }

      /* delivery-overview constraint card: title/metric/detail/impact plus the
         Identify/Exploit/Subordinate/Elevate/Repeat attack-plan list. Reuses
         .pk-card and .pk-steps; these add the extra text roles inside it. */
      .pk-constraint-title { font-family: var(--font-display); font-size: 19px; font-weight: 700; letter-spacing: -0.01em; margin: 10px 0 6px; }
      .pk-constraint-metric { font-family: var(--font-mono); font-size: 12.5px; color: var(--text-muted); margin-bottom: 10px; }
      .pk-constraint-detail { color: var(--text-muted); font-size: 14px; line-height: 1.65; margin: 0; }
      .pk-constraint-impact { color: var(--text); font-size: 13.5px; font-weight: 500; margin: 10px 0 0; }
      .pk-constraint-steps-h { font-family: var(--font-display); font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted); margin: 22px 0 4px; }
      .pk-steps .pk-step-owner { color: var(--text-faint); font-weight: 400; font-size: 12.5px; }
      .pk-steps .pk-step-action { color: var(--text-muted); font-size: 13px; margin-top: 3px; }
      .pk-step-status { display: inline-block; margin-top: 6px; font-size: 10.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; padding: 2px 8px; border-radius: 999px; }
      .pk-step-status-todo { color: var(--text-muted); background: var(--surface-2); }
      .pk-step-status-doing { color: var(--brand-text); background: var(--brand-tint); }
      .pk-step-status-done { color: var(--positive); background: var(--positive-tint); }

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
