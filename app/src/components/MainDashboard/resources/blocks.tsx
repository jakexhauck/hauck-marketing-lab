import type { Block } from "./types";

export function BlockRenderer({ block }: { block: Block }) {
  switch (block.kind) {
    case "section":
      return (
        <div className="rsx-section-head">
          <div className="rsx-section-eyebrow">Section {block.num}</div>
          <h2 id={block.id} className="rsx-h2">{block.title}</h2>
        </div>
      );

    case "h3":
      return <h3 className="rsx-h3">{block.text}</h3>;

    case "p":
      return (
        <p className="rsx-p">
          {block.lead && <span className="rsx-lead">{block.lead}</span>}
          {block.lead ? " " : ""}{block.body}
        </p>
      );

    case "list":
      return (
        <ul className="rsx-list">
          {block.items.map((it, i) => <li key={i}>{it}</li>)}
        </ul>
      );

    case "learnPanel":
      return (
        <div className="rsx-learn-panel">
          <div className="rsx-learn-label">What you'll learn</div>
          <ul className="rsx-learn-list">
            {block.items.map((it, i) => (
              <li key={i}>
                <span className="rsx-learn-num">{String(i + 1).padStart(2, "0")}</span>
                <span>{it}</span>
              </li>
            ))}
          </ul>
        </div>
      );

    case "machineGrid":
      return (
        <div className="rsx-machine-grid">
          {block.items.map((it, i) => (
            <div key={i} className="rsx-machine-card">
              <div className="rsx-machine-num">{it.num}</div>
              <div className="rsx-machine-title">{it.title}</div>
              <div className="rsx-machine-desc">{it.desc}</div>
            </div>
          ))}
        </div>
      );

    case "funnel": {
      const widths = ["100%", "88%", "70%", "52%", "36%", "28%", "22%"];
      return (
        <div className="rsx-funnel-diagram">
          {block.tiers.map((t, i) => {
            const isLast = i === block.tiers.length - 1;
            return (
              <div
                key={i}
                className={`rsx-funnel-bar${isLast ? " rsx-funnel-bar-final" : ""}`}
                style={{ width: widths[i] ?? "22%" }}
              >
                <div>
                  <div className="rsx-funnel-tier-num">{t.num}</div>
                  <div className="rsx-funnel-tier-label">{t.label}</div>
                </div>
                <div className="rsx-funnel-desc">{t.desc}</div>
              </div>
            );
          })}
        </div>
      );
    }

    case "heroStats":
      return (
        <div
          className="rsx-hero-stats"
          style={{ gridTemplateColumns: `repeat(${block.stats.length}, 1fr)` }}
        >
          {block.stats.map((s, i) => (
            <div key={i} className="rsx-hero-stat">
              <span className="rsx-hero-stat-value">{s.value}</span>
              <span className="rsx-hero-stat-label">{s.label}</span>
            </div>
          ))}
        </div>
      );

    case "satelliteGrid":
      return (
        <div
          className="rsx-satellite-grid"
          style={{ gridTemplateColumns: `repeat(${block.stats.length}, 1fr)` }}
        >
          {block.stats.map((s, i) => (
            <div key={i} className="rsx-satellite">
              <span className="rsx-satellite-value">{s.value}</span>
              <span className="rsx-satellite-label">{s.label}</span>
            </div>
          ))}
        </div>
      );

    case "takeaway":
      return (
        <div className="rsx-takeaway">
          <div className="rsx-takeaway-label">Key takeaway</div>
          <div className="rsx-takeaway-text">{block.text}</div>
        </div>
      );

    case "quote":
      return (
        <blockquote className="rsx-quote">
          {block.body}
          {block.attribution && (
            <div className="rsx-quote-attr">{block.attribution}</div>
          )}
        </blockquote>
      );

    case "image":
      return (
        <figure className="rsx-image">
          <img src={block.src} alt={block.alt ?? ""} />
          {block.caption && (
            <figcaption className="rsx-image-caption">{block.caption}</figcaption>
          )}
        </figure>
      );

    case "table":
      return (
        <table className="rsx-table">
          <thead>
            <tr>
              {block.headers.map((h, i) => <th key={i}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => <td key={j}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      );

    default:
      return null;
  }
}
