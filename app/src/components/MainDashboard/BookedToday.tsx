export function BookedToday() {
  return (
    <div className="md-panel">
      <div className="md-panel-head">
        <span className="md-panel-title">▸ Today · Booked</span>
        <span className="md-panel-meta">NO DATA</span>
      </div>
      <div
        style={{
          padding: "32px 16px",
          textAlign: "center",
          color: "var(--text-faint)",
          fontFamily: "var(--mono)",
          fontSize: 12,
          letterSpacing: "0.08em",
        }}
      >
        No calls scheduled — calendar integration not wired up yet.
      </div>
    </div>
  );
}
