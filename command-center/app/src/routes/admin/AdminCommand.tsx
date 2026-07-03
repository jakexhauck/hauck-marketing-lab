// Command home: the whole-business Theory-of-Constraints command view.
// Task 2 fills this body (system-constraint banner, Acquisition -> Sales ->
// Service Delivery flow, ranked constraints board). Placeholder for now.
// PillarStyle is mounted once by AdminLayout, so pages only render .pk-root.
export default function AdminCommand() {
  return (
    <div className="pk-root">
      <div className="pk-kicker">Command</div>
      <h1 className="pk-title">Command</h1>
      <p className="pk-tagline">The whole-business command view: system constraint, the value chain, and where to act next.</p>
      <div className="pk-empty">Command home is coming in the next phase.</div>
    </div>
  );
}
