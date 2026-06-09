import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "../../lib/tauri";
import {
  assemblePlanPrompt,
  PLAN_OPEN,
  PLAN_CLOSE,
  type PlanChatTurn,
} from "../../lib/prompt";
import {
  deletePlan,
  listPlans,
  movePlan,
  notifyPlansChanged,
  parkIdea,
  planFolders,
  savePlan,
  titleFromBody,
  type PlanKind,
  type PlanStatus,
  type PlanSummary,
} from "../../lib/plans";
import type { StreamEvent, VaultNote } from "../../lib/types";
import { IconFolder, IconList, IconMessage, IconPlus } from "../icons";

const ROOT_FOLDER_LABEL = "Inbox (Plans root)";
const NEW_FOLDER_SENTINEL = "__new__";

/** Split an agent reply into its conversational part and the latest plan block. */
function extractPlan(text: string): { conversation: string; plan: string | null } {
  const open = text.lastIndexOf(PLAN_OPEN);
  if (open === -1) return { conversation: text.trim(), plan: null };
  const afterOpen = open + PLAN_OPEN.length;
  const close = text.indexOf(PLAN_CLOSE, afterOpen);
  const inner =
    close === -1 ? text.slice(afterOpen) : text.slice(afterOpen, close);
  const before = text.slice(0, open);
  const after = close === -1 ? "" : text.slice(close + PLAN_CLOSE.length);
  const conversation = `${before}\n${after}`.trim();
  return { conversation, plan: inner.trim() || null };
}

/** Hide a mid-stream plan block behind a calmer marker while text is arriving. */
function streamingDisplay(text: string): string {
  const open = text.indexOf(PLAN_OPEN);
  if (open === -1) return text;
  const head = text.slice(0, open).trim();
  return `${head}${head ? "\n\n" : ""}_Drafting the plan, see the panel on the right…_`;
}

/** Infer feature vs business from the plan's section headings. */
function inferKind(body: string): PlanKind {
  const lower = body.toLowerCase();
  if (lower.includes("## acceptance criteria") || lower.includes("files likely touched")) {
    return "feature";
  }
  if (lower.includes("## hypothesis") || lower.includes("## the play")) {
    return "business";
  }
  return "idea";
}

function statusPill(status: PlanStatus): { label: string; className: string } {
  switch (status) {
    case "parked":
      return { label: "Parked", className: "hml-neutral" };
    case "draft":
      return { label: "Draft", className: "hml-amber" };
    case "ready":
      return { label: "Ready", className: "hml-green" };
  }
}

interface PlansPageProps {
  root: string | null;
}

