import type { PillarConstraint } from "../../lib/api";
import { severityWord, sortSteps, stepStatusWord } from "../../lib/adminCommand";

// The Theory-of-Constraints spotlight card: severity chip, title, metric,
// detail, impact, and the ordered Identify/Exploit/Subordinate/Elevate/Repeat
// attack plan. Shared by the Command board's flow lanes (via SeverityChip),
// the Service Delivery overview, and every generic pillar page so the
// constraint/attack-plan rendering lives in exactly one place. Presentational
// only: it takes a resolved PillarConstraint and renders it, no data
// fetching, no loading/error/empty handling (the caller owns that, since the
// empty-state copy differs per page).

export function SeverityChip({ severity }: { severity: PillarConstraint["severity"] }) {
  return <span className={`pk-sev-chip pk-sev-chip-${severity}`}>{severityWord(severity)}</span>;
}

export default function ConstraintPanel({ constraint }: { constraint: PillarConstraint }) {
  const steps = sortSteps(constraint.steps);

  return (
    <div className="pk-card">
      <SeverityChip severity={constraint.severity} />
      <div className="pk-constraint-title">{constraint.title}</div>
      {constraint.metric && <div className="pk-constraint-metric">{constraint.metric}</div>}
      {constraint.detail && <p className="pk-constraint-detail">{constraint.detail}</p>}
      {constraint.impact && <p className="pk-constraint-impact">{constraint.impact}</p>}

      {steps.length > 0 && (
        <>
          <div className="pk-constraint-steps-h">
            Attack plan &middot; Identify &rarr; Exploit &rarr; Subordinate &rarr; Elevate &rarr;
            Repeat
          </div>
          <ol className="pk-steps">
            {steps.map((s, i) => (
              <li key={i}>
                <b>{s.step}</b>
                {s.owner && <span className="pk-step-owner"> &middot; owner {s.owner}</span>}
                <div className="pk-step-action">{s.action}</div>
                <span className={`pk-step-status pk-step-status-${s.status}`}>
                  {stepStatusWord(s.status)}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
