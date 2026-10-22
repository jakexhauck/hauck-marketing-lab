import { useEffect, useMemo, useReducer, useRef, useState, type CSSProperties } from "react";
import type { Editor } from "@tiptap/react";
import { CloudAlert, CloudCheck, CloudUpload, ExternalLink, Gauge } from "lucide-react";
import type { AgentId } from "../../../lib/agents";
import type { BriefDrive, BriefSection, BriefSectionId } from "../../../lib/agentWire";
import { briefDraft, initDraft, needsSave } from "../../../lib/briefDraft";
import { markdownToPlain } from "../../../lib/briefMarkdown";
import { AGENT_COLORS } from "../../../lib/brainGraph";
import { driveChip, fullBrief, sectionLabel, whoEdited } from "../../../lib/clientBrief";
import { BRIEF_SECTION_ICONS } from "../clientRowIcons";
import { BriefEditor, BriefToolbar } from "./BriefEditor";
import { useClientBrief, useSaveBriefSection } from "./agentApi";
import { SectionBoxes, StatusActions } from "./BriefBoxes";

// The Client Brief (docs/build-plans/agents.md, Phase 6), drawn two ways from
// the same pieces: beside the chat on every client agent page (BriefTab), and
// as the client's Brief page with Google Docs style tabs (BriefPage). Both
// read one cached query, so an edit in either shows in the other.
//
// Jake, 2026-10-17: "just like a Google Doc". A white page, one toolbar at the
// top, click anywhere and type. Each section is its own editor under its own
// heading (owner and last edit beside it), saved on its own with the version
// lock, so an agent rewriting Ads never touches the Status Jake is typing.

// The agents' colours, and one each for the sections no agent owns.
const SECTION_COLORS: Record<BriefSectionId, string> = {
  ...AGENT_COLORS,
  client: "#4DBB83",
  "onboarding-call": "#6366f1",
  "launch-call": "#ef4444",
};

// How long typing must pause before a section saves itself.
const AUTOSAVE_MS = 1_000;

export function useBrief(tenantId: string) {
  const q = useClientBrief(tenantId);
  const sections = useMemo(() => fullBrief(q.data?.sections ?? []), [q.data]);
  return { q, sections, drive: q.data?.drive ?? null, pages: q.data?.pages ?? [] };
}

// pages: the Mission Control pages, which the Doc carries too (briefDrive.ts).
export function DriveChip({
  drive,
  sections,
  pages = [],
}: {
  drive: BriefDrive | null;
  sections: BriefSection[];
  pages?: Pick<BriefSection, "version" | "updatedAt">[];
}) {
  const chip = driveChip(drive, [...sections, ...pages], new Date());
  const Icon = chip.tone === "bad" ? CloudAlert : chip.tone === "busy" ? CloudUpload : CloudCheck;
  return (
    <span className={`brf-drive ${chip.tone}`} title={chip.title ?? undefined}>
      <Icon />
      {chip.label}
    </span>
  );
}