export function PlansPage({ root }: PlansPageProps) {
  const [tab, setTab] = useState<"chat" | "library">("chat");
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [seed, setSeed] = useState<PlanSummary | null>(null);
  const folders = useMemo(() => planFolders(plans), [plans]);

  const refreshPlans = useCallback(async () => {
    if (!root) {
      setPlans([]);
      return;
    }
    try {
      setPlans(await listPlans(root));
    } catch {
      setPlans([]);
    }
  }, [root]);

  useEffect(() => {
    void refreshPlans();
  }, [refreshPlans]);

  if (!root) {
    return (
      <div className="hml-content">
        <div className="hml-empty">
          <div className="hml-empty-title">No workspace folder selected</div>
          <div className="hml-empty-sub">Pick a media-buying folder to use Plans.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="hml-content plans-root">
      <div className="plans-tabs">
        <button
          type="button"
          className={`plans-tab${tab === "chat" ? " plans-tab-on" : ""}`}
          onClick={() => setTab("chat")}
        >
          <IconMessage size={14} />
          New plan
        </button>
        <button
          type="button"
          className={`plans-tab${tab === "library" ? " plans-tab-on" : ""}`}
          onClick={() => setTab("library")}
        >
          <IconList size={14} />
          Library
          <span className="plans-tab-count">{plans.length}</span>
        </button>
      </div>

      {/* Both panes stay mounted so an in-progress chat and its draft survive a
          trip to the Library and back. We toggle visibility, not the tree. */}
      <div style={{ display: tab === "chat" ? "block" : "none" }}>
        <PlanChat
          root={root}
          folders={folders}
          onSaved={refreshPlans}
          seed={seed}
          onSeedConsumed={() => setSeed(null)}
        />
      </div>
      <div style={{ display: tab === "library" ? "block" : "none" }}>
        <PlanLibrary
          root={root}
          plans={plans}
          folders={folders}
          onChanged={refreshPlans}
          onOpenInChat={(plan) => {
            setSeed(plan);
            setTab("chat");
          }}
        />
      </div>
    </div>
  );
}

// ─── Chat pane ────────────────────────────────────────────────────────────

interface PlanChatProps {
  root: string;
  folders: string[];
  onSaved: () => void;
  seed: PlanSummary | null;
  onSeedConsumed: () => void;
}

function PlanChat({ root, folders, onSaved, seed, onSeedConsumed }: PlanChatProps) {
  const [turns, setTurns] = useState<PlanChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [folder, setFolder] = useState("");
  const [newFolder, setNewFolder] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [park, setPark] = useState("");
  const [parking, setParking] = useState(false);

  const threadRef = useRef<HTMLDivElement>(null);
  const aboutRef = useRef<VaultNote[] | null>(null);

  // Load an existing plan handed over from the Library "Open in chat" action.
  useEffect(() => {
    if (!seed) return;
    setTurns([]);
    setError(null);
    setStreamText("");
    setPlan(seed.body);
    setName(seed.name);
    setNameTouched(true);
    setFolder(seed.folder);
    setNewFolder("");
    setToast(`Loaded "${seed.title}". Keep iterating, then save to overwrite.`);
    window.setTimeout(() => setToast(null), 3200);
    onSeedConsumed();
  }, [seed, onSeedConsumed]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let mounted = true;
    api
      .onClaudeStream((evt: StreamEvent) => {
        if (!mounted) return;
        if (evt.kind === "delta") setStreamText((p) => p + evt.text);
        else if (evt.kind === "error") setError(evt.message);
      })
      .then((un) => {
        if (!mounted) un();
        else unlisten = un;
      });
    return () => {
      mounted = false;
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns.length, streamText]);

  // Default the filename to the plan's title until Jake edits it.
  useEffect(() => {
    if (plan && !nameTouched) setName(titleFromBody(plan));
  }, [plan, nameTouched]);

  const toastFor = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  };

  const submit = async () => {
    const value = input.trim();
    if (!value || streaming) return;
    setError(null);
    setInput("");
    const history = [...turns];
    setTurns([...history, { role: "user", body: value }]);
    setStreaming(true);
    setStreamText("");

    if (!aboutRef.current) {
      try {
        aboutRef.current = await api.readAboutNotes(root);
      } catch {
        aboutRef.current = [];
      }
    }

    const prompt = assemblePlanPrompt({
      history,
      userInput: value,
      aboutNotes: aboutRef.current ?? [],
      currentPlan: plan,
    });

    const id = crypto.randomUUID();
    try {
      const full = await api.invokeClaude(id, prompt, "");
      const { conversation, plan: nextPlan } = extractPlan(full || streamText);
      if (nextPlan) setPlan(nextPlan);
      const reply = conversation || (nextPlan ? "Plan updated. See the panel." : full);
      setTurns((prev) => [...prev, { role: "assistant", body: reply }]);
    } catch (e) {
      setError(String(e));
    } finally {
      setStreaming(false);
      setStreamText("");
    }
  };

  const resolvedFolder = folder === NEW_FOLDER_SENTINEL ? newFolder.trim() : folder;

  const save = async () => {
    if (!plan || !name.trim() || saving) return;
    setSaving(true);
    try {
      const saved = await savePlan(root, {
        folder: resolvedFolder,
        name: name.trim(),
        title: titleFromBody(plan),
        kind: inferKind(plan),
        status: "ready",
        body: plan,
      });
      notifyPlansChanged();
      onSaved();
      setFolder(saved.folder);
      if (folder === NEW_FOLDER_SENTINEL) setNewFolder("");
      toastFor(`Saved to ${saved.relPath}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const doPark = async () => {
    const text = park.trim();
    if (!text || parking) return;
    setParking(true);
    try {
      await parkIdea(root, "", text);
      notifyPlansChanged();
      onSaved();
      setPark("");
      toastFor("Idea parked in the Library.");
    } catch (e) {
      setError(String(e));
    } finally {
      setParking(false);
    }
  };

  const startFresh = () => {
    setTurns([]);
    setPlan(null);
    setName("");
    setNameTouched(false);
    setNewFolder("");
    setError(null);
    setStreamText("");
  };

  return (
    <div className="plans-chat">
      <div className="plans-park">
        <IconPlus size={13} className="plans-park-ico" />
        <input
          className="plans-park-input"
          placeholder="Park a raw idea for later (saved straight to the Library, no chat needed)…"
          value={park}
          onChange={(e) => setPark(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void doPark();
            }
          }}
          disabled={parking}
        />
        <button
          type="button"
          className="hml-btn hml-ghost"
          onClick={() => void doPark()}
          disabled={parking || park.trim().length === 0}
        >
          {parking ? "Parking…" : "Park"}
        </button>
      </div>

      <div className="plans-split">
        {/* Conversation */}
        <div className="plans-conv hml-panel">
          <div className="hml-panel-header">
            <div className="hml-panel-title">
              <span className="hml-dot" />
              Forge
            </div>
            <button type="button" className="hml-panel-action" onClick={startFresh}>
              New idea
            </button>
          </div>
          <div className="plans-thread" ref={threadRef}>
            {turns.length === 0 && !streaming && (
              <div className="plans-thread-empty">
                <div className="plans-thread-empty-title">Bring Forge an idea.</div>
                <div className="plans-thread-empty-sub">
                  Forge will challenge it with a few sharp questions, then draft a
                  detailed build plan you can name and save on the right.
                </div>
              </div>
            )}
            {turns.map((t, i) => (
              <div className={`plans-msg plans-msg-${t.role}`} key={i}>
                <div className="plans-msg-label">
                  {t.role === "user" ? "YOU" : "FORGE"}
                </div>
                <div className="plans-msg-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{t.body}</ReactMarkdown>
                </div>
              </div>
            ))}
            {streaming && (
              <div className="plans-msg plans-msg-assistant">
                <div className="plans-msg-label">FORGE</div>
                <div className="plans-msg-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {streamingDisplay(streamText) || "…"}
                  </ReactMarkdown>
                  <span className="plans-caret" />
                </div>
              </div>
            )}
            {error && <div className="plans-error">{error}</div>}
          </div>
          <div className="plans-input-wrap">
            <textarea
              className="plans-input"
              rows={2}
              placeholder="Describe the idea, or answer Forge…  (⌘↵ to send)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void submit();
                }
              }}
              disabled={streaming}
            />
            <button
              type="button"
              className="hml-btn plans-send"
              onClick={() => void submit()}
              disabled={streaming || input.trim().length === 0}
            >
              {streaming ? "…" : "Send"}
            </button>
          </div>
        </div>

        {/* Plan preview + save */}
        <div className="plans-preview hml-panel">
          <div className="hml-panel-header">
            <div className="hml-panel-title">
              <span className="hml-dot" style={{ background: "var(--hml-blue)" }} />
              Build plan
            </div>
            {plan && <span className="hml-pill-mini hml-blue">{inferKind(plan)}</span>}
          </div>
          {plan ? (
            <>
              <div className="plans-preview-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{plan}</ReactMarkdown>
              </div>
              <div className="plans-save-bar">
                <input
                  className="plans-save-name"
                  placeholder="File name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setNameTouched(true);
                  }}
                />
                <select
                  className="plans-save-folder"
                  value={folder}
                  onChange={(e) => setFolder(e.target.value)}
                >
                  <option value="">{ROOT_FOLDER_LABEL}</option>
                  {folders.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                  <option value={NEW_FOLDER_SENTINEL}>+ New folder…</option>
                </select>
                {folder === NEW_FOLDER_SENTINEL && (
                  <input
                    className="plans-save-name"
                    placeholder="New folder name"
                    value={newFolder}
                    onChange={(e) => setNewFolder(e.target.value)}
                  />
                )}
                <button
                  type="button"
                  className="hml-btn plans-send"
                  onClick={() => void save()}
                  disabled={saving || name.trim().length === 0}
                >
                  {saving ? "Saving…" : "Save plan"}
                </button>
              </div>
            </>
          ) : (
            <div className="plans-preview-empty">
              <div className="hml-empty-title">No plan yet</div>
              <div className="hml-empty-sub">
                Once Forge has enough to go on, the build plan appears here. You name
                it and pick a folder, then save it to the Library.
              </div>
            </div>
          )}
        </div>
      </div>

      {toast && <div className="plans-toast">{toast}</div>}
    </div>
  );
}

// ─── Library pane ───────────────────────────────────────────────────────────

interface PlanLibraryProps {
  root: string;
  plans: PlanSummary[];
  folders: string[];
  onChanged: () => void;
  onOpenInChat: (plan: PlanSummary) => void;
}

function PlanLibrary({
  root,
  plans,
  folders,
  onChanged,
  onOpenInChat,
}: PlanLibraryProps) {
  const [activeFolder, setActiveFolder] = useState<string>("__all__");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = useMemo(
    () => plans.find((p) => p.path === selectedPath) ?? null,
    [plans, selectedPath],
  );

  const visible = useMemo(() => {
    if (activeFolder === "__all__") return plans;
    if (activeFolder === "") return plans.filter((p) => p.folder === "");
    return plans.filter((p) => p.folder === activeFolder);
  }, [plans, activeFolder]);

  const folderCount = (f: string) =>
    f === "__all__"
      ? plans.length
      : plans.filter((p) => p.folder === f).length;

  const openInChat = (p: PlanSummary) => {
    onOpenInChat(p);
  };

  const remove = async (p: PlanSummary) => {
    if (busy) return;
    const ok = window.confirm(`Delete "${p.title}"? This removes the file from the vault.`);
    if (!ok) return;
    setBusy(true);
    try {
      await deletePlan(root, p.path);
      notifyPlansChanged();
      if (selectedPath === p.path) setSelectedPath(null);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const move = async (p: PlanSummary, target: string) => {
    if (busy || target === p.folder) return;
    setBusy(true);
    try {
      const moved = await movePlan(root, p, target);
      notifyPlansChanged();
      setSelectedPath(moved.path);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="plans-lib">
      <div className="plans-lib-folders">
        <button
          type="button"
          className={`plans-folder${activeFolder === "__all__" ? " plans-folder-on" : ""}`}
          onClick={() => setActiveFolder("__all__")}
        >
          <IconList size={13} />
          <span>All plans</span>
          <span className="plans-folder-count">{folderCount("__all__")}</span>
        </button>
        <button
          type="button"
          className={`plans-folder${activeFolder === "" ? " plans-folder-on" : ""}`}
          onClick={() => setActiveFolder("")}
        >
          <IconFolder size={13} />
          <span>{ROOT_FOLDER_LABEL}</span>
          <span className="plans-folder-count">{folderCount("")}</span>
        </button>
        {folders.map((f) => (
          <button
            key={f}
            type="button"
            className={`plans-folder${activeFolder === f ? " plans-folder-on" : ""}`}
            onClick={() => setActiveFolder(f)}
          >
            <IconFolder size={13} />
            <span>{f}</span>
            <span className="plans-folder-count">{folderCount(f)}</span>
          </button>
        ))}
      </div>

      <div className="plans-lib-main">
        {selected ? (
          <div className="plans-read hml-panel">
            <div className="hml-panel-header">
              <button
                type="button"
                className="hml-panel-action"
                onClick={() => setSelectedPath(null)}
              >
                ← All
              </button>
              <div className="plans-read-actions">
                <select
                  className="plans-save-folder"
                  value={selected.folder}
                  onChange={(e) => void move(selected, e.target.value)}
                  disabled={busy}
                  title="Move to folder"
                >
                  <option value="">{ROOT_FOLDER_LABEL}</option>
                  {folders.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="hml-btn hml-ghost"
                  onClick={() => openInChat(selected)}
                >
                  Open in chat
                </button>
                <button
                  type="button"
                  className="hml-btn hml-ghost plans-danger"
                  onClick={() => void remove(selected)}
                  disabled={busy}
                >
                  Delete
                </button>
              </div>
            </div>
            <div className="plans-read-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{selected.body}</ReactMarkdown>
            </div>
          </div>
        ) : visible.length === 0 ? (
          <div className="hml-empty">
            <div className="hml-empty-title">No plans here yet</div>
            <div className="hml-empty-sub">
              Draft one in the New plan tab, or park a raw idea.
            </div>
          </div>
        ) : (
          <div className="plans-cards">
            {visible.map((p) => {
              const pill = statusPill(p.status);
              return (
                <button
                  key={p.path}
                  type="button"
                  className="plans-card"
                  onClick={() => setSelectedPath(p.path)}
                >
                  <div className="plans-card-head">
                    <span className="plans-card-title">{p.title}</span>
                    <span className={`hml-pill-mini ${pill.className}`}>{pill.label}</span>
                  </div>
                  <div className="plans-card-meta">
                    {p.folder && <span className="plans-card-folder">{p.folder}</span>}
                    <span className="plans-card-kind">{p.kind}</span>
                    {p.created && (
                      <span className="plans-card-date">
                        {new Date(p.created).toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
