// Infrastructure: the whole business as one connected, clickable node map. The
// "Hauck" core feeds the Operations hub; the hub feeds the five value-chain
// pillars (Outreach, Sales, Onboarding, Service Delivery, Retention); each
// pillar branches into its own tabs; the software stack wires into the pillars
// it serves; Clients hangs off the hub. Every node is a link. The whole layout
// renders from lib/pillars.ts + lib/stackData.ts, so adding a lane, tab, or
// tool there appears here with no change to this file.

import { Link } from "react-router-dom";
import { Building2, Users } from "lucide-react";
import { orderedPillars, rollUpStatus } from "../../lib/pillarStatus";
import { STACK_TOOLS, STACK_CATEGORIES } from "../../lib/stackData";
import { PillarStyle, StatusDot, pillarIcon } from "../../components/pillars/PillarKit";

// Which pillars each stack category serves. Tool nodes draw a faint line to each.
const CATEGORY_PILLARS: Record<string, string[]> = {
  "Infra & Hosting": ["operations"],
  "Dev & Build": ["operations"],
  "Ads & Marketing": ["service", "outreach"],
  "AI & Agents": ["operations"],
  "Comms & Productivity": ["operations", "retention"],
};

// Layout coordinates. x is a percent of the stage width (so nodes and the SVG
// connectors stay aligned at any width); y is a fixed pixel offset.
const CORE = { x: 42, y: 50 };
const HUB = { x: 42, y: 172 };
const CLIENTS = { x: 12, y: 172 };
const HUBTAB_Y = 302;
const PILLAR_Y = 452;
const PILLAR_TAB_TOP = PILLAR_Y + 74;
const PILLAR_TAB_STEP = 30;
const TOOL_X = 90;
const TOOL_TOP = 150;
const TOOL_STEP = 58;
const STAGE_H = 770;
const PER_CATEGORY = 2; // cap tools per category so the right column stays calm

