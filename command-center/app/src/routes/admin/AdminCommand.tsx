import { Fragment } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  ChevronRight,
  Handshake,
  HeartHandshake,
  Megaphone,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useAdminOverviewQuery, useConstraintsQuery } from "../../hooks/useApi";
import { formatMoney } from "../../lib/format";
import type { PillarConstraint } from "../../lib/api";
import { SeverityChip } from "../../components/admin/ConstraintPanel";
import {
  FUNNEL_PILLARS,
  PILLAR_LABELS,
  findConstraintForPillar,
  findSystemConstraint,
  pillarRoute,
  sortBySeverity,
} from "../../lib/adminCommand";

// Command home: the whole-business Theory-of-Constraints command view.
// System-constraint banner, agency KPI row, the Acquisition -> Sales ->
// Service Delivery flow (Operations as the foundation beneath it), and the
// ranked constraints board. PillarStyle is mounted once by AdminLayout, so
// this page only renders .pk-root and the new .pk-* classes it adds.
//
// Data: getConstraints() may resolve to [] until the pillar_constraints
// migration is applied to the live DB (see task-2-brief). Every section below
// has an honest empty state for that; nothing here fabricates a number.

const PILLAR_ICONS: Record<PillarConstraint["pillar"], LucideIcon> = {
  acquisition: Megaphone,
  sales: Handshake,
  delivery: HeartHandshake,
  operations: Wrench,
};

