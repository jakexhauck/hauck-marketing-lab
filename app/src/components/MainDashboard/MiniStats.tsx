interface Props {
  clientCount: number;
}

export function MiniStats({ clientCount }: Props) {
  const stats = [
    {
      label: "CLIENTS",
      value: String(clientCount),
      sub: clientCount === 0 ? "None on file" : `${clientCount} on file`,
    },
    { label: "CALLS TODAY", value: "—", sub: "No data — not wired" },
    { label: "FOLLOW-UPS DUE", value: "—", sub: "No data — not wired" },
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
