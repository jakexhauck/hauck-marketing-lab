import { useEffect, useMemo, useState } from "react";
import "./builder.css";
import { api } from "../../lib/tauri";
import {
  loadBuilderData,
  newId,
  projectNameFromPath,
  saveBuilderData,
  type BuilderData,
  type BuilderProject,
  type BuilderSession as Session,
  type ProjectResources,
} from "../../lib/builderStore";
import { BuilderSession } from "./BuilderSession";
import {
  IconChevronRight,
  IconClose,
  IconCode,
  IconFile,
  IconFolder,
  IconPlus,
  IconTrash,
} from "../icons";

interface InsertRequest {
  sessionId: string;
  text: string;
  nonce: string;
}

/**
 * Builder — VS-Code-style coding sessions. A rail of registered project
 * folders on the left; a tab strip of Claude sessions per project; each
 * session is a streaming chat pinned to that folder, with an optional
 * side-by-side split so two sessions can run at once.
 */
export function BuilderWorkspace() {
  const [data, setData] = useState<BuilderData>(() => loadBuilderData());
  const [activeProjectId, setActiveProjectId] = useState<string | null>(
    () => loadBuilderData().projects[0]?.id ?? null,
  );
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [secondarySessionId, setSecondarySessionId] = useState<string | null>(null);
  const [resources, setResources] = useState<ProjectResources | null>(null);
  const [resOpen, setResOpen] = useState<{ docs: boolean; assets: boolean }>({
    docs: true,
    assets: false,
  });
  const [insert, setInsert] = useState<InsertRequest | null>(null);

  // Persist on every data change.
  useEffect(() => {
    saveBuilderData(data);
  }, [data]);

  // Seed the default projects (mobile app + lab) on first launch, and backfill
  // their extra doc roots onto already-seeded installs that predate them.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let defaults: { name: string; path: string; doc_roots: string[] }[] = [];
      try {
        defaults = await api.builderDefaultProjects();
      } catch {
        defaults = [];
      }
      if (cancelled) return;
      const docRootsByPath = new Map(defaults.map((s) => [s.path, s.doc_roots ?? []]));
      const existing = new Set(data.projects.map((p) => p.path));
      const added: BuilderProject[] = defaults
        .filter((s) => !existing.has(s.path))
        .map((s) => ({
          id: newId(),
          name: s.name,
          path: s.path,
          docRoots: s.doc_roots ?? [],
        }));
      setData((d) => {
        // Backfill doc roots on existing default projects that lack them.
        const reconciled = d.projects.map((p) => {
          const roots = docRootsByPath.get(p.path);
          if (roots && roots.length > 0 && (!p.docRoots || p.docRoots.length === 0)) {
            return { ...p, docRoots: roots };
          }
          return p;
        });
        const projects = d.seeded ? reconciled : [...reconciled, ...added];
        return { ...d, projects, seeded: true };
      });
      const firstId = added[0]?.id ?? data.projects[0]?.id ?? null;
      setActiveProjectId((cur) => cur ?? firstId);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const projectSessions = useMemo(
    () => data.sessions.filter((s) => s.projectId === activeProjectId),
    [data.sessions, activeProjectId],
  );

  // Keep the active session valid for the selected project.
  useEffect(() => {
    if (!activeProjectId) {
      setActiveSessionId(null);
      setSecondarySessionId(null);
      return;
    }
    const inProject = projectSessions.some((s) => s.id === activeSessionId);
    if (!inProject) {
      setActiveSessionId(projectSessions[0]?.id ?? null);
    }
    if (secondarySessionId && !projectSessions.some((s) => s.id === secondarySessionId)) {
      setSecondarySessionId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId, projectSessions]);

  const addProject = async () => {
    const path = await api.pickFolder();
    if (!path) return;
    if (data.projects.some((p) => p.path === path)) {
      const existing = data.projects.find((p) => p.path === path)!;
      setActiveProjectId(existing.id);
      return;
    }
    const project: BuilderProject = {
      id: newId(),
      name: projectNameFromPath(path),
      path,
    };
    setData((d) => ({ ...d, projects: [...d.projects, project] }));
    setActiveProjectId(project.id);
  };

  const removeProject = (id: string) => {
    setData((d) => ({
      projects: d.projects.filter((p) => p.id !== id),
      sessions: d.sessions.filter((s) => s.projectId !== id),
    }));
    if (activeProjectId === id) {
      const next = data.projects.find((p) => p.id !== id) ?? null;
      setActiveProjectId(next?.id ?? null);
    }
  };

  const newSession = () => {
    if (!activeProjectId) return;
    const session: Session = {
      id: newId(),
      projectId: activeProjectId,
      title: "New session",
      mode: "edits",
      claudeSessionId: null,
      turns: [],
      createdAt: new Date().toISOString(),
    };
    setData((d) => ({ ...d, sessions: [...d.sessions, session] }));
    setActiveSessionId(session.id);
  };

  const closeSession = (id: string) => {
    setData((d) => ({ ...d, sessions: d.sessions.filter((s) => s.id !== id) }));
    if (secondarySessionId === id) setSecondarySessionId(null);
    if (activeSessionId === id) {
      const remaining = projectSessions.filter((s) => s.id !== id);
      setActiveSessionId(remaining[0]?.id ?? null);
    }
  };

  const persistSession = (updated: Session) => {
    setData((d) => ({
      ...d,
      sessions: d.sessions.map((s) => (s.id === updated.id ? updated : s)),
    }));
  };

  const toggleSplit = () => {
    if (secondarySessionId) {
      setSecondarySessionId(null);
      return;
    }
    // Open the next session beside the active one, or spin up a fresh one.
    const other = projectSessions.find((s) => s.id !== activeSessionId);
    if (other) {
      setSecondarySessionId(other.id);
    } else if (activeProjectId) {
      const session: Session = {
        id: newId(),
        projectId: activeProjectId,
        title: "New session",
        mode: "edits",
        claudeSessionId: null,
        turns: [],
        createdAt: new Date().toISOString(),
      };
      setData((d) => ({ ...d, sessions: [...d.sessions, session] }));
      setSecondarySessionId(session.id);
    }
  };

  const activeProject = data.projects.find((p) => p.id === activeProjectId) ?? null;

  // Load the active project's docs + assets whenever it changes.
  useEffect(() => {
    if (!activeProject) {
      setResources(null);
      return;
    }
    let cancelled = false;
    setResources(null);
    void api
      .listProjectResources(activeProject.path, activeProject.docRoots)
      .then((r) => {
        if (!cancelled) setResources(r);
      })
      .catch(() => {
        if (!cancelled) setResources({ docs: [], assets: [], truncated: false });
      });
    return () => {
      cancelled = true;
    };
  }, [activeProject?.path]);

  // Drop a resource path into the active session's composer.
  const insertResource = (rel: string) => {
    if (!activeSessionId) return;
    setInsert({ sessionId: activeSessionId, text: rel, nonce: newId() });
  };

  const activeSession = projectSessions.find((s) => s.id === activeSessionId) ?? null;
  const secondarySession =
    projectSessions.find((s) => s.id === secondarySessionId) ?? null;
  const canSplit = projectSessions.length > 0 && !!activeSession;

  return (
    <div className="bld-root">
      <aside className="bld-projects">
        <div className="bld-projects-head">
          <span className="bld-projects-title">Projects</span>
          <button
            type="button"
            className="hml-btn hml-ghost bld-icon-btn"
            onClick={() => void addProject()}
            title="Add a project folder"
          >
            <IconPlus size={14} />
          </button>
        </div>
        <ul className="bld-project-list">
          {data.projects.length === 0 && (
            <li className="bld-projects-empty">
              No projects yet. Add a folder to start building.
            </li>
          )}
          {data.projects.map((p) => (
            <li
              key={p.id}
              className={`bld-project${p.id === activeProjectId ? " bld-project-active" : ""}`}
            >
              <div className="bld-project-row">
                <button
                  type="button"
                  className="bld-project-btn"
                  onClick={() => setActiveProjectId(p.id)}
                  title={p.path}
                >
                  <IconFolder size={14} className="bld-project-icon" />
                  <span className="bld-project-name">{p.name}</span>
                </button>
                <button
                  type="button"
                  className="bld-project-del"
                  onClick={() => removeProject(p.id)}
                  title="Remove project"
                >
                  <IconTrash size={12} />
                </button>
              </div>
              {p.id === activeProjectId && (
                <ResourcesPanel
                  resources={resources}
                  open={resOpen}
                  onToggle={(k) => setResOpen((o) => ({ ...o, [k]: !o[k] }))}
                  onPick={insertResource}
                  canInsert={!!activeSessionId}
                />
              )}
            </li>
          ))}
        </ul>
      </aside>

      <div className="bld-main">
        {!activeProject ? (
          <div className="bld-blank">
            <IconCode size={32} />
            <p className="bld-blank-title">Builder</p>
            <p className="bld-blank-sub">
              Open Claude coding sessions against any folder. Build your mobile
              app, this app, or anything else, with one or two sessions side by
              side.
            </p>
            <button
              type="button"
              className="hml-btn hml-primary"
              onClick={() => void addProject()}
            >
              <IconPlus size={13} /> Add a project folder
            </button>
          </div>
        ) : (
          <>
            <div className="bld-tabs">
              <div className="bld-tabs-list">
                {projectSessions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`bld-tab${s.id === activeSessionId ? " bld-tab-active" : ""}`}
                    onClick={() => setActiveSessionId(s.id)}
                    title={s.title}
                  >
                    <span className="bld-tab-label">{s.title}</span>
                    <span
                      className="bld-tab-close"
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        closeSession(s.id);
                      }}
                      title="Close session"
                    >
                      <IconClose size={11} />
                    </span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="hml-btn hml-ghost bld-newtab"
                onClick={newSession}
                title="New session"
              >
                <IconPlus size={13} /> New session
              </button>
            </div>

            {activeSession ? (
              <div className={`bld-panes${secondarySession ? " bld-panes-split" : ""}`}>
                <BuilderSession
                  key={activeSession.id}
                  session={activeSession}
                  project={activeProject}
                  onPersist={persistSession}
                  onClose={() => closeSession(activeSession.id)}
                  onToggleSplit={toggleSplit}
                  splitActive={!!secondarySession}
                  canSplit={canSplit}
                  insert={insert?.sessionId === activeSession.id ? insert : null}
                />
                {secondarySession && (
                  <BuilderSession
                    key={secondarySession.id}
                    session={secondarySession}
                    project={activeProject}
                    onPersist={persistSession}
                    onClose={() => closeSession(secondarySession.id)}
                    onToggleSplit={toggleSplit}
                    splitActive
                    canSplit={canSplit}
                  />
                )}
              </div>
            ) : (
              <div className="bld-blank">
                <IconCode size={28} />
                <p className="bld-blank-title">{activeProject.name}</p>
                <p className="bld-blank-sub">{activeProject.path}</p>
                <button type="button" className="hml-btn hml-primary" onClick={newSession}>
                  <IconPlus size={13} /> New session
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ResourcesPanel({
  resources,
  open,
  onToggle,
  onPick,
  canInsert,
}: {
  resources: ProjectResources | null;
  open: { docs: boolean; assets: boolean };
  onToggle: (key: "docs" | "assets") => void;
  onPick: (rel: string) => void;
  canInsert: boolean;
}) {
  if (!resources) {
    return <div className="bld-res-loading">Scanning files…</div>;
  }

  const Section = ({
    kind,
    label,
    items,
  }: {
    kind: "docs" | "assets";
    label: string;
    items: { rel: string; name: string }[];
  }) => {
    const isOpen = open[kind];
    return (
      <div className="bld-res-section">
        <button
          type="button"
          className="bld-res-head"
          onClick={() => onToggle(kind)}
        >
          <IconChevronRight
            size={12}
            className={`bld-res-caret${isOpen ? " bld-res-caret-open" : ""}`}
          />
          <span className="bld-res-label">{label}</span>
          <span className="bld-res-count">{items.length}</span>
        </button>
        {isOpen && (
          <ul className="bld-res-list">
            {items.length === 0 && <li className="bld-res-none">None</li>}
            {items.map((it) => (
              <li key={it.rel}>
                <button
                  type="button"
                  className="bld-res-item"
                  title={canInsert ? `Add ${it.rel} to the chat` : it.rel}
                  onClick={() => onPick(it.rel)}
                  disabled={!canInsert}
                >
                  <IconFile size={12} className="bld-res-icon" />
                  <span className="bld-res-name">{it.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  return (
    <div className="bld-resources">
      <Section kind="docs" label="Docs" items={resources.docs} />
      <Section kind="assets" label="Assets" items={resources.assets} />
      {resources.truncated && (
        <div className="bld-res-trunc">Listing capped, some files hidden.</div>
      )}
    </div>
  );
}