export default function AdminCommand() {
  const overviewQuery = useAdminOverviewQuery(true);
  const constraintsQuery = useConstraintsQuery(true);

  const constraints = constraintsQuery.data ?? [];
  const constraintsLoading = constraintsQuery.isLoading;
  const systemConstraint = findSystemConstraint(constraints);
  const opsConstraint = findConstraintForPillar(constraints, "operations");
  const ranked = sortBySeverity(constraints);

  return (
    <div className="pk-root">
      <div className="pk-kicker">Command</div>
      <h1 className="pk-title">Command</h1>
      <p className="pk-tagline">
        The whole-business command view: system constraint, the value chain, and where to act
        next.
      </p>

      {/* a) System-constraint banner */}
      {systemConstraint ? (
        <Link to={pillarRoute(systemConstraint.pillar)} className="pk-banner">
          <span className="pk-banner-ic" aria-hidden>
            <AlertTriangle size={20} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="pk-banner-kicker">System constraint right now</div>
            <div className="pk-banner-title">
              {PILLAR_LABELS[systemConstraint.pillar]} &middot; {systemConstraint.title}
            </div>
            {systemConstraint.impact && (
              <div className="pk-banner-impact">{systemConstraint.impact}</div>
            )}
          </div>
          <span className="pk-banner-cta">
            Attack it <ArrowRight size={15} />
          </span>
        </Link>
      ) : (
        <div className="pk-banner pk-banner-empty">
          <span className="pk-banner-ic" aria-hidden>
            <AlertTriangle size={20} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="pk-banner-kicker">System constraint</div>
            <div className="pk-banner-title">No system constraint set</div>
            <div className="pk-banner-impact">
              {constraintsLoading
                ? "Loading constraints..."
                : "Constraints have not been set up yet."}
            </div>
          </div>
        </div>
      )}

      {/* b) Agency KPI row */}
      <div className="pk-section">
        <div className="pk-section-h">Agency KPIs</div>
        <div className="pk-report">
          <div className="pk-report-tile">
            <div className="pk-report-val">
              {overviewQuery.isLoading ? "..." : (overviewQuery.data?.activeClients ?? "-")}
            </div>
            <div className="pk-report-label">Active clients</div>
          </div>
          <div className="pk-report-tile">
            <div className="pk-report-val">
              {overviewQuery.isLoading
                ? "..."
                : formatMoney(overviewQuery.data?.combinedSpend ?? null)}
            </div>
            <div className="pk-report-label">Combined spend</div>
          </div>
          <div className="pk-report-tile pk-pending">
            <div className="pk-report-val">Not yet wired</div>
            <div className="pk-report-label">Recurring (MRR)</div>
          </div>
          <div className="pk-report-tile pk-pending">
            <div className="pk-report-val">Not yet wired</div>
            <div className="pk-report-label">Leads this week</div>
          </div>
        </div>
        {overviewQuery.isError && (
          <div className="pk-li-sub" style={{ marginTop: 8 }}>
            Could not load agency KPIs.
          </div>
        )}
      </div>

      {/* c) Flow strip: Acquisition -> Sales -> Service Delivery, Operations beneath */}
      <div className="pk-section">
        <div className="pk-section-h">
          The business as a flow: throughput is limited by the narrowest stage
        </div>
        <div className="pk-flow">
          {FUNNEL_PILLARS.map((pillar, i) => {
            const con = findConstraintForPillar(constraints, pillar);
            const Icon = PILLAR_ICONS[pillar];
            const isSystem = con?.isSystem ?? false;
            return (
              <Fragment key={pillar}>
                {i > 0 && (
                  <span className="pk-flow-arrow" aria-hidden>
                    <ArrowRight />
                  </span>
                )}
                <Link
                  to={pillarRoute(pillar)}
                  className={`pk-lane${isSystem ? " pk-lane-system" : ""}`}
                >
                  <div className="pk-lane-top">
                    <span className="pk-lane-ic" aria-hidden>
                      <Icon size={16} />
                    </span>
                    <span className="pk-lane-label">{PILLAR_LABELS[pillar]}</span>
                    {isSystem ? (
                      <span className="pk-sev-chip pk-sev-chip-high" style={{ marginLeft: "auto" }}>
                        Constraint
                      </span>
                    ) : con ? (
                      <span style={{ marginLeft: "auto" }}>
                        <SeverityChip severity={con.severity} />
                      </span>
                    ) : null}
                  </div>
                  <div className="pk-lane-val">
                    {constraintsLoading ? "..." : (con?.throughputVal ?? "-")}
                  </div>
                  <div className="pk-lane-what" style={{ marginTop: 0 }}>
                    {constraintsLoading
                      ? "Loading..."
                      : (con?.throughputLabel ?? "No throughput metric yet")}
                  </div>
                  {con && <div className="pk-lane-note">{con.title}</div>}
                </Link>
              </Fragment>
            );
          })}
        </div>

        <Link to={pillarRoute("operations")} className="pk-lane pk-foundation">
          <span className="pk-foundation-ic" aria-hidden>
            <Wrench size={18} />
          </span>
          <div className="pk-foundation-body">
            <div className="pk-lane-label">Internal Operations, the foundation under all three</div>
            <div className="pk-lane-what" style={{ marginTop: 2 }}>
              {constraintsLoading
                ? "Loading..."
                : opsConstraint
                  ? `${opsConstraint.throughputLabel ?? "Throughput"}: ${opsConstraint.throughputVal ?? "-"}`
                  : "No throughput metric yet"}
            </div>
          </div>
          {opsConstraint && <SeverityChip severity={opsConstraint.severity} />}
        </Link>
      </div>

      {/* d) Constraints board, ranked by how badly they bind */}
      <div className="pk-section">
        <div className="pk-section-h">Constraints, ranked by how badly they bind</div>
        {constraintsQuery.isError ? (
          <div className="pk-empty">Could not load constraints.</div>
        ) : constraintsLoading ? (
          <div className="pk-empty">Loading constraints...</div>
        ) : ranked.length === 0 ? (
          <div className="pk-empty">Constraints not set up yet.</div>
        ) : (
          <div className="pk-list">
            {ranked.map((c) => {
              const Icon = PILLAR_ICONS[c.pillar];
              return (
                <Link key={c.pillar} to={pillarRoute(c.pillar)} className="pk-li">
                  <span className="pk-li-idx" aria-hidden>
                    <Icon size={14} />
                  </span>
                  <div className="pk-li-main">
                    <div className="pk-li-label">
                      {PILLAR_LABELS[c.pillar]}
                      <SeverityChip severity={c.severity} />
                    </div>
                    <div className="pk-li-sub">{c.title}</div>
                  </div>
                  <div className="pk-li-meta">
                    {c.metric && <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{c.metric}</span>}
                    <span className="pk-li-chev" aria-hidden>
                      <ChevronRight />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
