export function Hero({ clientName }: { clientName: string }) {
  return (
    <section className="hero reveal reveal-1">
      <div className="hero-eyebrow">
        <span>OPERATIONAL STATUS</span>
        <span className="verdict">▸ HOLD</span>
        <span style={{ marginLeft: "auto", color: "var(--text-faint)", fontWeight: 400 }}>
          EVAL WINDOW · 7d / 14d
        </span>
      </div>
      <h1>
        Sir, I'd advise against scaling {clientName} just yet —{" "}
        <strong>creative diversity is below threshold</strong> and the landing page is leaking
        conversions.
      </h1>
      <p className="hero-body">
        ROAS sits at <span className="tag">1.6×</span> against the 2.0× scale floor. CTR is healthy;
        CVR is not. Current creative pool stands at 8 active variants — the Andromeda paradigm
        requires <span className="tag">15+</span>. Recommend deploying Vortex for 12 fresh hooks
        before the next budget review.
      </p>

      <div className="spectrum">
        <div className="spectrum-track">
          <div className="spectrum-marker" style={{ left: "52%" }} />
        </div>
        <div className="spectrum-labels">
          <span>KILL</span>
          <span>HOLD</span>
          <span>SCALE +20%</span>
        </div>
      </div>
    </section>
  );
}
