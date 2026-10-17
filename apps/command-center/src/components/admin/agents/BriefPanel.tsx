import { useEffect, useMemo, useReducer, useRef, useState, type CSSProperties } from "react";
import { Check, CloudAlert, CloudCheck, CloudUpload, ExternalLink, Gauge, Pencil } from "lucide-react";
import type { AgentId } from "../../../lib/agents";
import type { BriefDrive, BriefSection } from "../../../lib/agentWire";
import { briefDraft, initDraft, needsSave } from "../../../lib/briefDraft";
import { AGENT_COLORS } from "../../../lib/brainGraph";
import { driveChip, fullBrief, sectionLabel, whoEdited } from "../../../lib/clientBrief";
import { AGENT_ICONS } from "../clientRowIcons";
import { Markdown } from "./ChatThread";
import { useClientBrief, useSaveBriefSection } from "./agentApi";

// The Client Brief (docs/build-plans/agents.md, Phase 6), drawn two ways from
// the same pieces: beside the chat on every client agent page (BriefTab), and
// as the client's Brief page with Google Docs style tabs (BriefPage). Both
// read one cached query, so an edit in either shows in the other.
//
// Built to layout B of .superpowers/brainstorm/559-1792256193/content/
// agents-brief.html: a card per section, the current agent's highlighted, who
// last edited it, pencil to edit, and the Saved to Drive chip.

// How long typing must pause before a section saves itself.
const AUTOSAVE_MS = 1_000;

export function useBrief(tenantId: string) {
  const q = useClientBrief(tenantId);
  const sections = useMemo(() => fullBrief(q.data?.sections ?? []), [q.data]);
  return { q, sections, drive: q.data?.drive ?? null };
}

export function DriveChip({ drive, sections }: { drive: BriefDrive | null; sections: BriefSection[] }) {
  const chip = driveChip(drive, sections, new Date());
  const Icon = chip.tone === "bad" ? CloudAlert : chip.tone === "busy" ? CloudUpload : CloudCheck;
  return (
    <span className={`brf-drive ${chip.tone}`} title={chip.title ?? undefined}>
      <Icon />
      {chip.label}
    </span>
  );
}

function OpenDoc({ drive }: { drive: BriefDrive | null }) {
  if (!drive?.docUrl) return null;
  return (
    <a
      className="brf-iconbtn"
      href={drive.docUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Open in Google Docs"
      title="Open in Google Docs"
    >
      <ExternalLink />
    </a>
  );
}

export function SectionCard({
  tenantId,
  section,
  mine = false,
  large = false,
}: {
  tenantId: string;
  section: BriefSection;
  mine?: boolean;
  large?: boolean;
}) {
  const save = useSaveBriefSection(tenantId);
  const [state, dispatch] = useReducer(briefDraft, section, initDraft);
  const [editing, setEditing] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);

  // A newer copy from the poll (an agent wrote, or the other view saved).
  useEffect(() => {
    dispatch({ t: "server", section });
  }, [section]);

  const run = async () => {
    if (!needsSave(state)) return;
    dispatch({ t: "saving" });
    try {
      const res = await save(section.section, state.draft, state.base.version);
      if ("saved" in res) {
        dispatch({ t: "saved", section: res.saved });
        setSavedOnce(true);
      } else {
        dispatch({ t: "stale", section: res.stale });
      }
    } catch (e) {
      dispatch({ t: "failed", error: e instanceof Error ? e.message : "Not saved" });
    }
  };
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    if (!needsSave(state)) return;
    const t = setTimeout(() => void runRef.current(), AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [state]);

  // Leaving the page with text still waiting on the debounce saves it now.
  useEffect(() => () => void runRef.current(), []);

  const open = editing || !!state.conflict;
  const toggle = () => {
    if (open) void run();
    setEditing(!open);
  };

  const Icon = AGENT_ICONS[section.section] ?? Gauge;
  const who = whoEdited(state.base, new Date());
  const status = state.saving
    ? "Saving"
    : state.error
      ? `Not saved: ${state.error}`
      : needsSave(state)
        ? "Editing"
        : savedOnce
          ? "Saved"
          : "";

  return (
    <div className={`brf-sec${mine ? " mine" : ""}${large ? " large" : ""}`}>
      <div className="brf-sec-top">
        <span className="brf-sec-ic" style={{ background: AGENT_COLORS[section.section] }}>
          <Icon />
        </span>
        <span className="brf-sec-t">{sectionLabel(section.section)}</span>
        {who && <span className={`brf-who${state.base.updatedBy === "jake" ? " you" : ""}`}>{who}</span>}
        <button
          type="button"
          className="brf-pen"
          onClick={toggle}
          aria-label={open ? "Done" : "Edit"}
          title={open ? "Done" : "Edit"}
        >
          {open ? <Check /> : <Pencil />}
        </button>
      </div>

      {state.conflict && (
        <div className="brf-conflict" role="alert">
          <div className="brf-conflict-t">
            {whoEdited(state.conflict.theirs, new Date()).split(",")[0] || "Someone"} saved a newer version
          </div>
          <div className="brf-mine">{state.conflict.mine}</div>
          <div className="brf-actions">
            <button type="button" className="brf-b1" onClick={() => dispatch({ t: "reapply" })}>
              Use mine
            </button>
            <button type="button" className="brf-b2" onClick={() => dispatch({ t: "discard" })}>
              Keep theirs
            </button>
          </div>
        </div>
      )}

      {open ? (
        <>
          <textarea
            value={state.draft}
            onChange={(e) => dispatch({ t: "edit", text: e.target.value })}
            aria-label={`${sectionLabel(section.section)} section`}
            spellCheck
          />
          {status && <div className={`brf-saved${state.error ? " bad" : ""}`}>{status}</div>}
          {state.draft.trim() && (
            <div className="brf-preview">
              <div className="brf-cap">Preview</div>
              <Markdown text={state.draft} />
            </div>
          )}
        </>
      ) : state.draft.trim() ? (
        <div className="brf-body">
          <Markdown text={state.draft} />
        </div>
      ) : (
        <div className="brf-empty">Empty</div>
      )}
      {!open && status && status !== "Saved" && <div className={`brf-saved${state.error ? " bad" : ""}`}>{status}</div>}
    </div>
  );
}

