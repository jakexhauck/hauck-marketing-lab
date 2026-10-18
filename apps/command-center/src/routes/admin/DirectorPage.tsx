import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { NavLink, Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUp as Send, Check, Loader2, Mic, Plus, Trash2, Workflow, X } from "lucide-react";
import { AGENT_SOPS } from "../../lib/agentSops";
import { isAgentId, type AgentId } from "../../lib/agents";
import { boardFor, OWNERS, ownerLabel, type Column, type DirectorTask, type SopOwner } from "../../lib/director";
import { directorApi, useDirector, useDirectorWrite, type Suggestion } from "../../components/admin/director/directorApi";

// /admin/director/:agent (Jake, 2026-10-18; docs/build-plans/director.md).
// The WHAT of each agent's SOP: stages left to right with Jake's approval
// between them, tasks with who owns them. The HOW stays on the SOPs graph; a
// card's Steps button opens its box there. Jake directs by editing cards or by
// telling the agent in a sentence (typed or spoken), which comes back as a New
// card to Add or Drop.

const OWNER_COLOR: Record<SopOwner, string> = { agent: "#3b82f6", jake: "#8b5cf6", client: "#f97316" };
const shortName = (agent: AgentId) => AGENT_SOPS.find((a) => a.id === agent)?.name ?? agent;

export default function DirectorPage() {
  const { agent } = useParams();
  if (!isAgentId(agent)) return <Navigate to="/admin/director/manager" replace />;
  return <Director key={agent} agent={agent} />;
}

