interface Props {
  clientCount: number;
}

export function GreetingCard({ clientCount }: Props) {
  return (
    <section className="md-greeting-card md-reveal md-reveal-2">
      <div className="md-jarvis-orb">J</div>
      <div className="md-greeting-body">
        <span className="md-eyebrow">Jarvis · daily briefing</span>
        <strong>
          {clientCount === 0
            ? "No clients on the books yet."
            : clientCount === 1
              ? "One client on the books."
              : `${clientCount} clients on the books.`}
        </strong>{" "}
        <span className="md-tag">No data</span> — the daily briefing is not wired
        up yet. Once calls, KPIs, and invoice data are connected, Jarvis will
        summarise the day here.
      </div>
    </section>
  );
}