// The Brief tab beside the chat on a client agent page.
export function BriefTab({ tenantId, agent }: { tenantId: string; agent: AgentId }) {
  const { q, sections, drive } = useBrief(tenantId);
  const mineRef = useRef<HTMLDivElement>(null);
  const loaded = !!q.data;
  useEffect(() => {
    if (loaded) mineRef.current?.scrollIntoView({ block: "nearest" });
  }, [loaded]);

  if (q.isLoading) return <div className="brf-note">Loading...</div>;
  if (q.isLoadingError) return <div className="brf-note">Brief did not load.</div>;
  return (
    <div className="brf brf-list">
      <BriefStyle />
      <div className="brf-head">
        <DriveChip drive={drive} sections={sections} />
        <span className="brf-grow" />
        <OpenDoc drive={drive} />
      </div>
      {sections.map((s) => (
        <div key={s.section} ref={s.section === agent ? mineRef : undefined}>
          <SectionCard tenantId={tenantId} section={s} mine={s.section === agent} />
        </div>
      ))}
    </div>
  );
}

type TabId = "all" | AgentId;

// The client's Brief page: Google Docs style, a tab list on the left with All
// and one tab per section, the chosen tab on the right.
export function BriefPage({ tenantId, brandColor }: { tenantId: string; brandColor?: string }) {
  const { q, sections, drive } = useBrief(tenantId);
  const [tab, setTab] = useState<TabId>("all");
  const style = brandColor ? ({ "--brand": brandColor } as CSSProperties) : undefined;

  return (
    <div className="brf brf-page" style={style}>
      <BriefStyle />
      <div className="brf-page-head">
        <h2 className="brf-title">Brief</h2>
        {q.data && <DriveChip drive={drive} sections={sections} />}
        <span className="brf-grow" />
        <OpenDoc drive={drive} />
      </div>
      {q.isLoading ? (
        <div className="brf-note">Loading...</div>
      ) : q.isLoadingError ? (
        <div className="brf-note">Brief did not load.</div>
      ) : (
        <div className="brf-docs">
          <nav className="brf-tabs" aria-label="Brief sections">
            <button
              type="button"
              className={`brf-tab${tab === "all" ? " on" : ""}`}
              onClick={() => setTab("all")}
              aria-current={tab === "all" ? "true" : undefined}
            >
              All
            </button>
            {sections.map((s) => {
              const Icon = AGENT_ICONS[s.section] ?? Gauge;
              return (
                <button
                  key={s.section}
                  type="button"
                  className={`brf-tab${tab === s.section ? " on" : ""}`}
                  onClick={() => setTab(s.section)}
                  aria-current={tab === s.section ? "true" : undefined}
                >
                  <Icon />
                  <span className="t">{sectionLabel(s.section)}</span>
                  {!s.body.trim() && <span className="brf-dot" aria-label="empty" />}
                </button>
              );
            })}
          </nav>
          <div className="brf-main">
            {tab === "all"
              ? sections.map((s) => <SectionCard key={s.section} tenantId={tenantId} section={s} />)
              : sections
                  .filter((s) => s.section === tab)
                  .map((s) => <SectionCard key={s.section} tenantId={tenantId} section={s} large />)}
          </div>
        </div>
      )}
    </div>
  );
}

