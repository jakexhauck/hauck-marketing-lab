import { useState } from "react";
import { ArrowRight, Circle, CircleCheck, ExternalLink, Loader } from "lucide-react";
import type { AgentItem } from "../../../lib/agentWire";
import { STATUS_PILL, itemPayload } from "../../../lib/agentView";
import { pageForAgent } from "../../../lib/briefPages";
import { briefOpLines } from "../../../lib/briefPageOps";
import type { ItemAction } from "./agentApi";

export function StatusPill({ status }: { status: AgentItem["status"] }) {
  const p = STATUS_PILL[status];
  return <span className={`ag-pill ag-p-${p.tone}`}>{p.label}</span>;
}

// Approve / Change it / Decline. "Change it" opens a note box; the note goes
// to the agent as the next message in the item's chat (Task 4 transitionItem).
export function ItemActions({
  onAction,
  busy,
  decline = true,
  approveLabel = "Approve",
}: {
  onAction: (action: ItemAction, note?: string) => void;
  busy: boolean;
  decline?: boolean;
  approveLabel?: string;
}) {
  const [changing, setChanging] = useState(false);
  const [note, setNote] = useState("");
  if (changing) {
    return (
      <div className="ag-change">
        <textarea
          autoFocus
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          aria-label="Change"
        />
        <div className="ag-actions">
          <button
            type="button"
            className="ag-b1"
            disabled={busy || !note.trim()}
            onClick={() => {
              onAction("change", note.trim());
              setChanging(false);
              setNote("");
            }}
          >
            Send
          </button>
          <button type="button" className="ag-b2" onClick={() => setChanging(false)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="ag-actions">
      <button type="button" className="ag-b1" disabled={busy} onClick={() => onAction("approve")}>
        {approveLabel}
      </button>
      <button type="button" className="ag-b2" disabled={busy} onClick={() => setChanging(true)}>
        Change it
      </button>
      {decline && (
        <button type="button" className="ag-b2" disabled={busy} onClick={() => onAction("decline")}>
          Decline
        </button>
      )}
    </div>
  );
}

const isVideo = (url: string) => /\.(mp4|webm|mov)(\?|$)/i.test(url);

// One Building card: title, status pill, then whichever payload parts the PC
// filled in (thumbs, live page window, steps, quote, plan, stats).
export default function ItemCard({
  item,
  active,
  onAction,
  busy,
}: {
  item: AgentItem;
  active?: boolean;
  onAction: (action: ItemAction, note?: string) => void;
  busy: boolean;
}) {
  const p = itemPayload(item.payload);
  // A landing page shows its live address once it has one, the draft before.
  const pageUrl = p.liveUrl ?? p.previewUrl;
  // A brief card (Research or Ads): what its Approve writes to the page, one
  // line per op, so Jake approves exactly what lands.
  const briefLines = item.kind === "brief" ? briefOpLines(pageForAgent(item.agent), item.payload.pageOps) : [];
  return (
    <div className={`ag-card${active ? " active" : ""}`}>
      <div className="ag-card-top">
        <div className="ag-card-t">{item.title}</div>
        <StatusPill status={item.status} />
      </div>
      {p.thumbs.length > 0 && (
        <div className="ag-thumbs">
          {p.thumbs.map((t) =>
            isVideo(t) ? (
              <a key={t} href={t} target="_blank" rel="noreferrer" className="ag-thumb vid">
                <video src={t} muted preload="metadata" />
              </a>
            ) : (
              <a key={t} href={t} target="_blank" rel="noreferrer" className="ag-thumb">
                <img src={t} alt="" loading="lazy" />
              </a>
            ),
          )}
        </div>
      )}
      {p.credits !== null && (
        <div className="ag-spend">
          <div className="ag-stat">
            <div className="v">{p.credits.toLocaleString()}</div>
            <div className="l">credits</div>
          </div>
          {p.what && <div className="ag-spend-what">{p.what}</div>}
        </div>
      )}
      {p.previewUrl && isVideo(p.previewUrl) && (
        <div className="ag-player">
          <video src={p.previewUrl} controls playsInline preload="metadata" />
        </div>
      )}
      {pageUrl && !isVideo(pageUrl) && (
        <div className="ag-browser">
          <div className="ag-browser-bar">
            <b />
            <b />
            <b />
            <span>{pageUrl.replace(/^https:\/\//, "")}</span>
          </div>
          <iframe src={pageUrl} title={item.title} sandbox="allow-scripts allow-same-origin allow-forms" />
        </div>
      )}
      {p.steps.length > 0 && (
        <div className="ag-steps">
          {p.steps.map((s, i) => (
            <div key={i} className={`ag-step ${s.state}`}>
              {s.state === "done" ? <CircleCheck /> : s.state === "now" ? <Loader /> : <Circle />}
              {s.label}
            </div>
          ))}
        </div>
      )}
      {p.quote && <div className="ag-quote">{p.quote}</div>}
      {p.changes.length > 0 && (
        <div className="ag-list">
          {p.changes.map((c, i) => (
            <div key={i} style={{ whiteSpace: "pre-wrap" }}>
              <ArrowRight />
              {c.text}
              {c.bold && <strong>{c.bold}</strong>}
            </div>
          ))}
        </div>
      )}
      {p.taskChanges.length > 0 && (
        <div className="ag-list">
          {p.taskChanges.map((c, i) => (
            <div key={i} style={{ whiteSpace: "pre-wrap" }}>
              <ArrowRight />
              <strong>{c.kind}</strong> {c.text}. {c.reason}
            </div>
          ))}
        </div>
      )}
      {briefLines.length > 0 && (
        <div className="ag-list">
          {briefLines.map((line, i) => (
            <div key={i}>
              <ArrowRight />
              {line}
            </div>
          ))}
        </div>
      )}
      {p.changes.length === 0 && p.taskChanges.length === 0 && briefLines.length === 0 && p.plan.length > 0 && (
        <div className="ag-list">
          {p.plan.map((t, i) => (
            <div key={i}>
              <ArrowRight />
              {t}
            </div>
          ))}
        </div>
      )}
      {p.stats.length > 0 && (
        <div className="ag-stats">
          {p.stats.map((s) => (
            <div key={s.label} className="ag-stat">
              <div className="v">{s.value}</div>
              <div className="l">{s.label}</div>
            </div>
          ))}
        </div>
      )}
      {item.status === "needs_ok" && (
        <ItemActions
          onAction={onAction}
          busy={busy}
          approveLabel={
            p.credits !== null
              ? `Approve ${p.credits.toLocaleString()} credits`
              : p.deploy && p.previewUrl
                ? "Approve and go live"
                : "Approve"
          }
        />
      )}
      {pageUrl && (
        <div className="ag-actions">
          <a href={pageUrl} target="_blank" rel="noopener noreferrer" className="ag-b2">
            <ExternalLink /> Open full size
          </a>
        </div>
      )}
    </div>
  );
}
