const CREATIVES = [
  { id: "WW-001", name: "before/after", signal: "go" },
  { id: "WW-002", name: "neighbor proof", signal: "go" },
  { id: "WW-003", name: "price reveal", signal: "hold" },
  { id: "WW-004", name: "UGC testimonial", signal: "go" },
  { id: "WW-005", name: "seasonal urgency", signal: "stop" },
];

const dotColor: Record<string, string> = {
  go: "var(--signal-go)",
  hold: "var(--signal-hold)",
  stop: "var(--signal-stop)",
};

export function CreativeRing() {
  return (
    <div className="panel creative-ring-wrap">
      <div className="panel-head" style={{ justifyContent: "center" }}>
        <span className="panel-title">▸ CREATIVE DIVERSITY</span>
      </div>
      <div className="creative-ring" style={{ "--pct": "53%" } as React.CSSProperties}>
        <div className="creative-ring-inner">
          <div className="num">
            <em>8</em>/15
          </div>
          <div className="denom">ACTIVE / MIN</div>
        </div>
      </div>
      <ul className="creative-list">
        {CREATIVES.map((c) => (
          <li key={c.id}>
            <span>
              <span className="id">{c.id}</span>
              {c.name}
            </span>
            <span style={{ color: dotColor[c.signal] }}>●</span>
          </li>
        ))}
        <li style={{ color: "var(--text-faint)" }}>+ 3 others · 7 needed</li>
      </ul>
    </div>
  );
}
