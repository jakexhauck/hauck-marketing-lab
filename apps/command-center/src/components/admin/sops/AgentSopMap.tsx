import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { X } from "lucide-react";
import {
  AGENT_SOPS,
  KIND,
  SOP_KEY,
  frameSize,
  layoutEdges,
  nodeBox,
  type AgentSop,
  type SopMapId,
  type SopNode,
} from "../../../lib/agentSops";
import { boardFor, howLines, ownerKind, ownerLabel, type DirectorResponse, type DirectorTask } from "../../../lib/director";
import { directorApi, useDirectorWrite } from "../director/directorApi";

// One agent's flow map (lib/agentSops), drawn like a Figma board. The board
// stays light in both themes, like the file in the video; only the side panel
// follows the admin theme. The whole board scales to fit the space so a map
// never needs scrolling (Jake, 2026-10-17). Phones keep a readable floor and
// scroll instead.
//
// The Director (Jake, 2026-10-18) decides what is on it: a box takes its
// task's name, a task switched off there shows faded, and a task added there
// gets a box in the rows below the map. Those boxes carry their own steps,
// which Jake writes or approves here; a draft is dashed and no agent runs on it.

const EDGE_COLOR = { main: "#1b1b1b", side: "#7d2233", alt: "#c7742b" } as const;
const ADDED = "task:";

// The Director's added tasks, as boxes in rows of five under the map.
function addedNodes(map: AgentSop, director: DirectorResponse | undefined): { nodes: SopNode[]; tasks: Map<string, DirectorTask> } {
  const tasks = new Map<string, DirectorTask>();
  const nodes: SopNode[] = [];
  const top = Math.max(...map.nodes.map((n) => n.r)) + 1.3;
  for (const { stage, tasks: list } of map.id === "fulfillment" ? [] : boardFor(map.id, director)) {
    for (const t of list) {
      if (t.nodeId) continue;
      const i = nodes.length;
      const id = ADDED + t.id;
      tasks.set(id, t);
      nodes.push({ id, c: i % 5, r: top + Math.floor(i / 5), k: ownerKind(t.owner), t: t.name, d: [stage.name] });
    }
  }
  return { nodes, tasks };
}