export default function AdminInfrastructure() {
  const pillars = orderedPillars();
  const hub = pillars.find((p) => p.order === "hub");
  const chain = pillars.filter((p) => p.order !== "hub");

  // Even spread of the value-chain pillars across the stage width.
  const n = chain.length;
  const pillarX = (i: number) => (n <= 1 ? 42 : 10 + (74 - 10) * (i / (n - 1)));

  // Operations tabs fan in a centered row beneath the hub.
  const hubTabs = hub ? hub.tabs : [];
  const m = hubTabs.length;
  const hubSpan = Math.min(42, (m - 1) * 6.5);
  const hubStart = HUB.x - hubSpan / 2;
  const hubTabX = (j: number) => (m <= 1 ? HUB.x : hubStart + hubSpan * (j / (m - 1)));

  // Sampled tool list with the pillar ids each one wires into.
  const tools = STACK_CATEGORIES.flatMap((cat) =>
    STACK_TOOLS.filter((t) => t.category === cat)
      .slice(0, PER_CATEGORY)
      .map((tool) => ({ tool, serves: CATEGORY_PILLARS[cat] ?? [] }))
  );

  // Resolve a connector target by pillar id (operations resolves to the hub).
  const posById = (id: string): { x: number; y: number } => {
    if (id === "operations") return HUB;
    const idx = chain.findIndex((p) => p.id === id);
    return idx >= 0 ? { x: pillarX(idx), y: PILLAR_Y } : HUB;
  };

  // Build every connector line up front, then render them behind the nodes.
  type Line = { x1: number; y1: number; x2: number; y2: number; cls: string; key: string };
  const lines: Line[] = [];
  lines.push({ x1: CORE.x, y1: CORE.y, x2: HUB.x, y2: HUB.y, cls: "ig-line", key: "core-hub" });
  lines.push({ x1: HUB.x, y1: HUB.y, x2: CLIENTS.x, y2: CLIENTS.y, cls: "ig-line", key: "hub-clients" });
  hubTabs.forEach((t, j) =>
    lines.push({ x1: HUB.x, y1: HUB.y, x2: hubTabX(j), y2: HUBTAB_Y, cls: "ig-line", key: `hubtab-${t.id}` })
  );
  chain.forEach((p, i) =>
    lines.push({ x1: HUB.x, y1: HUB.y, x2: pillarX(i), y2: PILLAR_Y, cls: "ig-line", key: `hub-${p.id}` })
  );
  for (let i = 0; i < chain.length - 1; i++) {
    lines.push({ x1: pillarX(i), y1: PILLAR_Y, x2: pillarX(i + 1), y2: PILLAR_Y, cls: "ig-flow", key: `flow-${i}` });
  }
  chain.forEach((p, i) =>
    p.tabs.forEach((t, j) => {
      const ty = PILLAR_TAB_TOP + j * PILLAR_TAB_STEP;
      lines.push({ x1: pillarX(i), y1: PILLAR_Y, x2: pillarX(i), y2: ty, cls: "ig-line", key: `ptab-${p.id}-${t.id}` });
    })
  );
  tools.forEach((tw, k) => {
    const ty = TOOL_TOP + k * TOOL_STEP;
    tw.serves.forEach((pid) => {
      const pos = posById(pid);
      lines.push({ x1: TOOL_X, y1: ty, x2: pos.x, y2: pos.y, cls: "ig-tool-line", key: `tool-${k}-${pid}` });
    });
  });

  const HubIcon = hub ? pillarIcon(hub.icon) : Building2;

  return (
    <div className="pk-root">
      <PillarStyle />
      <style>{`
        .ig-head { margin-bottom: 18px; }
        .ig-title { font-family: var(--font-display); font-size: 26px; font-weight: 600; letter-spacing: -0.03em; }
        .ig-sub { color: var(--text-muted); font-size: 14.5px; margin-top: 5px; }
        .ig-legend { display: flex; align-items: center; flex-wrap: wrap; gap: 16px; margin-top: 14px; padding: 9px 14px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 12px; }

        /* scrolling stage */
        .ig-wrap { width: 100%; overflow-x: auto; }
        .ig-stage { position: relative; width: 100%; min-width: 1320px; height: ${STAGE_H}px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); background-image: radial-gradient(var(--border) 0.6px, transparent 0.6px); background-size: 26px 26px; }

        /* connector layer (behind nodes) */
        .ig-svg { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 1; pointer-events: none; }
        .ig-line { stroke: var(--border); stroke-width: 1.4; }
        .ig-flow { stroke: var(--brand); stroke-width: 2.2; opacity: 0.5; stroke-linecap: round; }
        .ig-tool-line { stroke: var(--brand); stroke-width: 1; opacity: 0.16; }

        /* axis labels (orientation only, not clickable) */
        .ig-axis { position: absolute; transform: translate(-50%, -50%); z-index: 1; pointer-events: none; color: var(--text-muted); font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; white-space: nowrap; }

        /* node anchor: centers a node on its (x, y) point */
        .ig-anchor { position: absolute; transform: translate(-50%, -50%); z-index: 2; }

        .ig-node { display: block; text-decoration: none; color: inherit; background: var(--surface); border: 1px solid var(--border); border-radius: 13px; box-shadow: var(--shadow-sm); transition: transform .14s ease, border-color .14s ease, box-shadow .14s ease; }
        .ig-node:hover { transform: translateY(-3px); border-color: var(--brand); box-shadow: 0 12px 28px rgba(0,0,0,0.10); }

        /* core */
        .ig-core { display: flex; align-items: center; gap: 12px; padding: 14px 18px; background: var(--brand-tint); border-color: var(--brand); border-radius: 16px; }
        .ig-core-ic { width: 38px; height: 38px; border-radius: 11px; flex-shrink: 0; display: grid; place-items: center; background: var(--surface); color: var(--brand-text); border: 1px solid var(--brand); }
        .ig-core-ic svg { width: 20px; height: 20px; }
        .ig-core-label { font-family: var(--font-display); font-size: 17px; font-weight: 600; letter-spacing: -0.02em; color: var(--brand-text); }
        .ig-core-sub { color: var(--text-muted); font-size: 11.5px; margin-top: 1px; }

        /* hub */
        .ig-hub { display: flex; align-items: center; gap: 13px; padding: 15px 20px; border-color: var(--brand); border-width: 1.5px; min-width: 210px; }
        .ig-hub-ic { width: 44px; height: 44px; border-radius: 12px; flex-shrink: 0; display: grid; place-items: center; background: var(--brand-tint); color: var(--brand-text); }
        .ig-hub-ic svg { width: 23px; height: 23px; }
        .ig-hub-kick { color: var(--text-muted); font-size: 10.5px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; }
        .ig-hub-label { font-family: var(--font-display); font-size: 19px; font-weight: 600; letter-spacing: -0.02em; display: flex; align-items: center; gap: 9px; margin-top: 1px; }

        /* pillar */
        .ig-pillar { padding: 12px 15px; min-width: 168px; }
        .ig-pillar-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .ig-pillar-num { color: var(--brand-text); font-size: 11px; font-weight: 700; letter-spacing: 0.1em; }
        .ig-pillar-label { font-family: var(--font-display); font-size: 15.5px; font-weight: 600; letter-spacing: -0.01em; display: flex; align-items: center; gap: 8px; margin-top: 7px; }
        .ig-pillar-label svg { width: 16px; height: 16px; color: var(--brand-text); flex-shrink: 0; }

        /* small pills: tabs + tools + clients */
        .ig-tab, .ig-tool, .ig-clients { display: inline-flex; align-items: center; gap: 7px; padding: 6px 12px; font-size: 12px; font-weight: 600; white-space: nowrap; border-radius: 999px; background: var(--surface-2); }
        .ig-tab { color: var(--text); }
        .ig-tool { color: var(--text-muted); }
        .ig-tool::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--brand); opacity: 0.65; flex-shrink: 0; }
        .ig-clients { padding: 9px 15px; font-size: 13px; color: var(--text); }
        .ig-clients svg { width: 15px; height: 15px; color: var(--brand-text); }

        .ig-caption { color: var(--text-muted); font-size: 12.5px; margin-top: 14px; }
      `}</style>

      <div className="ig-head">
        <div className="ig-title">Infrastructure</div>
        <div className="ig-sub">The whole business as one connected map. Every node is a link. It updates as we build.</div>
        <div className="ig-legend">
          <StatusDot status="planned" withLabel />
          <StatusDot status="building" withLabel />
          <StatusDot status="live" withLabel />
        </div>
      </div>

      <div className="ig-wrap">
        <div className="ig-stage">
          <svg className="ig-svg" preserveAspectRatio="none" aria-hidden="true">
            {lines.map((l) => (
              <line key={l.key} className={l.cls} x1={`${l.x1}%`} y1={l.y1} x2={`${l.x2}%`} y2={l.y2} />
            ))}
          </svg>

          {/* orientation labels */}
          <div className="ig-axis" style={{ left: `${42}%`, top: `${PILLAR_Y - 78}px` }}>Value chain</div>
          <div className="ig-axis" style={{ left: `${TOOL_X}%`, top: `${TOOL_TOP - 46}px` }}>Software stack</div>

          {/* core */}
          <div className="ig-anchor" style={{ left: `${CORE.x}%`, top: `${CORE.y}px` }}>
            <Link to="/admin" className="ig-node ig-core">
              <span className="ig-core-ic"><Building2 /></span>
              <span>
                <span className="ig-core-label" style={{ display: "block" }}>Hauck Marketing</span>
                <span className="ig-core-sub" style={{ display: "block" }}>The business</span>
              </span>
            </Link>
          </div>

          {/* clients */}
          <div className="ig-anchor" style={{ left: `${CLIENTS.x}%`, top: `${CLIENTS.y}px` }}>
            <Link to="/admin/clients" className="ig-node ig-clients"><Users /> Clients</Link>
          </div>

          {/* operations hub */}
          {hub && (
            <div className="ig-anchor" style={{ left: `${HUB.x}%`, top: `${HUB.y}px` }}>
              <Link to={`/admin/pillar/${hub.id}`} className="ig-node ig-hub">
                <span className="ig-hub-ic"><HubIcon /></span>
                <span>
                  <span className="ig-hub-kick" style={{ display: "block" }}>Hub</span>
                  <span className="ig-hub-label">{hub.label} <StatusDot status={rollUpStatus(hub)} /></span>
                </span>
              </Link>
            </div>
          )}

          {/* operations tabs */}
          {hub &&
            hubTabs.map((t, j) => (
              <div className="ig-anchor" key={`hubtab-${t.id}`} style={{ left: `${hubTabX(j)}%`, top: `${HUBTAB_Y}px` }}>
                <Link to={`/admin/pillar/${hub.id}/${t.id}`} className="ig-node ig-tab">{t.label}</Link>
              </div>
            ))}

          {/* value-chain pillars + their tabs */}
          {chain.map((p, i) => {
            const Icon = pillarIcon(p.icon);
            return (
              <div key={p.id}>
                <div className="ig-anchor" style={{ left: `${pillarX(i)}%`, top: `${PILLAR_Y}px` }}>
                  <Link to={`/admin/pillar/${p.id}`} className="ig-node ig-pillar">
                    <span className="ig-pillar-top">
                      <span className="ig-pillar-num">{p.num}</span>
                      <StatusDot status={rollUpStatus(p)} />
                    </span>
                    <span className="ig-pillar-label"><Icon /> {p.label}</span>
                  </Link>
                </div>
                {p.tabs.map((t, j) => (
                  <div
                    className="ig-anchor"
                    key={`${p.id}-${t.id}`}
                    style={{ left: `${pillarX(i)}%`, top: `${PILLAR_TAB_TOP + j * PILLAR_TAB_STEP}px` }}
                  >
                    <Link to={`/admin/pillar/${p.id}/${t.id}`} className="ig-node ig-tab">{t.label}</Link>
                  </div>
                ))}
              </div>
            );
          })}

          {/* software stack */}
          {tools.map((tw, k) => {
            const top = TOOL_TOP + k * TOOL_STEP;
            const cls = "ig-node ig-tool";
            return (
              <div className="ig-anchor" key={`tool-${tw.tool.name}`} style={{ left: `${TOOL_X}%`, top: `${top}px` }}>
                {tw.tool.url ? (
                  <a href={tw.tool.url} target="_blank" rel="noreferrer" className={cls}>{tw.tool.name}</a>
                ) : (
                  <Link to="/admin/pillar/operations/stack" className={cls}>{tw.tool.name}</Link>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="ig-caption">
        Everything renders from the pillar config. Adding a lane, tab, or tool here appears automatically.
      </div>
    </div>
  );
}
