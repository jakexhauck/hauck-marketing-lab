import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import { getPillar, getLane, liveStatus } from "../../lib/pillarStatus";
import { PillarStyle, StatusDot, HermesSlot, Scoreboard } from "../../components/pillars/PillarKit";

// One lane workspace: the SOP, assets, tools, and scoreboard for a single lane.
// Structure comes from lib/pillars via getPillar/getLane; sections only render
// when their data exists. The Hermes slot is always shown as the future home for
// the agent that will run this lane. Reuses the shared PillarKit styling.

export default function AdminLane() {
  const { pillarId, laneId } = useParams<{ pillarId: string; laneId: string }>();
  const pillar = getPillar(pillarId ?? "");
  const lane = getLane(pillarId ?? "", laneId ?? "");

  if (!pillar || !lane) return <Navigate to="/admin/clients" replace />;

  const hasContent =
    !!lane.process?.length ||
    !!lane.assets?.length ||
    !!lane.links?.length ||
    !!lane.scoreboard?.length;

  return (
    <div className="pk-root">
      <PillarStyle />

      <Link className="pk-back" to={`/admin/pillar/${pillar.id}`}>
        <ArrowLeft /> {pillar.label}
      </Link>

      <div className="pk-kicker">{pillar.label} lane</div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span className="pk-title">{lane.label}</span>
        <StatusDot status={liveStatus(lane)} withLabel />
        {lane.motion && (
          <span className={`pk-motion pk-motion-${lane.motion}`}>{lane.motion}</span>
        )}
      </div>
      <div className="pk-tagline">{lane.what}</div>

      {hasContent ? (
        <>
          {lane.process?.length ? (
            <section className="pk-section">
              <div className="pk-section-h">How we deliver it</div>
              <div className="pk-card">
                <ol className="pk-steps">
                  {lane.process.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>
            </section>
          ) : null}

          {lane.assets?.length ? (
            <section className="pk-section">
              <div className="pk-section-h">Assets and templates</div>
              <div className="pk-card">
                <ul className="pk-bullets">
                  {lane.assets.map((asset, i) => (
                    <li key={i}>{asset}</li>
                  ))}
                </ul>
              </div>
            </section>
          ) : null}

          {lane.links?.length ? (
            <section className="pk-section">
              <div className="pk-section-h">Linked tools</div>
              <div className="pk-card">
                <div className="pk-links">
                  {lane.links.map((link, i) =>
                    link.external ? (
                      <a
                        className="pk-link"
                        key={i}
                        href={link.to}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {link.label}
                        <ExternalLink />
                      </a>
                    ) : (
                      <Link className="pk-link" key={i} to={link.to}>
                        {link.label}
                        <ArrowRight />
                      </Link>
                    )
                  )}
                </div>
              </div>
            </section>
          ) : null}

          {lane.scoreboard?.length ? (
            <section className="pk-section">
              <div className="pk-section-h">Scoreboard</div>
              <div className="pk-card">
                <Scoreboard fields={lane.scoreboard} />
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <div className="pk-empty">
          Not built yet. This is where the SOP, assets, and tools for this lane will live.
        </div>
      )}

      <section className="pk-section">
        <div className="pk-card">
          <HermesSlot />
          <div className="pk-tagline" style={{ marginTop: 10 }}>
            A Hermes agent will run this lane later.
          </div>
        </div>
      </section>
    </div>
  );
}
