export function TrackingPulse() {
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">▸ TRACKING PULSE</span>
        <span className="panel-meta">NEXUS</span>
      </div>

      <div className="dials">
        <div className="dial">
          <div className="dial-ring" style={{ "--pct": "100%" } as React.CSSProperties}>
            <div className="dial-val">✓</div>
          </div>
          <div className="dial-name">PIXEL</div>
        </div>
        <div className="dial">
          <div className="dial-ring" style={{ "--pct": "100%" } as React.CSSProperties}>
            <div className="dial-val">✓</div>
          </div>
          <div className="dial-name">CAPI</div>
        </div>
        <div className="dial">
          <div className="dial-ring amber" style={{ "--pct": "72%" } as React.CSSProperties}>
            <div className="dial-val">7.2</div>
          </div>
          <div className="dial-name">EMQ</div>
        </div>
      </div>

      <div className="pulse-line">
        Server-side events flowing. EMQ could climb to <strong>8.5+</strong> by adding hashed phone
        + zip on the lead form. Optional but recommended before scale.
      </div>
    </div>
  );
}
