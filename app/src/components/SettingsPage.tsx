import { useEffect, useState } from "react";
import { openPath } from "@tauri-apps/plugin-opener";
import { AboutSettings } from "./AboutSettings";
import { ClientCredentials } from "./ClientCredentials";
import { GhlSettings } from "./GhlSettings";
import { api } from "../lib/tauri";
import { checkForUpdates, installAndRestart } from "../lib/updater";
import type { Update } from "@tauri-apps/plugin-updater";
import type { AgentSummary, ClaudeCheck, ClientEntry } from "../lib/types";
import { IconArrowRight } from "./icons";

type Props = {
  root: string;
  agents: AgentSummary[];
  clients: ClientEntry[];
  defaultAgentSlug: string | null;
  activeClientSlug: string;
  activeClientName: string;
  onClose: () => void;
  onFolderChanged: (path: string) => Promise<void> | void;
  onDefaultAgentChanged: (slug: string) => void;
  onManageClients: () => void;
  onClientsChanged: (next: ClientEntry[]) => void;
};

const APP_VERSION = "0.1.1";

export function SettingsPage({
  root,
  agents,
  clients,
  defaultAgentSlug,
  activeClientSlug,
  activeClientName,
  onClose,
  onFolderChanged,
  onDefaultAgentChanged,
  onManageClients,
  onClientsChanged,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claude, setClaude] = useState<ClaudeCheck | null>(null);
  const [editingDriveSlug, setEditingDriveSlug] = useState<string | null>(null);
  const [driveDraft, setDriveDraft] = useState("");
  const [driveBusySlug, setDriveBusySlug] = useState<string | null>(null);
  const [geminiKeyDraft, setGeminiKeyDraft] = useState("");
  const [geminiKeySaved, setGeminiKeySaved] = useState<string | null>(null);
  const [geminiSaving, setGeminiSaving] = useState(false);
  const [geminiReveal, setGeminiReveal] = useState(false);
  const [replicateKeyDraft, setReplicateKeyDraft] = useState("");
  const [replicateKeySaved, setReplicateKeySaved] = useState<string | null>(null);
  const [replicateSaving, setReplicateSaving] = useState(false);
  const [replicateReveal, setReplicateReveal] = useState(false);

  type UpdateUiState =
    | { phase: "idle" }
    | { phase: "checking" }
    | { phase: "up-to-date" }
    | { phase: "no-releases-yet" }
    | { phase: "available"; update: Update }
    | { phase: "installing" }
    | { phase: "error"; message: string };
  const [updateState, setUpdateState] = useState<UpdateUiState>({ phase: "idle" });

  const handleCheckForUpdates = async () => {
    setUpdateState({ phase: "checking" });
    const result = await checkForUpdates();
    if (result.kind === "available") {
      setUpdateState({ phase: "available", update: result.update });
    } else if (result.kind === "up-to-date") {
      setUpdateState({ phase: "up-to-date" });
    } else if (result.kind === "no-releases-yet") {
      setUpdateState({ phase: "no-releases-yet" });
    } else {
      setUpdateState({ phase: "error", message: result.message });
    }
  };

  const handleInstallUpdate = async () => {
    if (updateState.phase !== "available") return;
    const { update } = updateState;
    setUpdateState({ phase: "installing" });
    try {
      await installAndRestart(update);
    } catch (e) {
      setUpdateState({ phase: "error", message: String(e) });
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const c = await api.checkClaude();
        setClaude(c);
      } catch {
        setClaude(null);
      }
    })();
    (async () => {
      try {
        const cfg = await api.loadConfig();
        setGeminiKeySaved(cfg.gemini_api_key ?? null);
        setReplicateKeySaved(cfg.replicate_api_token ?? null);
      } catch {
        setGeminiKeySaved(null);
        setReplicateKeySaved(null);
      }
    })();
  }, []);

  const handleSaveGeminiKey = async () => {
    setError(null);
    setGeminiSaving(true);
    try {
      const cfg = await api.loadConfig();
      const next = { ...cfg, gemini_api_key: geminiKeyDraft.trim() || null };
      await api.saveConfig(next);
      setGeminiKeySaved(next.gemini_api_key);
      setGeminiKeyDraft("");
    } catch (e) {
      setError(String(e));
    } finally {
      setGeminiSaving(false);
    }
  };

  const handleClearGeminiKey = async () => {
    setError(null);
    setGeminiSaving(true);
    try {
      const cfg = await api.loadConfig();
      const next = { ...cfg, gemini_api_key: null };
      await api.saveConfig(next);
      setGeminiKeySaved(null);
      setGeminiKeyDraft("");
    } catch (e) {
      setError(String(e));
    } finally {
      setGeminiSaving(false);
    }
  };

  const handleSaveReplicateKey = async () => {
    setError(null);
    setReplicateSaving(true);
    try {
      const cfg = await api.loadConfig();
      const next = { ...cfg, replicate_api_token: replicateKeyDraft.trim() || null };
      await api.saveConfig(next);
      setReplicateKeySaved(next.replicate_api_token);
      setReplicateKeyDraft("");
    } catch (e) {
      setError(String(e));
    } finally {
      setReplicateSaving(false);
    }
  };

  const handleClearReplicateKey = async () => {
    setError(null);
    setReplicateSaving(true);
    try {
      const cfg = await api.loadConfig();
      const next = { ...cfg, replicate_api_token: null };
      await api.saveConfig(next);
      setReplicateKeySaved(null);
      setReplicateKeyDraft("");
    } catch (e) {
      setError(String(e));
    } finally {
      setReplicateSaving(false);
    }
  };

  const maskedKey = (key: string) =>
    key.length <= 8 ? "•".repeat(key.length) : `${key.slice(0, 4)}…${key.slice(-4)}`;

  const resolvedDefaultSlug =
    defaultAgentSlug && agents.some((a) => a.slug === defaultAgentSlug)
      ? defaultAgentSlug
      : agents[0]?.slug ?? null;

  const handleChangeFolder = async () => {
    setBusy(true);
    setError(null);
    try {
      const picked = await api.pickFolder();
      if (picked && picked !== root) {
        await api.saveConfig({
          media_buying_path: picked,
          active_client_slug: activeClientSlug,
          default_agent_slug: defaultAgentSlug ?? null,
        });
        await onFolderChanged(picked);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleSelectDefaultAgent = async (slug: string) => {
    if (slug === resolvedDefaultSlug) return;
    setError(null);
    try {
      await api.saveConfig({
        media_buying_path: root,
        active_client_slug: activeClientSlug,
        default_agent_slug: slug,
      });
      onDefaultAgentChanged(slug);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleStartEditDrive = (slug: string, current: string | null | undefined) => {
    setEditingDriveSlug(slug);
    setDriveDraft(current ?? "");
    setError(null);
  };

  const handleCancelEditDrive = () => {
    setEditingDriveSlug(null);
    setDriveDraft("");
  };

  const handleSaveDrive = async (slug: string) => {
    setDriveBusySlug(slug);
    setError(null);
    try {
      const trimmed = driveDraft.trim();
      await api.setClientDriveFolder(root, slug, trimmed || null);
      const next = await api.listClients(root);
      onClientsChanged(next);
      setEditingDriveSlug(null);
      setDriveDraft("");
    } catch (e) {
      setError(String(e));
    } finally {
      setDriveBusySlug(null);
    }
  };

  const handleOpenBacklog = async () => {
    try {
      const parts = root.replace(/\\/g, "/").split("/");
      parts.pop();
      const projectRoot = parts.join("/");
      const sep = root.includes("\\") ? "\\" : "/";
      const candidate = `${projectRoot.replace(/\//g, sep)}${sep}BACKLOG.md`;
      await openPath(candidate);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleOpenDataFolder = async () => {
    try {
      await openPath(root);
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="md-root hml-app">
      <style>{settingsCSS}</style>
      <main className="hml-main hml-main-standalone">
        <header className="hml-topbar">
          <div className="hml-breadcrumb">
            <span className="hml-seg">Workspace</span>
            <span className="hml-sep">/</span>
            <span className="hml-current">Settings</span>
          </div>
          <div className="hml-topbar-right">
            <button
              type="button"
              className="hml-btn hml-ghost"
              onClick={onClose}
            >
              ← Back
            </button>
          </div>
        </header>

        <div className="hml-content">
          <section className="hml-page-header">
            <div>
              <div className="hml-page-eyebrow">
                <span className="hml-eyebrow-dot" />
                Preferences
              </div>
              <h1 className="hml-page-title">Settings</h1>
              <div className="hml-page-subtitle">
                Reconfigure folder, default agent, and clients. Everything here
                writes to the local <code>config.json</code>; nothing leaves the
                machine.
              </div>
            </div>
          </section>

          {error && <div className="hml-error-banner">{error}</div>}

          {/* Folder ───────────────────────────────────────── */}
          <section className="hml-panel set-panel">
            <div className="hml-panel-header">
              <div className="hml-panel-title">
                <span className="hml-dot" />
                Media-buying folder
              </div>
            </div>
            <div className="hml-panel-body set-body">
              <div className="set-path-row">
                <code className="set-path">{root}</code>
                <button
                  type="button"
                  className="hml-btn"
                  onClick={handleChangeFolder}
                  disabled={busy}
                >
                  {busy ? "Picking…" : "Change folder…"}
                </button>
              </div>
              <p className="set-note">
                The folder is the source of truth for agents, skills, knowledge,
                and chats. Changing it reloads everything.
              </p>
            </div>
          </section>

          {/* About ────────────────────────────────────────── */}
          <AboutSettings root={root} />

          {/* Default agent ────────────────────────────────── */}
          <section className="hml-panel set-panel">
            <div className="hml-panel-header">
              <div className="hml-panel-title">
                <span
                  className="hml-dot"
                  style={{ background: "var(--hml-blue)" }}
                />
                Default agent
              </div>
              <span className="hml-panel-action">
                Opens when you summon the dock
              </span>
            </div>
            <div className="hml-panel-body set-body">
              <ul className="set-radio-list">
                {agents.map((a) => {
                  const checked = a.slug === resolvedDefaultSlug;
                  return (
                    <li key={a.slug}>
                      <button
                        type="button"
                        className={`set-radio${checked ? " checked" : ""}`}
                        onClick={() => handleSelectDefaultAgent(a.slug)}
                        aria-pressed={checked}
                      >
                        <span className="set-radio-dot" aria-hidden="true" />
                        <span className="set-radio-name">{a.name}</span>
                        {a.role && (
                          <span className="set-radio-role">{a.role}</span>
                        )}
                        <span className="set-radio-slug">{a.slug}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>

          {/* Clients ──────────────────────────────────────── */}
          <section className="hml-panel set-panel">
            <div className="hml-panel-header">
              <div className="hml-panel-title">
                <span
                  className="hml-dot"
                  style={{ background: "var(--hml-plum)" }}
                />
                Client registry
              </div>
            </div>
            <div className="hml-panel-body set-body">
              <div className="set-inline-row">
                <span className="set-inline-text">
                  {clients.length} client{clients.length === 1 ? "" : "s"} on
                  file.
                </span>
                <button
                  type="button"
                  className="hml-btn"
                  onClick={onManageClients}
                >
                  Manage clients
                  <IconArrowRight size={12} />
                </button>
              </div>
            </div>
          </section>

          {/* Client Drive folders ────────────────────────── */}
          <section className="hml-panel set-panel">
            <div className="hml-panel-header">
              <div className="hml-panel-title">
                <span
                  className="hml-dot"
                  style={{ background: "var(--hml-blue)" }}
                />
                Client Drive folders
              </div>
              <span className="hml-panel-action">
                Where each client's docs, briefs, and reports get saved
              </span>
            </div>
            <div className="hml-panel-body set-body">
              {clients.length === 0 ? (
                <p className="set-note" style={{ margin: 0 }}>
                  No clients yet. Add one via Manage clients.
                </p>
              ) : (
                <ul className="set-drive-list">
                  {clients.map((c) => {
                    const isEditing = editingDriveSlug === c.slug;
                    const rowBusy = driveBusySlug === c.slug;
                    return (
                      <li key={c.slug} className="set-drive-row">
                        <div className="set-drive-meta">
                          <span className="set-drive-name">{c.name}</span>
                          <span className="set-drive-slug">{c.slug}</span>
                        </div>
                        {isEditing ? (
                          <div className="set-drive-edit">
                            <input
                              type="text"
                              className="set-path"
                              placeholder="https://drive.google.com/drive/folders/…"
                              value={driveDraft}
                              onChange={(e) => setDriveDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveDrive(c.slug);
                                if (e.key === "Escape") handleCancelEditDrive();
                              }}
                              disabled={rowBusy}
                              autoFocus
                            />
                            <button
                              type="button"
                              className="hml-btn hml-accent"
                              onClick={() => handleSaveDrive(c.slug)}
                              disabled={rowBusy}
                            >
                              {rowBusy ? "Saving…" : "Save"}
                            </button>
                            <button
                              type="button"
                              className="hml-btn hml-ghost"
                              onClick={handleCancelEditDrive}
                              disabled={rowBusy}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : c.drive_folder_url ? (
                          <div className="set-drive-view">
                            <code
                              className="set-code set-drive-url"
                              title={c.drive_folder_url}
                            >
                              {c.drive_folder_url}
                            </code>
                            <button
                              type="button"
                              className="hml-btn hml-ghost"
                              onClick={() =>
                                handleStartEditDrive(c.slug, c.drive_folder_url)
                              }
                            >
                              Edit
                            </button>
                          </div>
                        ) : (
                          <div className="set-drive-view">
                            <span className="set-inline-text set-drive-empty">
                              No folder set
                            </span>
                            <button
                              type="button"
                              className="hml-btn"
                              onClick={() => handleStartEditDrive(c.slug, "")}
                            >
                              + Set folder
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="set-note">
                Paste the full Google Drive folder URL. Changes persist to{" "}
                <code>media-buying/data/clients.yaml</code>.
              </p>
            </div>
          </section>

          {/* Client credentials ───────────────────────────── */}
          <ClientCredentials
            root={root}
            clientSlug={activeClientSlug}
            clientName={activeClientName}
          />

          {/* GoHighLevel ──────────────────────────────────── */}
          <GhlSettings />

          {/* Google AI Studio (Nano Banana 2) ─────────────── */}
          <section className="hml-panel set-panel">
            <div className="hml-panel-header">
              <div className="hml-panel-title">
                <span
                  className="hml-dot"
                  style={{ background: "var(--hml-accent)" }}
                />
                Google AI Studio
              </div>
              <span className="hml-panel-action">
                Powers the Static Ad Creative Builder
              </span>
            </div>
            <div className="hml-panel-body set-body">
              {geminiKeySaved ? (
                <div className="set-inline-row">
                  <span className="set-inline-text">
                    Key saved:{" "}
                    <code className="set-code">
                      {geminiReveal ? geminiKeySaved : maskedKey(geminiKeySaved)}
                    </code>
                  </span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      className="hml-btn"
                      onClick={() => setGeminiReveal((v) => !v)}
                    >
                      {geminiReveal ? "Hide" : "Reveal"}
                    </button>
                    <button
                      type="button"
                      className="hml-btn"
                      onClick={handleClearGeminiKey}
                      disabled={geminiSaving}
                    >
                      {geminiSaving ? "Clearing…" : "Clear"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="set-path-row">
                  <input
                    type="password"
                    className="set-path"
                    style={{ whiteSpace: "normal" }}
                    placeholder="Paste your Google AI Studio API key…"
                    value={geminiKeyDraft}
                    onChange={(e) => setGeminiKeyDraft(e.target.value)}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="hml-btn"
                    onClick={handleSaveGeminiKey}
                    disabled={geminiSaving || !geminiKeyDraft.trim()}
                  >
                    {geminiSaving ? "Saving…" : "Save key"}
                  </button>
                </div>
              )}
              <p className="set-note">
                Get a key at{" "}
                <code>aistudio.google.com/apikey</code>. Stored locally in{" "}
                <code>config.json</code>, never synced. Legacy path; the
                Creative Studio uses Replicate (below).
              </p>
            </div>
          </section>

          {/* Replicate (Creative Studio) ──────────────────── */}
          <section className="hml-panel set-panel">
            <div className="hml-panel-header">
              <div className="hml-panel-title">
                <span
                  className="hml-dot"
                  style={{ background: "var(--hml-teal)" }}
                />
                Replicate
              </div>
              <span className="hml-panel-action">
                Powers the Creative Studio playground
              </span>
            </div>
            <div className="hml-panel-body set-body">
              {replicateKeySaved ? (
                <div className="set-inline-row">
                  <span className="set-inline-text">
                    Token saved:{" "}
                    <code className="set-code">
                      {replicateReveal
                        ? replicateKeySaved
                        : maskedKey(replicateKeySaved)}
                    </code>
                  </span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      className="hml-btn"
                      onClick={() => setReplicateReveal((v) => !v)}
                    >
                      {replicateReveal ? "Hide" : "Reveal"}
                    </button>
                    <button
                      type="button"
                      className="hml-btn"
                      onClick={handleClearReplicateKey}
                      disabled={replicateSaving}
                    >
                      {replicateSaving ? "Clearing…" : "Clear"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="set-path-row">
                  <input
                    type="password"
                    className="set-path"
                    style={{ whiteSpace: "normal" }}
                    placeholder="Paste your Replicate API token (r8_...)"
                    value={replicateKeyDraft}
                    onChange={(e) => setReplicateKeyDraft(e.target.value)}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="hml-btn"
                    onClick={handleSaveReplicateKey}
                    disabled={replicateSaving || !replicateKeyDraft.trim()}
                  >
                    {replicateSaving ? "Saving…" : "Save token"}
                  </button>
                </div>
              )}
              <p className="set-note">
                Get a token at{" "}
                <code>replicate.com/account/api-tokens</code>. Stored locally in{" "}
                <code>config.json</code>, never synced. Powers the Creative
                Studio playground (search any model on Replicate, run, save the
                output to a client folder).
              </p>
            </div>
          </section>

          {/* Shortcuts ────────────────────────────────────── */}
          <section className="hml-panel set-panel">
            <div className="hml-panel-header">
              <div className="hml-panel-title">
                <span
                  className="hml-dot"
                  style={{ background: "var(--hml-teal)" }}
                />
                Keyboard shortcuts
              </div>
            </div>
            <div className="hml-panel-body set-body">
              <ul className="set-shortcut-list">
                <li>
                  <span className="set-shortcut-keys">
                    <kbd className="hml-kbd">⌘K</kbd>
                    <span className="set-shortcut-sep">/</span>
                    <kbd className="hml-kbd">Ctrl+K</kbd>
                  </span>
                  <span className="set-shortcut-label">Command palette</span>
                </li>
              </ul>
              <p className="set-note">Shortcut customization coming later.</p>
            </div>
          </section>

          {/* Build info ──────────────────────────────────── */}
          <section className="hml-panel set-panel">
            <div className="hml-panel-header">
              <div className="hml-panel-title">
                <span
                  className="hml-dot"
                  style={{ background: "var(--hml-neutral)" }}
                />
                Build info
              </div>
            </div>
            <div className="hml-panel-body set-body">
              <dl className="set-meta">
                <div className="set-meta-row">
                  <dt>App version</dt>
                  <dd>
                    <code className="set-code">{APP_VERSION}</code>
                  </dd>
                </div>
                <div className="set-meta-row">
                  <dt>Updates</dt>
                  <dd className="set-meta-updates">
                    <button
                      type="button"
                      className="hml-btn"
                      onClick={handleCheckForUpdates}
                      disabled={
                        updateState.phase === "checking" ||
                        updateState.phase === "installing"
                      }
                    >
                      {updateState.phase === "checking"
                        ? "Checking…"
                        : "Check for updates"}
                    </button>
                    {updateState.phase === "up-to-date" && (
                      <span className="set-meta-note">
                        You're on the latest version.
                      </span>
                    )}
                    {updateState.phase === "no-releases-yet" && (
                      <span className="set-meta-note">
                        No releases published yet.
                      </span>
                    )}
                    {updateState.phase === "available" && (
                      <>
                        <span className="set-meta-note">
                          v{updateState.update.version} available
                        </span>
                        <button
                          type="button"
                          className="hml-btn hml-accent"
                          onClick={handleInstallUpdate}
                        >
                          Install & restart
                        </button>
                      </>
                    )}
                    {updateState.phase === "installing" && (
                      <span className="set-meta-note">Installing…</span>
                    )}
                    {updateState.phase === "error" && (
                      <span className="set-meta-error">
                        {updateState.message}
                      </span>
                    )}
                  </dd>
                </div>
                <div className="set-meta-row">
                  <dt>Claude Code</dt>
                  <dd>
                    {claude == null ? (
                      <code className="set-code">checking…</code>
                    ) : claude.found ? (
                      <code className="set-code">
                        {claude.version ?? "installed"}
                      </code>
                    ) : (
                      <code className="set-code set-code-missing">
                        not found
                      </code>
                    )}
                  </dd>
                </div>
                <div className="set-meta-row">
                  <dt>Data folder</dt>
                  <dd>
                    <button
                      type="button"
                      className="set-link"
                      onClick={handleOpenDataFolder}
                      title="Open in file explorer"
                    >
                      <code className="set-code">{root}</code>
                    </button>
                  </dd>
                </div>
                <div className="set-meta-row">
                  <dt>Backlog</dt>
                  <dd>
                    <button
                      type="button"
                      className="set-link"
                      onClick={handleOpenBacklog}
                    >
                      <code className="set-code">BACKLOG.md →</code>
                    </button>
                  </dd>
                </div>
              </dl>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

const settingsCSS = `
.hml-main-standalone {
  height: 100vh;
  overflow-y: auto;
  position: relative;
  z-index: 1;
}

.hml-topbar {
  height: 44px;
  border-bottom: 1px solid var(--hml-border-subtle);
  background: rgba(13, 13, 17, 0.85);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  padding: 0 22px;
  position: sticky;
  top: 0;
  z-index: 10;
}

.hml-breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--hml-font-mono);
  font-size: 11px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--hml-text-tertiary);
}

.hml-breadcrumb .hml-seg { color: var(--hml-text-tertiary); }
.hml-breadcrumb .hml-sep { color: var(--hml-text-quaternary); }
.hml-breadcrumb .hml-current { color: var(--hml-text-primary); }

.hml-topbar-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
}

.hml-error-banner {
  margin-bottom: 18px;
  padding: 11px 14px;
  border: 1px solid var(--hml-red-border);
  background: var(--hml-red-bg);
  color: var(--hml-red);
  border-radius: 8px;
  font-size: 13px;
}

.set-panel { margin-bottom: 18px; }
.set-body { padding: 14px 18px 16px; }

.set-note {
  font-size: 12.5px;
  color: var(--hml-text-tertiary);
  line-height: 1.55;
  margin: 10px 0 0;
}

.set-path-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.set-path {
  flex: 1;
  min-width: 200px;
  font-family: var(--hml-font-mono);
  font-size: 12px;
  color: var(--hml-text-secondary);
  background: var(--hml-bg-elev-2);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 6px;
  padding: 8px 11px;
  white-space: nowrap;
  overflow-x: auto;
}

.set-radio-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.set-radio {
  width: 100%;
  display: grid;
  grid-template-columns: 16px 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: var(--hml-bg-elev-2);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 8px;
  color: var(--hml-text-primary);
  font-family: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease;
}

.set-radio:hover {
  background: var(--hml-bg-elev-3);
  border-color: var(--hml-border);
}

.set-radio.checked {
  border-color: var(--hml-accent-border);
  background: var(--hml-accent-dim);
}

.set-radio-dot {
  width: 14px; height: 14px;
  border-radius: 50%;
  border: 1.5px solid var(--hml-border-strong);
  background: transparent;
  position: relative;
  flex-shrink: 0;
}

.set-radio.checked .set-radio-dot {
  border-color: var(--hml-accent);
}
.set-radio.checked .set-radio-dot::after {
  content: '';
  position: absolute;
  inset: 3px;
  border-radius: 50%;
  background: var(--hml-accent);
}

.set-radio-name {
  font-weight: 500;
  color: var(--hml-text-primary);
}

.set-radio-role {
  color: var(--hml-text-tertiary);
  font-size: 11.5px;
  margin-left: 8px;
}

.set-radio-slug {
  font-family: var(--hml-font-mono);
  font-size: 10.5px;
  color: var(--hml-text-quaternary);
  letter-spacing: 0.02em;
}

.set-inline-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
}

.set-inline-text {
  font-size: 13px;
  color: var(--hml-text-secondary);
}

.set-shortcut-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.set-shortcut-list li {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 4px 0;
}

.set-shortcut-keys {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.set-shortcut-sep {
  color: var(--hml-text-quaternary);
  font-size: 11px;
}

.set-shortcut-label {
  font-size: 13px;
  color: var(--hml-text-secondary);
}

.set-meta {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.set-meta-row {
  display: grid;
  grid-template-columns: 130px 1fr;
  align-items: center;
  gap: 14px;
  padding: 8px 0;
  border-bottom: 1px solid var(--hml-border-subtle);
}
.set-meta-row:last-child { border-bottom: none; }

.set-meta-row dt {
  font-family: var(--hml-font-mono);
  font-size: 10.5px;
  color: var(--hml-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.set-meta-row dd {
  margin: 0;
  font-size: 13px;
  color: var(--hml-text-primary);
}

.set-meta-updates {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.set-meta-note {
  font-size: 12.5px;
  color: var(--hml-text-tertiary);
}

.set-meta-error {
  font-size: 12.5px;
  color: var(--hml-red);
}

.set-code {
  font-family: var(--hml-font-mono);
  font-size: 11.5px;
  color: var(--hml-text-secondary);
  background: var(--hml-bg-elev-2);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 4px;
  padding: 2px 6px;
}

.set-code-missing {
  color: var(--hml-red);
  border-color: var(--hml-red-border);
  background: var(--hml-red-bg);
}

.set-link {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font: inherit;
  color: inherit;
  text-align: left;
}
.set-link:hover .set-code {
  color: var(--hml-accent);
  border-color: var(--hml-accent-border);
}

.set-drive-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.set-drive-row {
  display: grid;
  grid-template-columns: 180px 1fr;
  align-items: center;
  gap: 14px;
  padding: 10px 12px;
  background: var(--hml-bg-elev-2);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 8px;
}

.set-drive-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.set-drive-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--hml-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.set-drive-slug {
  font-family: var(--hml-font-mono);
  font-size: 10.5px;
  color: var(--hml-text-quaternary);
  letter-spacing: 0.02em;
}

.set-drive-view,
.set-drive-edit {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.set-drive-url {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.set-drive-empty {
  flex: 1;
  color: var(--hml-text-tertiary);
  font-style: italic;
}
`;
