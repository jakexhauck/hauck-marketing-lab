// Infrastructure: the whole business on one screen. A "living map" that renders
// entirely from lib/pillars.ts, so adding a lane (or a whole pillar) there makes
// it appear here automatically, with no change to this file. Operations is the
// hub band up top; the five numbered pillars are the value chain it feeds, laid
// left to right with chevrons between them.

import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { orderedPillars, rollUpStatus, liveStatus } from "../../lib/pillarStatus";
import type { Pillar, PillarLane } from "../../lib/pillars";
import { PillarStyle, StatusDot, HermesSlot, pillarIcon } from "../../components/pillars/PillarKit";

// One compact pill per lane: a tiny status dot plus the lane label. Future lanes
// read greyed. Driven purely by config, so new lanes show up here with no edits.
function LaneChips({ lanes }: { lanes: PillarLane[] }) {
  return (
    <div className="infra-chips">
      {lanes.map((lane) => (
        <span
          key={lane.id}
          className={`infra-chip${lane.future ? " infra-chip-future" : ""}`}
          title={lane.what}
        >
          <StatusDot status={liveStatus(lane)} />
          <span className="infra-chip-label">{lane.label}</span>
        </span>
      ))}
    </div>
  );
}

export default function AdminInfrastructure() {
  const pillars = orderedPillars();
  const hub = pillars.find((p) => p.order === "hub");
  const chain = pillars.filter((p) => p.order !== "hub");

  return (
    <div className="pk-root">
      <PillarStyle />
      <style>{`
        .infra-head { margin-bottom: 22px; }
        .infra-title { font-family: var(--font-display); font-size: 26px; font-weight: 600; letter-spacing: -0.03em; }
        .infra-sub { color: var(--text-muted); font-size: 14.5px; margin-top: 5px; }

        /* legend */
        .infra-legend { display: flex; align-items: center; flex-wrap: wrap; gap: 16px; margin-top: 16px; padding: 10px 14px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 12px; }
        .infra-legend-item { display: inline-flex; align-items: center; }

        /* hub band */
        .infra-hub { margin-top: 24px; display: flex; gap: 18px; align-items: flex-start; background: var(--brand-tint); border: 1px solid var(--brand); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); padding: 20px 22px; }
        .infra-hub-ic { width: 48px; height: 48px; border-radius: 13px; flex-shrink: 0; display: grid; place-items: center; background: var(--surface); color: var(--brand-text); border: 1px solid var(--brand); }
        .infra-hub-ic svg { width: 24px; height: 24px; }
        .infra-hub-body { flex: 1; min-width: 0; }
        .infra-hub-top { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .infra-hub-label { font-family: var(--font-display); font-size: 19px; font-weight: 600; letter-spacing: -0.02em; }
        .infra-hub-goal { color: var(--text); font-size: 14px; line-height: 1.55; margin-top: 8px; max-width: 760px; }
        .infra-caption { color: var(--text-muted); font-size: 12.5px; font-style: normal; margin-top: 12px; }

        /* value chain */
        .infra-chain-h { font-family: var(--font-display); font-size: 13px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); margin: 30px 0 12px; }
        .infra-chain { display: flex; align-items: stretch; flex-wrap: wrap; gap: 4px; }
        .infra-chev { display: grid; place-items: center; color: var(--text-faint); flex: 0 0 auto; align-self: center; }
        .infra-chev svg { width: 20px; height: 20px; }

        .infra-card { display: flex; flex-direction: column; flex: 1 1 230px; min-width: 230px; text-decoration: none; color: inherit; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); padding: 16px 17px; transition: transform .14s, border-color .14s, box-shadow .14s; }
        .infra-card:hover { transform: translateY(-2px); border-color: var(--brand); box-shadow: 0 10px 30px rgba(0,0,0,0.08); }
        .infra-card-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .infra-card-label { font-family: var(--font-display); font-size: 16px; font-weight: 600; letter-spacing: -0.01em; margin-top: 6px; }
        .infra-card-goal { color: var(--text-muted); font-size: 13px; line-height: 1.5; margin-top: 7px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }

        /* lane chips (shared by hub + chain) */
        .infra-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
        .infra-chip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 9px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface-2); font-size: 11.5px; font-weight: 600; color: var(--text); }
        .infra-chip-future { opacity: 0.55; }
        .infra-chip-label { white-space: nowrap; }

        @media (max-width: 720px) {
          .infra-chev { display: none; }
          .infra-card { flex-basis: 100%; }
        }
      `}</style>

      <div className="infra-head">
        <div className="infra-title">Infrastructure</div>
        <div className="infra-sub">The whole machine on one screen. It updates as we build.</div>
        <div className="infra-legend">
          <span className="infra-legend-item"><StatusDot status="planned" withLabel /></span>
          <span className="infra-legend-item"><StatusDot status="building" withLabel /></span>
          <span className="infra-legend-item"><StatusDot status="live" withLabel /></span>
          <HermesSlot compact />
        </div>
      </div>

      {hub && (
        <div className="infra-hub">
          <div className="infra-hub-ic">
            {(() => {
              const Icon = pillarIcon(hub.icon);
              return <Icon />;
            })()}
          </div>
          <div className="infra-hub-body">
            <div className="infra-hub-top">
              <span className="infra-hub-label">{hub.label}</span>
              <StatusDot status={rollUpStatus(hub)} withLabel />
            </div>
            {hub.goal && <div className="infra-hub-goal">{hub.goal}</div>}
            <LaneChips lanes={hub.lanes} />
            <div className="infra-caption">The hub every pillar reports into.</div>
          </div>
        </div>
      )}

      <div className="infra-chain-h">Value chain</div>
      <div className="infra-chain">
        {chain.map((p: Pillar, i) => (
          <div key={p.id} style={{ display: "contents" }}>
            <Link to={`/admin/pillar/${p.id}`} className="infra-card">
              <div className="infra-card-top">
                <span className="pk-kicker"><span className="pk-num">{p.num}</span></span>
                <StatusDot status={rollUpStatus(p)} />
              </div>
              <div className="infra-card-label">{p.label}</div>
              {p.goal && <div className="infra-card-goal">{p.goal}</div>}
              <LaneChips lanes={p.lanes} />
            </Link>
            {i < chain.length - 1 && (
              <div className="infra-chev" aria-hidden>
                <ChevronRight />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
