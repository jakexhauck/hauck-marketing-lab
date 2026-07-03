import { Navigate, useParams } from "react-router-dom";

// A single Theory-of-Constraints pillar page (throughput / funnel / constraint /
// attack plan). Task 4 fills the body and adds the editor. Placeholder for now;
// it reads :pillarId and shows the pillar it will host.
const PILLAR_LABELS: Record<string, string> = {
  acquisition: "Acquisition",
  sales: "Sales",
  operations: "Operations",
};

export default function AdminPillarPage() {
  const { pillarId } = useParams<{ pillarId: string }>();
  const label = pillarId ? PILLAR_LABELS[pillarId] : undefined;

  // Unknown ids (after redirects have handled the legacy ones) fall back to
  // Command rather than rendering an empty, meaningless pillar shell.
  if (!label) return <Navigate to="/admin" replace />;

  return (
    <div className="pk-root">
      <div className="pk-kicker">Pillar</div>
      <h1 className="pk-title">{label}</h1>
      <p className="pk-tagline">Throughput, funnel, the current constraint, and the attack plan for {label}.</p>
      <div className="pk-empty">This pillar view is coming in the next phase.</div>
    </div>
  );
}