function Director({ agent }: { agent: AgentId }) {
  const director = useDirector();
  const columns = boardFor(agent, director.data);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const name = shortName(agent);

  return (
    <div className="dir flex min-h-0 flex-1 flex-col gap-3 px-4 py-4 lg:px-6 lg:py-5">
      <DirectorStyle />
      <nav className="flex gap-1.5 overflow-x-auto" aria-label="Agents">
        {AGENT_SOPS.map((a) => (
          <NavLink
            key={a.id}
            to={`/admin/director/${a.id}`}
            className={({ isActive }) =>
              [
                "flex shrink-0 items-center whitespace-nowrap rounded-full border px-3.5 py-2 text-[13.5px] font-medium transition-colors",
                isActive
                  ? "border-transparent text-white shadow-[var(--shadow-brand)]"
                  : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]",
              ].join(" ")
            }
            style={({ isActive }) => (isActive ? { backgroundImage: "var(--grad-brand)" } : undefined)}
          >
            {a.name}
          </NavLink>
        ))}
      </nav>

      <TellBar agent={agent} name={name} disabled={!columns.length} onSuggestion={setSuggestion} />

      {director.isLoading ? (
        <p className="dir-note">Loading...</p>
      ) : director.isError ? (
        <p className="dir-note">The board did not load.</p>
      ) : (
        <div className="dir-cols">
          {columns.map((col, i) => (
            <ColumnView
              key={col.stage.id}
              agent={agent}
              name={name}
              col={col}
              index={i}
              columns={columns}
              hasOff={!!director.data?.tasks.some((t) => t.stageId === col.stage.id && t.removed)}
              suggestion={suggestion?.stageId === col.stage.id ? suggestion : null}
              onSuggestionDone={() => setSuggestion(null)}
            />
          ))}
          <AddStage agent={agent} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tell bar
// ---------------------------------------------------------------------------

type Recognition = {
  lang: string;
  interimResults: boolean;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
};

function speechCtor(): (new () => Recognition) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function TellBar({
  agent,
  name,
  disabled,
  onSuggestion,
}: {
  agent: AgentId;
  name: string;
  disabled: boolean;
  onSuggestion: (s: Suggestion) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const Speech = speechCtor();

  useEffect(() => () => rec.current?.stop(), []);

  const listen = () => {
    if (!Speech) return;
    if (listening) {
      rec.current?.stop();
      return;
    }
    const r = new Speech();
    r.lang = "en-US";
    r.interimResults = true;
    const before = text ? `${text} ` : "";
    r.onresult = (e) => setText(before + Array.from(e.results, (res) => res[0].transcript).join(""));
    r.onend = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    rec.current?.stop();
    setBusy(true);
    setError(null);
    try {
      const { suggestion } = await directorApi.suggest(agent, t);
      onSuggestion(suggestion);
      setText("");
    } catch (err) {
      setError((err as Error).message || "Not sent");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="dir-tell" onSubmit={submit}>
      <span className="dir-tell-who">
        <span className="dir-dot" style={{ "--w": OWNER_COLOR.agent } as CSSProperties} />
        {name} Agent
      </span>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`Tell the ${name} Agent what to do`}
        aria-label={`Tell the ${name} Agent what to do`}
        disabled={disabled || busy}
        maxLength={1000}
      />
      {error && <span className="dir-err">{error}</span>}
      {Speech && (
        <button type="button" className={`dir-iconbtn${listening ? " on" : ""}`} onClick={listen} aria-label="Speak" disabled={disabled || busy}>
          <Mic size={17} />
        </button>
      )}
      <button type="submit" className="dir-send" aria-label="Send" disabled={disabled || busy || !text.trim()}>
        {busy ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

function ColumnView({
  agent,
  name,
  col,
  index,
  columns,
  hasOff,
  suggestion,
  onSuggestionDone,
}: {
  agent: AgentId;
  name: string;
  col: Column;
  index: number;
  columns: Column[];
  // Tasks switched off still belong to the stage (their graph boxes show Off),
  // so the stage cannot be deleted from under them.
  hasOff: boolean;
  suggestion: Suggestion | null;
  onSuggestionDone: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const rename = useDirectorWrite((v: string) => directorApi.patchStage(col.stage.id, { name: v }));
  const remove = useDirectorWrite(() => directorApi.removeStage(col.stage.id));

  return (
    <>
      {index > 0 && (
        <div className="dir-arrow" aria-label="You approve">
          <span className="dir-ok">
            <Check size={12} strokeWidth={3} />
            You
          </span>
          <ArrowRight size={20} />
        </div>
      )}
      <section className="dir-col">
        <header className="dir-col-h">
          <span className="dir-n">{index + 1}</span>
          {renaming ? (
            <InlineName
              initial={col.stage.name}
              max={80}
              onSave={(v) => rename.mutate(v, { onSuccess: () => setRenaming(false) })}
              onCancel={() => setRenaming(false)}
            />
          ) : (
            <button type="button" className="dir-col-t" onClick={() => setRenaming(true)}>
              {col.stage.name}
            </button>
          )}
          {col.tasks.length === 0 && !hasOff && !renaming && (
            <button type="button" className="dir-x" aria-label="Delete stage" onClick={() => remove.mutate(undefined)}>
              <Trash2 size={15} />
            </button>
          )}
        </header>

        {col.tasks.map((t, ti) =>
          editing === t.id ? (
            <TaskEditor
              key={t.id}
              agent={agent}
              name={name}
              task={t}
              col={col}
              taskIndex={ti}
              colIndex={index}
              columns={columns}
              onClose={() => setEditing(null)}
            />
          ) : (
            <button key={t.id} type="button" className="dir-card" onClick={() => setEditing(t.id)}>
              <span className="dir-card-nm">{t.name}</span>
              <span className="dir-card-foot">
                <Owner owner={t.owner} name={name} />
                {!t.nodeId && t.howStatus === "draft" && <span className="dir-draft">Draft</span>}
              </span>
            </button>
          ),
        )}

        {suggestion && <NewCard name={name} suggestion={suggestion} onDone={onSuggestionDone} />}
        <AddTask stageId={col.stage.id} name={name} />
      </section>
    </>
  );
}

function Owner({ owner, name }: { owner: SopOwner; name: string }) {
  return (
    <span className="dir-who">
      <span className="dir-dot" style={{ "--w": OWNER_COLOR[owner] } as CSSProperties} />
      {ownerLabel(owner, name)}
    </span>
  );
}

function OwnerPick({ value, onChange, name }: { value: SopOwner; onChange: (o: SopOwner) => void; name: string }) {
  return (
    <div className="dir-whos" role="radiogroup" aria-label="Who does it">
      {OWNERS.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          className={value === o ? "on" : ""}
          style={{ "--w": OWNER_COLOR[o] } as CSSProperties}
          onClick={() => onChange(o)}
        >
          {o === "agent" ? "Agent" : ownerLabel(o, name)}
        </button>
      ))}
    </div>
  );
}

function TaskEditor({
  agent,
  name,
  task,
  col,
  taskIndex,
  colIndex,
  columns,
  onClose,
}: {
  agent: AgentId;
  name: string;
  task: DirectorTask;
  col: Column;
  taskIndex: number;
  colIndex: number;
  columns: Column[];
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [title, setTitle] = useState(task.name);
  const [owner, setOwner] = useState<SopOwner>(task.owner);
  const save = useDirectorWrite((b: { name: string; owner: SopOwner }) => directorApi.patchTask(task.id, b));
  const move = useDirectorWrite((b: { stageId: string; index: number }) => directorApi.patchTask(task.id, b));
  const remove = useDirectorWrite(() => directorApi.removeTask(task.id));
  const busy = save.isPending || move.isPending || remove.isPending;
  const failed = save.isError || move.isError || remove.isError;

  const prev = columns[colIndex - 1];
  const next = columns[colIndex + 1];
  const steps = task.nodeId ? `node=${encodeURIComponent(task.nodeId)}` : `task=${task.id}`;

  return (
    <form
      className="dir-card editing"
      onSubmit={(e) => {
        e.preventDefault();
        const t = title.trim();
        if (!t) return;
        save.mutate({ name: t, owner }, { onSuccess: onClose });
      }}
    >
      <input className="dir-fld dir-fld-nm" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} autoFocus aria-label="Task" />
      <OwnerPick value={owner} onChange={setOwner} name={name} />
      <div className="dir-moves">
        <button type="button" aria-label="Move to the stage before" disabled={!prev || busy} onClick={() => prev && move.mutate({ stageId: prev.stage.id, index: prev.tasks.length })}>
          <ArrowLeft size={15} />
        </button>
        <button type="button" aria-label="Move up" disabled={taskIndex === 0 || busy} onClick={() => move.mutate({ stageId: col.stage.id, index: taskIndex - 1 })}>
          <ArrowUp size={15} />
        </button>
        <button type="button" aria-label="Move down" disabled={taskIndex === col.tasks.length - 1 || busy} onClick={() => move.mutate({ stageId: col.stage.id, index: taskIndex + 1 })}>
          <ArrowDown size={15} />
        </button>
        <button type="button" aria-label="Move to the next stage" disabled={!next || busy} onClick={() => next && move.mutate({ stageId: next.stage.id, index: next.tasks.length })}>
          <ArrowRight size={15} />
        </button>
        <button type="button" className="dir-steps" onClick={() => navigate(`/admin/sops/${agent}?${steps}`)}>
          <Workflow size={14} />
          Steps
        </button>
      </div>
      {failed && <span className="dir-err">Not saved</span>}
      <div className="dir-acts">
        <button type="submit" className="dir-b1" disabled={busy || !title.trim()}>
          Save
        </button>
        <button type="button" className="dir-b2" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="dir-del" aria-label="Delete task" disabled={busy} onClick={() => remove.mutate(undefined, { onSuccess: onClose })}>
          <Trash2 size={15} />
        </button>
      </div>
    </form>
  );
}

function NewCard({ name, suggestion, onDone }: { name: string; suggestion: Suggestion; onDone: () => void }) {
  const [title, setTitle] = useState(suggestion.name);
  const [owner, setOwner] = useState<SopOwner>(suggestion.owner);
  const add = useDirectorWrite(() =>
    directorApi.addTask({ stageId: suggestion.stageId, name: title.trim(), owner, steps: suggestion.steps }),
  );
  return (
    <div className="dir-card new">
      <span className="dir-newtag">New</span>
      <input className="dir-fld dir-fld-nm" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} aria-label="Task" />
      <OwnerPick value={owner} onChange={setOwner} name={name} />
      {add.isError && <span className="dir-err">Not added</span>}
      <div className="dir-acts">
        <button type="button" className="dir-b1" disabled={add.isPending || !title.trim()} onClick={() => add.mutate(undefined, { onSuccess: onDone })}>
          {add.isPending ? "Adding..." : "Add"}
        </button>
        <button type="button" className="dir-b2" onClick={onDone}>
          Drop
        </button>
      </div>
    </div>
  );
}

function AddTask({ stageId, name }: { stageId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState<SopOwner>("agent");
  const add = useDirectorWrite((b: { name: string; owner: SopOwner }) => directorApi.addTask({ stageId, ...b }));

  if (!open) {
    return (
      <button type="button" className="dir-add" onClick={() => setOpen(true)}>
        <Plus size={15} />
        Add task
      </button>
    );
  }
  return (
    <form
      className="dir-card editing"
      onSubmit={(e) => {
        e.preventDefault();
        const t = title.trim();
        if (!t) return;
        add.mutate(
          { name: t, owner },
          {
            onSuccess: () => {
              setTitle("");
              setOpen(false);
            },
          },
        );
      }}
    >
      <input className="dir-fld dir-fld-nm" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} autoFocus aria-label="Task" disabled={add.isPending} />
      <OwnerPick value={owner} onChange={setOwner} name={name} />
      {add.isError && <span className="dir-err">Not added</span>}
      <div className="dir-acts">
        <button type="submit" className="dir-b1" disabled={add.isPending || !title.trim()}>
          {add.isPending ? "Writing steps..." : "Add"}
        </button>
        <button type="button" className="dir-b2" onClick={() => setOpen(false)} disabled={add.isPending}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function AddStage({ agent }: { agent: AgentId }) {
  const [open, setOpen] = useState(false);
  const add = useDirectorWrite((v: string) => directorApi.addStage(agent, v));
  return (
    <div className="dir-col dir-col-add">
      {open ? (
        <div className="dir-col-h">
          <InlineName initial="" max={80} onSave={(v) => add.mutate(v, { onSuccess: () => setOpen(false) })} onCancel={() => setOpen(false)} />
        </div>
      ) : (
        <button type="button" className="dir-add" onClick={() => setOpen(true)}>
          <Plus size={15} />
          Stage
        </button>
      )}
    </div>
  );
}

function InlineName({ initial, max, onSave, onCancel }: { initial: string; max: number; onSave: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial);
  return (
    <form
      className="dir-inline"
      onSubmit={(e) => {
        e.preventDefault();
        if (v.trim()) onSave(v.trim());
      }}
    >
      <input
        className="dir-fld"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
        maxLength={max}
        autoFocus
        aria-label="Stage"
      />
      <button type="submit" className="dir-iconbtn" aria-label="Save">
        <Check size={15} />
      </button>
      <button type="button" className="dir-iconbtn" aria-label="Cancel" onClick={onCancel}>
        <X size={15} />
      </button>
    </form>
  );
}

function DirectorStyle() {
  return (
    <style>{`
      .dir-note { font-size: 13.5px; color: var(--text-muted); }
      .dir-tell { display: flex; align-items: center; gap: 10px; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; box-shadow: var(--shadow-md, 0 6px 18px rgba(40,42,70,.07)); padding: 8px 8px 8px 12px; }
      .dir-tell input { flex: 1; min-width: 0; border: 0; outline: none; background: transparent; font-size: 15px; padding: 8px 0; color: var(--text); }
      .dir-tell-who { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--brand-text, var(--text)); background: var(--brand-tint, var(--surface-2)); border-radius: 999px; padding: 4px 10px; white-space: nowrap; }
      .dir-iconbtn { width: 38px; height: 38px; flex-shrink: 0; border-radius: 11px; display: grid; place-items: center; color: var(--text-muted); border: 1px solid var(--border); background: var(--surface); }
      .dir-iconbtn.on { color: #fff; background: #dc2626; border-color: transparent; }
      .dir-inline .dir-iconbtn { width: 32px; height: 32px; border-radius: 9px; }
      .dir-send { width: 38px; height: 38px; flex-shrink: 0; border-radius: 11px; display: grid; place-items: center; color: #fff; background-image: var(--grad-brand); }
      .dir-send:disabled, .dir-iconbtn:disabled { opacity: .45; }
      .dir-err { font-size: 12.5px; font-weight: 600; color: #dc2626; }
      .dir-cols { flex: 1; min-height: 0; display: flex; gap: 10px; align-items: flex-start; overflow-x: auto; padding-bottom: 8px; }
      .dir-col { flex: 1; min-width: 230px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 16px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
      .dir-col-add { flex: 0 0 auto; min-width: 150px; background: transparent; border: 0; padding: 0; }
      .dir-col-h { display: flex; align-items: center; gap: 10px; padding: 4px 4px 8px; min-height: 40px; }
      .dir-n { width: 26px; height: 26px; flex-shrink: 0; border-radius: 8px; display: grid; place-items: center; font-family: var(--font-display); font-weight: 700; font-size: 12.5px; color: #fff; background-image: var(--grad-brand); }
      .dir-col-t { flex: 1; text-align: left; font-family: var(--font-display); font-size: 15.5px; font-weight: 600; line-height: 1.25; color: var(--text); }
      .dir-x { margin-left: auto; width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; color: var(--text-faint); }
      .dir-x:hover { color: #dc2626; }
      .dir-inline { flex: 1; display: flex; gap: 6px; align-items: center; }
      .dir-inline .dir-fld { padding: 6px 9px; font-weight: 600; }
      .dir-arrow { align-self: flex-start; display: flex; flex-direction: column; align-items: center; gap: 6px; color: var(--text-faint); padding-top: 22px; flex-shrink: 0; }
      .dir-ok { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600; color: var(--positive, #16a34a); background: color-mix(in srgb, var(--positive, #16a34a) 10%, transparent); border-radius: 999px; padding: 3px 7px; }
      .dir-card { text-align: left; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow-sm); padding: 12px 13px; display: flex; flex-direction: column; gap: 8px; color: var(--text); transition: border-color .15s, box-shadow .15s; }
      button.dir-card:hover { border-color: color-mix(in srgb, var(--brand) 35%, var(--border)); }
      .dir-card.editing, .dir-card.new { gap: 10px; border-color: color-mix(in srgb, var(--brand) 50%, var(--border)); box-shadow: 0 0 0 3px var(--brand-tint, rgba(79,70,229,.1)); }
      .dir-card.new { border-style: dashed; background: color-mix(in srgb, var(--brand) 4%, var(--surface)); }
      .dir-card-nm { font-size: 14px; font-weight: 600; line-height: 1.35; }
      .dir-card-foot { display: flex; align-items: center; gap: 8px; }
      .dir-who { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; color: var(--text-muted); white-space: nowrap; }
      .dir-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--w); flex-shrink: 0; }
      .dir-draft, .dir-newtag { font-size: 10.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; border-radius: 999px; padding: 2px 8px; }
      .dir-draft { margin-left: auto; color: #d97706; background: color-mix(in srgb, #d97706 14%, transparent); }
      .dir-newtag { align-self: flex-start; color: var(--brand-text, var(--brand)); background: var(--brand-tint, rgba(79,70,229,.1)); }
      .dir-fld { width: 100%; border: 1px solid var(--border); background: var(--surface); color: var(--text); border-radius: 10px; padding: 8px 10px; font-size: 13.5px; outline: none; }
      .dir-fld:focus { border-color: color-mix(in srgb, var(--brand) 55%, var(--border)); box-shadow: 0 0 0 3px var(--brand-tint, rgba(79,70,229,.1)); }
      .dir-fld-nm { font-weight: 600; }
      .dir-whos { display: flex; gap: 6px; }
      .dir-whos button { flex: 1; padding: 6px 4px; border-radius: 9px; border: 1px solid var(--border); font-size: 12px; font-weight: 600; color: var(--text-muted); background: var(--surface); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .dir-whos button.on { border-color: transparent; color: #fff; background: var(--w); }
      .dir-moves { display: flex; gap: 4px; align-items: center; }
      .dir-moves button { height: 30px; min-width: 30px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--text-muted); display: inline-grid; place-items: center; }
      .dir-moves button:disabled { opacity: .35; }
      .dir-moves .dir-steps { margin-left: auto; display: inline-flex; align-items: center; gap: 5px; padding: 0 10px; font-size: 12.5px; font-weight: 600; color: var(--text); }
      .dir-acts { display: flex; gap: 8px; align-items: center; }
      .dir-b1 { padding: 7px 14px; border-radius: 10px; font-size: 13px; font-weight: 600; color: #fff; background-image: var(--grad-brand); box-shadow: var(--shadow-brand); }
      .dir-b1:disabled { opacity: .55; }
      .dir-b2 { padding: 7px 12px; border-radius: 10px; font-size: 13px; font-weight: 600; border: 1px solid var(--border); background: var(--surface); color: var(--text); }
      .dir-del { margin-left: auto; width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center; color: #dc2626; }
      .dir-add { display: flex; align-items: center; gap: 6px; padding: 9px 10px; border-radius: 10px; font-size: 13px; font-weight: 600; color: var(--text-muted); border: 1.5px dashed var(--border-strong, var(--border)); background: transparent; width: 100%; }
      .dir-add:hover { color: var(--text); }
      @media (max-width: 1023px) {
        .dir-tell-who { display: none; }
        .dir-col { min-width: 250px; }
      }
    `}</style>
  );
}
