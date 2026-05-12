interface Props {
  clientCount: number;
  eventsToday?: number;
}

export function MiniStats({ clientCount, eventsToday = 0 }: Props) {
  const stats = [
    {
      label: "CLIENTS",
      value: String(clientCount),
      sub: clientCount === 0 ? "None on file" : `${clientCount} on file`,
    },
    eventsToday > 0
      ? {
          label: "EVENTS TODAY",
          value: String(eventsToday),
          sub: eventsToday === 1 ? "1 event" : `${eventsToday} events`,
        }
      : { label: "EVENTS TODAY", value: "—", sub: "No events today" },
  ];
  return (
    <section className="md-mini-stats md-reveal md-reveal-3">
      {stats.map((s) => (
        <div className="md-mini-stat" key={s.label}>
          <div className="md-label">{s.label}</div>
          <div className="md-val">
            <em>{s.value}</em>
          </div>
          <div className="md-sub">{s.sub}</div>
        </div>
      ))}
    </section>
  );
}