export function OpenDoc({ drive }: { drive: BriefDrive | null }) {
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

export function SectionBlock({
  tenantId,
  section,
  mine = false,
  onFocus,
}: {
  tenantId: string;
  section: BriefSection;
  mine?: boolean;
  onFocus: (editor: Editor) => void;
}) {
  const save = useSaveBriefSection(tenantId);
  const [state, dispatch] = useReducer(briefDraft, section, initDraft);
  const [savedOnce, setSavedOnce] = useState(false);

  // A newer copy from the poll (an agent wrote, or the other view saved). With
  // unsaved text in the section it becomes the conflict box, never a reload
  // under Jake's cursor (lib/briefDraft.ts).
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

  const Icon = BRIEF_SECTION_ICONS[section.section] ?? Gauge;
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
    <section className={`brf-sec${mine ? " mine" : ""}`}>
      <div className="brf-sec-top">
        <span className="brf-sec-ic" style={{ background: SECTION_COLORS[section.section] }}>
          <Icon />
        </span>
        <h3 className="brf-sec-t">{sectionLabel(section.section)}</h3>
        <span className="brf-meta">
          {status && <span className={`brf-saved${state.error ? " bad" : ""}`}>{status}</span>}
          {who && <span className={`brf-who${state.base.updatedBy === "jake" ? " you" : ""}`}>{who}</span>}
        </span>
      </div>

      {section.section === "csm" && <StatusActions tenantId={tenantId} />}

      {state.conflict && (
        <div className="brf-conflict" role="alert">
          <div className="brf-conflict-t">
            {whoEdited(state.conflict.theirs, new Date()).split(",")[0] || "Someone"} saved a newer version
          </div>
          <div className="brf-mine">{markdownToPlain(state.conflict.mine)}</div>
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

      <BriefEditor
        markdown={state.draft}
        external={state.external}
        onChange={(text) => dispatch({ t: "edit", text })}
        onFocus={onFocus}
        label={`${sectionLabel(section.section)} section`}
      />

      <SectionBoxes tenantId={tenantId} section={section.section} />
    </section>
  );
}

// The Brief tab beside the chat on a client agent page.
export function BriefTab({ tenantId, agent }: { tenantId: string; agent: AgentId }) {
  const { q, sections, drive, pages } = useBrief(tenantId);
  const [editor, setEditor] = useState<Editor | null>(null);
  const mineRef = useRef<HTMLDivElement>(null);
  const loaded = !!q.data;
  useEffect(() => {
    if (loaded) mineRef.current?.scrollIntoView({ block: "nearest" });
  }, [loaded]);

  if (q.isLoading) return <div className="brf-note">Loading...</div>;
  if (q.isLoadingError) return <div className="brf-note">Brief did not load.</div>;
  return (
    <div className="brf brf-side">
      <BriefStyle />
      <div className="brf-bar">
        <div className="brf-head">
          <DriveChip drive={drive} sections={sections} pages={pages} />
          <span className="brf-grow" />
          <OpenDoc drive={drive} />
        </div>
        <BriefToolbar editor={editor} />
      </div>
      <div className="brf-paper">
        {sections.map((s) => (
          <div key={s.section} ref={s.section === agent ? mineRef : undefined}>
            <SectionBlock tenantId={tenantId} section={s} mine={s.section === agent} onFocus={setEditor} />
          </div>
        ))}
      </div>
    </div>
  );
}

type TabId = "all" | BriefSectionId;

// The client's Brief page: Google Docs style, a tab list on the left with All
// and one tab per section, the chosen tab as a page on the right.
export function BriefPage({ tenantId, brandColor }: { tenantId: string; brandColor?: string }) {
  const { q, sections, drive, pages } = useBrief(tenantId);
  const [tab, setTab] = useState<TabId>("all");
  const [editor, setEditor] = useState<Editor | null>(null);
  const style = brandColor ? ({ "--brand": brandColor } as CSSProperties) : undefined;
  const shown = tab === "all" ? sections : sections.filter((s) => s.section === tab);
  // A tab switch unmounts the editor the toolbar was bound to.
  const pick = (t: TabId) => {
    setEditor(null);
    setTab(t);
  };

  return (
    <div className="brf brf-page" style={style}>
      <BriefStyle />
      <div className="brf-page-head">
        <h2 className="brf-title">Brief</h2>
        {q.data && <DriveChip drive={drive} sections={sections} pages={pages} />}
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
              onClick={() => pick("all")}
              aria-current={tab === "all" ? "true" : undefined}
            >
              All
            </button>
            {sections.map((s) => {
              const Icon = BRIEF_SECTION_ICONS[s.section] ?? Gauge;
              return (
                <button
                  key={s.section}
                  type="button"
                  className={`brf-tab${tab === s.section ? " on" : ""}`}
                  onClick={() => pick(s.section)}
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
            <div className="brf-bar">
              <BriefToolbar editor={editor} />
            </div>
            <div className="brf-paper page">
              {shown.map((s) => (
                <SectionBlock key={s.section} tenantId={tenantId} section={s} onFocus={setEditor} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Scoped to .brf, on the admin tokens, so it reads in light and dark. The
// brand family is rebuilt from --brand here as on the agent page (AgentStyle),
// so the client's colour carries through on the Brief page too.
export function BriefStyle() {
  return (
    <style>{`
      .brf {
        --brand-2: color-mix(in srgb, var(--brand) 72%, white);
        --grad-brand: linear-gradient(135deg, var(--brand) 0%, var(--brand-2) 100%);
        --brand-tint: color-mix(in srgb, var(--brand) 10%, transparent);
        --brand-text: color-mix(in srgb, var(--brand) 88%, black);
        --paper-edge: color-mix(in srgb, var(--text) 4%, var(--bg, var(--surface-2)));
        color: var(--text); font-family: var(--font-body);
      }
      [data-theme="dark"] .brf {
        --brand-tint: color-mix(in srgb, var(--brand) 18%, transparent);
        --brand-text: color-mix(in srgb, var(--brand) 70%, white);
      }
      .brf *, .brf *::before, .brf *::after { box-sizing: border-box; }
      /* Zero specificity, so the app's own buttons inside the brief (Status
         actions, Accounts fixes) keep their look. */
      :where(.brf) button, :where(.brf) select { font: inherit; cursor: pointer; color: inherit; }
      :where(.brf) button { border: 0; background: none; }
      :where(.brf) button:disabled, :where(.brf) select:disabled { cursor: default; opacity: .4; }
      .brf svg { flex-shrink: 0; }
      .brf-note { padding: 16px 8px; font-size: 13px; color: var(--text-faint); text-align: center; }
      .brf-grow { flex: 1; }
      .brf-head { display: flex; align-items: center; gap: 8px; }
      .brf-drive { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; border-radius: 999px; padding: 3px 10px; white-space: nowrap; }
      .brf-drive svg { width: 13px; height: 13px; }
      .brf-drive.ok { color: var(--positive); background: color-mix(in srgb, var(--positive) 10%, transparent); }
      .brf-drive.busy { color: var(--brand-text); background: var(--brand-tint); }
      .brf-drive.bad { color: var(--danger); background: color-mix(in srgb, var(--danger) 10%, transparent); }
      .brf-drive.none { color: var(--text-faint); background: var(--surface-2); }
      .brf-iconbtn { width: 34px; height: 34px; border-radius: 50%; border: 1px solid var(--border); background: var(--surface); display: grid; place-items: center; color: var(--text-muted); flex-shrink: 0; }
      .brf-iconbtn:hover { color: var(--text); }
      .brf-iconbtn svg { width: 16px; height: 16px; }

      /* The toolbar: one row, sticky over the page, as in Google Docs. */
      .brf-bar { position: sticky; top: 0; z-index: 5; display: flex; flex-direction: column; gap: 8px; padding-bottom: 10px; background: linear-gradient(var(--brf-bar-bg, var(--surface)) 85%, transparent); }
      .brf-side .brf-bar { --brf-bar-bg: color-mix(in srgb, var(--surface) 92%, var(--bg, var(--surface))); margin: -16px -16px 0; padding: 12px 16px 10px; }
      .brf-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 2px; padding: 4px 6px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface-2); }
      .brf .brf-tb { width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center; color: var(--text-muted); }
      .brf .brf-tb:hover:not(:disabled) { background: var(--surface-3, var(--surface)); color: var(--text); }
      .brf .brf-tb.on { background: var(--brand-tint); color: var(--brand-text); }
      .brf-tb svg { width: 16px; height: 16px; }
      .brf-tb-sep { width: 1px; height: 18px; background: var(--border); margin: 0 4px; }
      .brf .brf-tb-select { height: 30px; border: 0; border-radius: 8px; background: transparent; padding: 0 6px; font-size: 13px; color: var(--text); }
      .brf .brf-tb-select:hover:not(:disabled) { background: var(--surface-3, var(--surface)); }
      .brf-tb-select option { color: var(--text); background: var(--surface); }
      .brf-linkbox { display: inline-flex; align-items: center; gap: 2px; margin-left: 4px; }
      .brf-linkbox input { width: 200px; height: 28px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text); font: inherit; font-size: 13px; padding: 0 8px; outline: 0; }
      .brf-linkbox input:focus { border-color: color-mix(in srgb, var(--brand) 45%, var(--border)); }

      /* The page. */
      .brf-paper { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; box-shadow: 0 1px 3px rgba(20,22,31,.08), 0 8px 24px rgba(20,22,31,.06); padding: 20px 22px 28px; }
      .brf-paper.page { max-width: 816px; min-height: 70vh; padding: 48px 64px 72px; }
      [data-theme="dark"] .brf-paper { box-shadow: 0 1px 3px rgba(0,0,0,.4), 0 8px 24px rgba(0,0,0,.3); }

      .brf-sec + .brf-sec { margin-top: 26px; }
      .brf-sec.mine { position: relative; }
      .brf-sec.mine::before { content: ""; position: absolute; left: -12px; top: 2px; bottom: 2px; width: 3px; border-radius: 3px; background: var(--brand); }
      .brf-paper.page .brf-sec.mine::before { left: -28px; }
      .brf-sec-top { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
      .brf-sec-ic { width: 24px; height: 24px; border-radius: 7px; display: grid; place-items: center; color: #fff; flex-shrink: 0; }
      .brf-sec-ic svg { width: 13px; height: 13px; }
      .brf-sec-t { font-family: var(--font-display); font-weight: 600; font-size: 17px; letter-spacing: -.01em; margin: 0; margin-right: auto; }
      .brf-paper.page .brf-sec-t { font-size: 20px; }
      .brf-meta { display: inline-flex; align-items: center; gap: 10px; min-width: 0; }
      .brf-who { font-size: 11.5px; color: var(--text-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
      .brf-who.you { color: var(--brand-text); font-weight: 600; }
      .brf-saved { font-size: 11.5px; color: var(--text-faint); white-space: nowrap; }
      .brf-saved.bad { color: var(--danger); white-space: normal; }

      /* The text itself: Docs-like reading size and rhythm. */
      .brf-doc { outline: 0; min-height: 28px; font-size: 14.5px; line-height: 1.7; color: var(--text); cursor: text; overflow-wrap: anywhere; }
      .brf-paper.page .brf-doc { font-size: 15px; }
      .brf-doc p { margin: 0 0 8px; }
      .brf-doc h1 { font-family: var(--font-display); font-size: 1.55em; font-weight: 600; line-height: 1.3; margin: 18px 0 8px; }
      .brf-doc h2 { font-family: var(--font-display); font-size: 1.3em; font-weight: 600; line-height: 1.35; margin: 16px 0 6px; }
      .brf-doc h3 { font-family: var(--font-display); font-size: 1.1em; font-weight: 600; line-height: 1.4; margin: 14px 0 4px; }
      .brf-doc > :first-child { margin-top: 0; }
      .brf-doc ul, .brf-doc ol { margin: 0 0 8px; padding-left: 24px; }
      .brf-doc ul { list-style: disc; }
      .brf-doc ul ul { list-style: circle; }
      .brf-doc ol { list-style: decimal; }
      .brf-doc li { margin: 2px 0; }
      .brf-doc li > p { margin: 0; }
      .brf-doc strong { font-weight: 700; }
      .brf-doc em { font-style: italic; }
      .brf-doc u { text-decoration: underline; }
      .brf-doc code { font-size: .92em; background: var(--surface-2); border: 1px solid var(--border); border-radius: 5px; padding: 0 5px; }
      .brf-doc a { color: var(--brand-text); text-decoration: underline; text-underline-offset: 2px; }
      .brf-doc p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: var(--text-faint); float: left; height: 0; pointer-events: none; }

      .brf-conflict { margin: 4px 0 10px; border: 1px solid color-mix(in srgb, var(--warning) 40%, var(--border)); background: color-mix(in srgb, var(--warning) 7%, var(--surface)); border-radius: 10px; padding: 10px 12px; }
      .brf-conflict-t { font-size: 12.5px; font-weight: 600; color: var(--warning); }
      .brf-mine { margin-top: 6px; font-size: 13px; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 160px; overflow-y: auto; color: var(--text-muted); }
      .brf-actions { display: flex; gap: 8px; margin-top: 10px; }
      .brf .brf-b1 { flex: 1; padding: 7px; border-radius: 10px; font-size: 12.5px; font-weight: 600; color: #fff; background-image: var(--grad-brand); }
      .brf .brf-b2 { flex: 1; padding: 7px; border-radius: 10px; font-size: 12.5px; font-weight: 600; border: 1px solid var(--border); background: var(--surface); color: var(--text); }

      /* Status actions and the boxes under a section. */
      .brf-actions-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 4px 0 12px; }
      .brf-boxes { margin-top: 10px; padding-top: 6px; border-top: 1px dashed var(--border); }
      .brf-box { display: flex; align-items: flex-start; gap: 12px; padding: 6px 12px; border-radius: 8px; }
      .brf-box:hover { background: var(--surface-2); }
      .brf .brf-check { margin-top: 1px; width: 20px; height: 20px; flex-shrink: 0; display: grid; place-items: center; border-radius: 6px; border: 1.5px solid var(--border-strong); background: var(--surface); color: var(--brand-fg, #fff); }
      .brf .brf-check:hover { border-color: var(--brand); }
      .brf .brf-check.on { border-color: var(--brand); background: var(--brand); }
      .brf-box-body { min-width: 0; flex: 1; }
      .brf .brf-box-label { text-align: left; font-size: 14px; font-weight: 500; color: var(--text); }
      .brf .brf-box-label.on { color: var(--text-faint); text-decoration: line-through; }
      .brf-box-sub { margin: 2px 0 0; font-size: 12.5px; color: var(--text-muted); }
      .brf-box-group { margin: 10px 0 2px; padding: 0 12px; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--text-faint); }
      .brf-box-note { padding: 6px 12px; font-size: 12.5px; color: var(--text-faint); }

      .brf-page-head { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
      .brf-title { font-family: var(--font-display); font-size: 20px; font-weight: 600; letter-spacing: -.02em; margin: 0; }
      .brf-docs { display: flex; gap: 24px; align-items: flex-start; }
      .brf-tabs { width: 220px; flex-shrink: 0; display: flex; flex-direction: column; gap: 2px; position: sticky; top: 16px; }
      .brf .brf-tab { display: flex; align-items: center; gap: 9px; width: 100%; text-align: left; padding: 8px 12px; border-radius: 999px; font-size: 13.5px; font-weight: 500; color: var(--text-muted); }
      .brf .brf-tab:hover { background: var(--surface-2); color: var(--text); }
      .brf .brf-tab.on { background: var(--brand-tint); color: var(--brand-text); font-weight: 600; }
      .brf-tab svg { width: 15px; height: 15px; }
      .brf-tab .t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .brf-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--border-strong); flex-shrink: 0; }
      .brf-main { flex: 1; min-width: 0; max-width: 816px; }
      .brf-page .brf-bar { --brf-bar-bg: var(--bg, var(--surface-2)); }
      @media (max-width: 767px) {
        .brf-docs { flex-direction: column; }
        .brf-tabs { width: 100%; position: static; flex-direction: row; overflow-x: auto; }
        .brf .brf-tab { width: auto; flex-shrink: 0; }
        .brf-paper.page { padding: 24px 18px 40px; }
        .brf-paper.page .brf-sec.mine::before { left: -10px; }
      }
    `}</style>
  );
}
