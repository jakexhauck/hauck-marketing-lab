import { useEffect, useState } from "react";

type Props = {
  client: string;
  onRefresh: () => void;
  refreshing: boolean;
};

function formatStamp(d: Date) {
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const day = String(d.getDate()).padStart(2, "0");
  const mo = months[d.getMonth()];
  const yr = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${day} ${mo} ${yr} · ${hh}:${mm}:${ss} LOCAL`;
}

export function StatusBar({ client, onRefresh, refreshing }: Props) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="statusbar">
      <div className="left">
        <span>
          <span className="pulse-dot" />
          JARVIS · ONLINE
        </span>
        <span>v0.1.0-alpha</span>
      </div>
      <div className="center">{formatStamp(now)}</div>
      <div className="right">
        <button className="refresh-btn" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? "syncing…" : "↻ refresh"}
        </button>
        <span>SUBSCRIPTION · CLAUDE MAX</span>
        <span className="client-pill">▸ {client.toUpperCase()}</span>
      </div>
    </div>
  );
}
