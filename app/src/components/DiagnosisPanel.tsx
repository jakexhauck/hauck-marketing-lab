type Finding = {
  severity: "high" | "med" | "low";
  attribution: string;
  body: React.ReactNode;
};

const PLACEHOLDER: Finding[] = [
  {
    severity: "high",
    attribution: "VORTEX · HIGH",
    body: (
      <>
        <strong>Creative diversity at 8/15.</strong> Andromeda minimum is 15 active variants; the
        algorithm cannot find pockets without breadth. Ship 12 new hooks across 4 angles.
      </>
    ),
  },
  {
    severity: "med",
    attribution: "STRATOS · MED",
    body: (
      <>
        <strong>Landing CVR 2.8% (target 3.5%).</strong> Click-through is healthy but the page is
        failing to close. Suspect headline/offer mismatch with ad creative.
      </>
    ),
  },
  {
    severity: "low",
    attribution: "NEXUS · OK",
    body: (
      <>
        <strong>Tracking is clean.</strong> Pixel + CAPI both firing; EMQ at 7.2/10. No attribution
        loss to investigate.
      </>
    ),
  },
];

export function DiagnosisPanel() {
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">▸ DIAGNOSIS</span>
        <span className="panel-meta">ZENITH · 0.92 confidence · updated 11m ago</span>
      </div>

      <div className="diag-headline">
        Bottleneck identified at the <strong>creative</strong> layer; landing-page friction is a
        contributing factor.
      </div>

      <ul className="diag-list">
        {PLACEHOLDER.map((f) => (
          <li key={f.attribution} className="diag-item">
            <span className={`diag-dot ${f.severity}`} />
            <span className="diag-attr">{f.attribution}</span>
            <span className="diag-text">{f.body}</span>
          </li>
        ))}
      </ul>

      <div className="actions-row">
        <button className="action primary">Dispatch Vortex · 12 hooks</button>
        <button className="action">Open landing audit</button>
        <button className="action">Generate brief</button>
        <button className="action">Export report</button>
      </div>
    </div>
  );
}