// Scoped to .brf, on the admin tokens. The brand family is rebuilt from
// --brand here as on the agent page (AgentStyle), so the client's colour
// carries through on the Brief page too, where .ag is not around it.
function BriefStyle() {
  return (
    <style>{`
      .brf {
        --brand-2: color-mix(in srgb, var(--brand) 72%, white);
        --grad-brand: linear-gradient(135deg, var(--brand) 0%, var(--brand-2) 100%);
        --brand-tint: color-mix(in srgb, var(--brand) 10%, transparent);
        --brand-text: color-mix(in srgb, var(--brand) 88%, black);
        color: var(--text); font-family: var(--font-body);
      }
      [data-theme="dark"] .brf {
        --brand-tint: color-mix(in srgb, var(--brand) 18%, transparent);
        --brand-text: color-mix(in srgb, var(--brand) 70%, white);
      }
      .brf *, .brf *::before, .brf *::after { box-sizing: border-box; }
      .brf button { font: inherit; cursor: pointer; border: 0; background: none; color: inherit; }
      .brf svg { flex-shrink: 0; }
      .brf-note { padding: 16px 8px; font-size: 13px; color: var(--text-faint); text-align: center; }
      .brf-grow { flex: 1; }
      .brf-list { display: flex; flex-direction: column; gap: 12px; }
      .brf-head { display: flex; align-items: center; gap: 8px; }
      .brf-drive { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; border-radius: 999px; padding: 3px 10px; white-space: nowrap; }
      .brf-drive svg { width: 13px; height: 13px; }
      .brf-drive.ok { color: var(--positive); background: color-mix(in srgb, var(--positive) 10%, transparent); }
      .brf-drive.busy { color: var(--brand-text); background: var(--brand-tint); }
      .brf-drive.bad { color: var(--danger); background: color-mix(in srgb, var(--danger) 10%, transparent); }
      .brf-drive.none { color: var(--text-faint); background: var(--surface-2); }
      .brf-iconbtn { width: 34px; height: 34px; border-radius: 50%; border: 1px solid var(--border); background: color-mix(in srgb, var(--surface) 72%, transparent); display: grid; place-items: center; color: var(--text-muted); flex-shrink: 0; }
      .brf-iconbtn:hover { color: var(--text); }
      .brf-iconbtn svg { width: 16px; height: 16px; }

      .brf-sec { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); padding: 14px 16px; }
      .brf-sec.mine { border-color: color-mix(in srgb, var(--brand) 45%, var(--border)); box-shadow: 0 0 0 3px var(--brand-tint); }
      .brf-sec-top { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
      .brf-sec-ic { width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center; color: #fff; flex-shrink: 0; }
      .brf-sec-ic svg { width: 14px; height: 14px; }
      .brf-sec-t { font-family: var(--font-display); font-weight: 600; font-size: 14px; margin-right: auto; }
      .brf-sec.large .brf-sec-t { font-size: 17px; }
      .brf-who { font-size: 11.5px; color: var(--text-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
      .brf-who.you { color: var(--brand-text); font-weight: 600; }
      .brf .brf-pen { color: var(--text-faint); padding: 4px; border-radius: 6px; margin-left: 2px; }
      .brf .brf-pen:hover { color: var(--text); background: var(--surface-2); }
      .brf-pen svg { width: 14px; height: 14px; display: block; }
      .brf-body, .brf-preview { font-size: 13.5px; line-height: 1.55; }
      .brf-sec.large .brf-body { font-size: 14.5px; line-height: 1.65; }
      .brf-empty { font-size: 13px; color: var(--text-faint); }
      .brf textarea { display: block; width: 100%; min-height: 130px; resize: vertical; font: 13.5px/1.55 var(--font-body); color: var(--text); background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px; padding: 10px; outline: 0; }
      .brf-sec.large textarea { min-height: 320px; font-size: 14px; }
      .brf textarea:focus { border-color: color-mix(in srgb, var(--brand) 45%, var(--border)); }
      .brf-saved { font-size: 11.5px; color: var(--text-faint); margin-top: 6px; }
      .brf-saved.bad { color: var(--danger); }
      .brf-preview { margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--border); }
      .brf-cap { font-size: 11px; font-weight: 600; color: var(--text-faint); text-transform: uppercase; letter-spacing: .04em; margin-bottom: 4px; }
      .brf-conflict { margin-bottom: 10px; border: 1px solid color-mix(in srgb, var(--warning) 40%, var(--border)); background: color-mix(in srgb, var(--warning) 7%, var(--surface)); border-radius: 10px; padding: 10px 12px; }
      .brf-conflict-t { font-size: 12.5px; font-weight: 600; color: var(--warning); }
      .brf-mine { margin-top: 6px; font-size: 13px; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 160px; overflow-y: auto; color: var(--text-muted); }
      .brf-actions { display: flex; gap: 8px; margin-top: 10px; }
      .brf .brf-b1 { flex: 1; padding: 7px; border-radius: 10px; font-size: 12.5px; font-weight: 600; color: #fff; background-image: var(--grad-brand); }
      .brf .brf-b2 { flex: 1; padding: 7px; border-radius: 10px; font-size: 12.5px; font-weight: 600; border: 1px solid var(--border); background: var(--surface); color: var(--text); }
      .brf .ag-md p, .brf .ag-md ol, .brf .ag-md ul { margin: 0 0 8px; }
      .brf .ag-md > :last-child { margin-bottom: 0; }
      .brf .ag-md ol, .brf .ag-md ul { padding-left: 20px; }
      .brf .ag-md ol { list-style: decimal; }
      .brf .ag-md ul { list-style: disc; }
      .brf .ag-md li { margin: 3px 0; }
      .brf .ag-md strong { font-weight: 600; color: var(--text); }
      .brf .ag-md code { font-size: 0.92em; background: var(--surface-2); border: 1px solid var(--border); border-radius: 5px; padding: 0 5px; }
      .brf .ag-md a { color: var(--brand-text); text-decoration: underline; text-underline-offset: 2px; }
      .brf .ag-tx { overflow-wrap: anywhere; }

      .brf-page-head { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
      .brf-title { font-family: var(--font-display); font-size: 20px; font-weight: 600; letter-spacing: -.02em; margin: 0; }
      .brf-docs { display: flex; gap: 20px; align-items: flex-start; }
      .brf-tabs { width: 220px; flex-shrink: 0; display: flex; flex-direction: column; gap: 2px; position: sticky; top: 16px; }
      .brf .brf-tab { display: flex; align-items: center; gap: 9px; width: 100%; text-align: left; padding: 8px 12px; border-radius: 999px; font-size: 13.5px; font-weight: 500; color: var(--text-muted); }
      .brf .brf-tab:hover { background: var(--surface-2); color: var(--text); }
      .brf .brf-tab.on { background: var(--brand-tint); color: var(--brand-text); font-weight: 600; }
      .brf-tab svg { width: 15px; height: 15px; }
      .brf-tab .t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .brf-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--border-strong); flex-shrink: 0; }
      .brf-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 12px; max-width: 820px; }
      @media (max-width: 767px) {
        .brf-docs { flex-direction: column; }
        .brf-tabs { width: 100%; position: static; flex-direction: row; overflow-x: auto; }
        .brf .brf-tab { width: auto; flex-shrink: 0; }
      }
    `}</style>
  );
}
