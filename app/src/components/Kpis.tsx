type Spark = { points: string; color: string };

type KpiCard = {
  label: string;
  value: string;
  meta: string;
  delta: { text: string; tone: "up" | "down" | "flat" };
  spark: Spark;
};

const PLACEHOLDER: KpiCard[] = [
  {
    label: "SPEND · 7d",
    value: "$1,847",
    meta: "of $2,500 cap",
    delta: { text: "73.9%", tone: "flat" },
    spark: { points: "0,20 10,17 20,13 30,10 40,7 50,4 60,2", color: "#ec9849" },
  },
  {
    label: "CPM",
    value: "$32.40",
    meta: "bench $24–30",
    delta: { text: "▲ 8%", tone: "up" },
    spark: { points: "0,16 10,15 20,13 30,11 40,9 50,7 60,4", color: "#f87171" },
  },
  {
    label: "CTR",
    value: "1.4%",
    meta: "bench 1.2–2.0",
    delta: { text: "✓ in band", tone: "down" },
    spark: { points: "0,11 10,12 20,10 30,11 40,10 50,11 60,10", color: "#5fe699" },
  },
  {
    label: "CVR",
    value: "2.8%",
    meta: "bench 3–5%",
    delta: { text: "▼ under", tone: "up" },
    spark: { points: "0,5 10,8 20,11 30,12 40,14 50,16 60,17", color: "#fbbf24" },
  },
  {
    label: "CPA",
    value: "$48",
    meta: "target $35",
    delta: { text: "▲ 37%", tone: "up" },
    spark: { points: "0,15 10,14 20,13 30,11 40,8 50,5 60,4", color: "#f87171" },
  },
  {
    label: "ROAS",
    value: "1.6×",
    meta: "scale floor 2.0×",
    delta: { text: "↻ 0.4 short", tone: "up" },
    spark: { points: "0,13 10,11 20,12 30,10 40,12 50,11 60,11", color: "#fbbf24" },
  },
];

export function Kpis() {
  return (
    <section className="kpis reveal reveal-2">
      {PLACEHOLDER.map((k) => (
        <div className="kpi" key={k.label}>
          <div className="kpi-label">{k.label}</div>
          <div className="kpi-value">{k.value}</div>
          <div className="kpi-meta">
            <span>{k.meta}</span>
            <span className={`kpi-delta ${k.delta.tone}`}>{k.delta.text}</span>
          </div>
          <svg className="kpi-spark" viewBox="0 0 60 24">
            <polyline fill="none" stroke={k.spark.color} strokeWidth="1.4" points={k.spark.points} />
          </svg>
        </div>
      ))}
    </section>
  );
}