export default function AgentSopMap({
  map,
  director,
  initial,
  onOpenAgent,
}: {
  map: AgentSop;
  director?: DirectorResponse;
  // A box to open on arrival: a graph node id, or "task:<id>" for an added one.
  initial?: string | null;
  onOpenAgent: (id: SopMapId) => void;
}) {
  const [selected, setSelected] = useState<string | null>(initial ?? null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, left: 0 });

  useEffect(() => {
    if (initial) setSelected(initial);
  }, [initial]);

  const added = useMemo(() => addedNodes(map, director), [map, director]);
  const full = useMemo<AgentSop>(() => ({ ...map, nodes: [...map.nodes, ...added.nodes] }), [map, added]);
  const linked = useMemo(
    () => new Map((director?.tasks ?? []).filter((t) => t.agent === map.id && t.nodeId).map((t) => [t.nodeId!, t])),
    [director, map.id],
  );
  const stageName = (id: string) => director?.stages.find((s) => s.id === id)?.name ?? "";

  const size = useMemo(() => frameSize(full), [full]);
  const edges = useMemo(() => layoutEdges(map), [map]);
  const node = selected ? full.nodes.find((n) => n.id === selected) ?? null : null;
  const label = (n: SopNode) => linked.get(n.id)?.name ?? added.tasks.get(n.id)?.name ?? n.t;

  useLayoutEffect(() => {
    const wrap = wrapRef.current, stage = stageRef.current;
    if (!wrap || !stage) return;
    const measure = () => {
      const s = Math.min(1, wrap.clientWidth / stage.offsetWidth, wrap.clientHeight / stage.offsetHeight);
      const scale = window.innerWidth < 1024 ? Math.max(s, 0.5) : s;
      setFit({ scale, left: Math.max(0, (wrap.clientWidth - stage.offsetWidth * scale) / 2) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [full]);

  return (
    <div className="asop-body">
      <AgentSopStyle />
      <div className="asop-canvas" ref={wrapRef}>
        <div
          className="asop-stage"
          ref={stageRef}
          style={{ transform: `scale(${fit.scale})`, marginLeft: fit.left }}
        >
          <div className="asop-tag">{map.tag}</div>
          <div className="asop-frame" style={{ width: size.w, height: size.h }}>
            <h2>{map.title}</h2>
            <div className="asop-key">{SOP_KEY}</div>
            <svg className="asop-edges" width={size.w} height={size.h}>
              <defs>
                {Object.entries(EDGE_COLOR).map(([k, c]) => (
                  <marker key={k} id={`asop-ar-${k}`} viewBox="0 0 12 12" refX="10" refY="6" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
                    <path d="M2,1.5 L10,6 L2,10.5" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </marker>
                ))}
              </defs>
              {edges.map((e) => (
                <path key={e.key} className={`asop-edge ${e.kind}`} d={e.d} markerEnd={`url(#asop-ar-${e.kind})`} />
              ))}
              {edges.map(
                (e) =>
                  e.label && (
                    <text key={e.key} className={`asop-lbl ${e.kind}`} x={e.label.x} y={e.label.y} textAnchor="middle">
                      {e.label.text}
                    </text>
                  ),
              )}
            </svg>
            {full.nodes.map((n, i) => {
              const b = nodeBox(n);
              const K = KIND[n.k];
              const off = linked.get(n.id)?.removed;
              const draft = added.tasks.get(n.id)?.howStatus === "draft";
              return (
                <button
                  key={n.id}
                  type="button"
                  className={`asop-node${K.gate ? " gate" : ""}${selected === n.id ? " sel" : ""}${off ? " off" : ""}${draft ? " draft" : ""}`}
                  style={{ left: b.x, top: b.y, "--f": K.fill } as CSSProperties}
                  onClick={() => setSelected(n.id)}
                >
                  <div className="t">
                    <b>{i + 1}</b>
                    {label(n)}
                  </div>
                  {n.d && n.d.length > 0 && (
                    <div className="d">
                      {n.d.map((line, j) => (
                        <div key={j}>{line}</div>
                      ))}
                    </div>
                  )}
                  {(off || draft) && <span className="asop-flag">{off ? "Off" : "Draft"}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {node && (
        <aside className="asop-panel" style={{ "--f": KIND[node.k].fill } as CSSProperties}>
          <div className="asop-ph">
            <div>
              <span className="asop-chip">{KIND[node.k].label}</span>
              <h3>{label(node)}</h3>
            </div>
            <button type="button" className="asop-x" aria-label="Close" onClick={() => setSelected(null)}>
              <X size={16} />
            </button>
          </div>
          {added.tasks.has(node.id) ? (
            <AddedSteps key={node.id} task={added.tasks.get(node.id)!} agentName={map.name} stage={stageName(added.tasks.get(node.id)!.stageId)} />
          ) : (
            <>
              {linked.get(node.id) && <DirectorLine task={linked.get(node.id)!} agentName={map.name} stage={stageName(linked.get(node.id)!.stageId)} />}
              {node.steps && (
                <div className="asop-sec">
                  <h4>Steps</h4>
                  <ol>
                    {node.steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </div>
              )}
              {node.link && (
                <div className="asop-sec">
                  <button type="button" className="asop-btn" onClick={() => onOpenAgent(node.link!)}>
                    Open {AGENT_SOPS.find((a) => a.id === node.link)?.name} map
                  </button>
                </div>
              )}
              <Links title="Comes from" items={map.edges.filter((e) => e[1] === node.id).map((e) => ({ id: e[0] }))} map={map} />
              <Links title="Goes to" items={map.edges.filter((e) => e[0] === node.id).map((e) => ({ id: e[1], label: e[2] }))} map={map} />
            </>
          )}
        </aside>
      )}
    </div>
  );
}

// Where a graph box sits on the Director, and Undo for one switched off there.
function DirectorLine({ task, agentName, stage }: { task: DirectorTask; agentName: string; stage: string }) {
  const restore = useDirectorWrite(() => directorApi.patchTask(task.id, { restore: true }));
  return (
    <div className="asop-sec">
      <h4>Director</h4>
      <div className="asop-links">
        <div>
          {stage} <span className="asop-src">({ownerLabel(task.owner, agentName)})</span>
        </div>
      </div>
      {task.removed && (
        <button type="button" className="asop-btn asop-mt" disabled={restore.isPending} onClick={() => restore.mutate(undefined)}>
          Turn back on
        </button>
      )}
    </div>
  );
}

// An added task's steps: written here, approved here, then the agent runs them.
function AddedSteps({ task, agentName, stage }: { task: DirectorTask; agentName: string; stage: string }) {
  const [text, setText] = useState(howLines(task.how).map((l, i) => `${i + 1}. ${l}`).join("\n"));
  const save = useDirectorWrite((approve: boolean) => directorApi.patchTask(task.id, { how: text, approve }));
  const changed = text.trim() !== howLines(task.how).map((l, i) => `${i + 1}. ${l}`).join("\n").trim();
  return (
    <>
      <div className="asop-sec">
        <h4>Director</h4>
        <div className="asop-links">
          <div>
            {stage} <span className="asop-src">({ownerLabel(task.owner, agentName)})</span>
          </div>
        </div>
      </div>
      <div className="asop-sec">
        <h4>Steps {task.howStatus === "draft" ? <span className="asop-pill draft">Draft</span> : <span className="asop-pill ok">Approved</span>}</h4>
        <textarea className="asop-how" value={text} onChange={(e) => setText(e.target.value)} rows={8} maxLength={4000} aria-label="Steps" />
        {save.isError && <p className="asop-err">Not saved</p>}
        <div className="asop-acts">
          {(task.howStatus === "draft" || changed) && (
            <button type="button" className="asop-b1" disabled={save.isPending || !text.trim()} onClick={() => save.mutate(true)}>
              Approve
            </button>
          )}
          {changed && (
            <button type="button" className="asop-btn" disabled={save.isPending} onClick={() => save.mutate(false)}>
              Save as draft
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function Links({ title, items, map }: { title: string; items: { id: string; label?: string }[]; map: AgentSop }) {
  if (items.length === 0) return null;
  return (
    <div className="asop-sec">
      <h4>{title}</h4>
      <div className="asop-links">
        {items.map((it, i) => (
          <div key={i}>
            {map.nodes.find((n) => n.id === it.id)?.t}
            {it.label && <span className="asop-src"> ({it.label})</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function AgentSopStyle() {
  return (
    <style>{`
      .asop-body { flex: 1; display: flex; min-height: 0; border: 1px solid var(--border); border-radius: 14px; overflow: hidden; }
      .asop-canvas { flex: 1; min-width: 0; overflow: hidden; background-color: #efefec;
        background-image: radial-gradient(rgba(120,120,110,.28) 1px, transparent 1px); background-size: 14px 14px; }
      [data-theme="dark"] .asop-canvas { background-color: #1a1b22; }
      .asop-stage { position: relative; padding: 20px 28px 24px; width: max-content; transform-origin: 0 0; }
      .asop-tag { display: inline-block; font-size: 13px; font-weight: 600; color: #222; background: #dfe8c3; border-radius: 6px; padding: 3px 9px; margin-bottom: 8px; }
      .asop-frame { position: relative; background: #f8f8f5; border: 1px solid #e3e3dd; color: #1b1b1b; }
      .asop-frame h2 { position: absolute; left: 44px; top: 30px; margin: 0; font-family: var(--font-body); font-weight: 800; font-size: 23px; letter-spacing: -.01em; }
      .asop-key { position: absolute; left: 44px; top: 66px; font-size: 11.5px; color: #9a9a94; white-space: nowrap; }
      .asop-edges { position: absolute; inset: 0; pointer-events: none; overflow: visible; }
      .asop-edge { fill: none; stroke: #1b1b1b; stroke-width: 1.7; stroke-linejoin: round; }
      .asop-edge.side { stroke: #7d2233; stroke-dasharray: 6 5; }
      .asop-edge.alt { stroke: #c7742b; }
      .asop-lbl { font-family: var(--font-body); font-size: 10px; font-weight: 600; fill: #1b1b1b; paint-order: stroke; stroke: #f8f8f5; stroke-width: 7px; stroke-linejoin: round; }
      .asop-lbl.side { fill: #7d2233; }
      .asop-lbl.alt { fill: #c7742b; }
      .asop-node { position: absolute; width: 192px; height: 104px; border-radius: 52px; border: 1.6px solid #4b4b4b; background: var(--f); color: #1b1b1b;
        display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 8px 18px; cursor: pointer;
        font-family: var(--font-body); transition: transform .15s, box-shadow .15s; }
      .asop-node.gate { border: 2.6px solid #1f6b35; }
      .asop-node:hover { transform: translateY(-2px); box-shadow: 0 8px 18px rgba(0,0,0,.08); }
      .asop-node.sel { box-shadow: 0 0 0 4px color-mix(in srgb, var(--brand, #2f6fde) 35%, transparent); }
      .asop-node .t { font-size: 13.5px; font-weight: 700; line-height: 1.25; }
      .asop-node .t b { margin-right: 6px; }
      .asop-node .d { font-size: 9.5px; color: #3d3d3d; line-height: 1.45; margin-top: 3px; }
      .asop-panel { width: 360px; flex-shrink: 0; border-left: 1px solid var(--border); background: var(--surface); overflow-y: auto; padding: 20px; color: var(--text); }
      .asop-ph { display: flex; align-items: flex-start; gap: 10px; }
      .asop-ph h3 { font-family: var(--font-display); font-size: 17px; font-weight: 600; margin: 6px 0 0; line-height: 1.3; }
      .asop-x { margin-left: auto; width: 28px; height: 28px; border-radius: 8px; color: var(--text-faint); display: grid; place-items: center; }
      .asop-chip { display: inline-flex; font-size: 11.5px; font-weight: 600; padding: 3px 10px; border-radius: 999px; color: #1b1b1b; background: var(--f); border: 1px solid rgba(0,0,0,.15); }
      .asop-sec { margin-top: 20px; }
      .asop-sec h4 { font-size: 10.5px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--text-faint); margin: 0 0 8px; }
      .asop-sec ol { margin: 0; padding-left: 20px; font-size: 13px; line-height: 1.55; list-style: decimal; }
      .asop-sec li { margin-bottom: 5px; }
      .asop-links { display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
      .asop-links > div { padding: 8px 10px; border-radius: 9px; background: color-mix(in srgb, var(--text) 5%, var(--surface)); }
      .asop-src { font-size: 12px; color: var(--text-muted); }
      .asop-btn { padding: 7px 12px; border-radius: 9px; border: 1px solid var(--border); background: var(--surface); font-size: 12.5px; font-weight: 600; color: var(--text); }
      .asop-node.off { opacity: .4; border-style: dashed; }
      .asop-node.draft { border-style: dashed; border-width: 2px; }
      .asop-flag { position: absolute; top: -9px; right: 18px; font-size: 10px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; padding: 2px 8px; border-radius: 999px; background: #1b1b1b; color: #fff; }
      .asop-node.draft .asop-flag { background: #d97706; }
      .asop-mt { margin-top: 10px; }
      .asop-pill { margin-left: 6px; font-size: 10px; letter-spacing: .05em; padding: 2px 8px; border-radius: 999px; }
      .asop-pill.draft { color: #d97706; background: color-mix(in srgb, #d97706 14%, transparent); }
      .asop-pill.ok { color: var(--positive, #16a34a); background: color-mix(in srgb, var(--positive, #16a34a) 12%, transparent); }
      .asop-how { width: 100%; border: 1px solid var(--border); background: var(--surface); color: var(--text); border-radius: 10px; padding: 10px 12px; font-size: 13px; line-height: 1.55; resize: vertical; outline: none; }
      .asop-how:focus { border-color: color-mix(in srgb, var(--brand) 55%, var(--border)); }
      .asop-acts { display: flex; gap: 8px; margin-top: 10px; }
      .asop-b1 { padding: 7px 14px; border-radius: 9px; font-size: 12.5px; font-weight: 600; color: #fff; background-image: var(--grad-brand); }
      .asop-b1:disabled, .asop-btn:disabled { opacity: .55; }
      .asop-err { font-size: 12px; font-weight: 600; color: #dc2626; margin: 6px 0 0; }
      @media (max-width: 1023px) {
        .asop-body { height: 72vh; flex: none; }
        .asop-canvas { overflow: auto; }
        .asop-stage { padding: 16px; }
        .asop-panel { position: fixed; inset: auto 0 calc(62px + env(safe-area-inset-bottom, 0px)) 0; width: auto; max-height: 60vh; z-index: 30;
          border-left: 0; border-top: 1px solid var(--border); box-shadow: 0 -6px 18px rgba(0,0,0,.12); }
      }
    `}</style>
  );
}
