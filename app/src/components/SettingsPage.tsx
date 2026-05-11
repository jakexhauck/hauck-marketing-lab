import { useEffect, useState } from "react";
import { openPath } from "@tauri-apps/plugin-opener";
import { ClientCredentials } from "./ClientCredentials";
import { api } from "../lib/tauri";
import type { AgentSummary, ClaudeCheck, ClientEntry } from "../lib/types";

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
};

const APP_VERSION = "0.1.0";

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
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claude, setClaude] = useState<ClaudeCheck | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const c = await api.checkClaude();
        setClaude(c);
      } catch {
        setClaude(null);
      }
    })();
  }, []);

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

  const handleOpenBacklog = async () => {
    try {
      // BACKLOG.md lives in the project root, one level up from the media-buying folder.
      // Try the sibling path first; fall back to opening just the root if that fails.
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
    <main className="main" style={{ position: "relative" }}>
      <section className="clients-page reveal reveal-1">
        <header className="clients-page-head">
          <div>
            <div className="clients-page-eye">PREFERENCES</div>
            <h1 className="clients-page-title">Settings</h1>
            <p className="clients-page-sub">
              Reconfigure folder, default agent, and clients. Everything here writes to the
              local <code>config.json</code>; nothing leaves the machine.
            </p>
          </div>
          <button className="panel-edit" onClick={onClose}>
            ← BACK
          </button>
        </header>

        {error && <div className="clients-page-err">{error}</div>}

        <div className="settings-sections">
          {/* Folder ─────────────────────────────────────── */}
          <div className="settings-section">
            <div className="settings-section-head">
              <div className="settings-section-eye">FOLDER</div>
              <div className="settings-section-title">Media-buying folder</div>
            </div>
            <div className="settings-section-body">
              <div className="settings-path-row">
                <code className="settings-path">{root}</code>
                <button
                  className="kpi-form-btn"
                  onClick={handleChangeFolder}
                  disabled={busy}
                >
                  {busy ? "Picking…" : "Change folder…"}
                </button>
              </div>
              <p className="settings-note">
                The folder is the source of truth for agents, skills, knowledge, and chats.
                Changing it reloads everything.
              </p>
            </div>
          </div>

          {/* Default agent ─────────────────────────────── */}
          <div className="settings-section">
            <div className="settings-section-head">
              <div className="settings-section-eye">DEFAULT AGENT</div>
              <div className="settings-section-title">Who opens when you summon the dock</div>
            </div>
            <div className="settings-section-body">
              <ul className="settings-radio-list">
                {agents.map((a) => {
                  const checked = a.slug === resolvedDefaultSlug;
                  return (
                    <li key={a.slug}>
                      <button
                        type="button"
                        className={`settings-radio${checked ? " checked" : ""}`}
                        onClick={() => handleSelectDefaultAgent(a.slug)}
                        aria-pressed={checked}
                      >
                        <span className="settings-radio-dot" aria-hidden="true" />
                        <span className="settings-radio-name">{a.name}</span>
                        {a.role && (
                          <span className="settings-radio-role">{a.role}</span>
                        )}
                        <span className="settings-radio-slug">{a.slug}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          {/* Clients ─────────────────────────────────────── */}
          <div className="settings-section">
            <div className="settings-section-head">
              <div className="settings-section-eye">CLIENTS</div>
              <div className="settings-section-title">Client registry</div>
            </div>
            <div className="settings-section-body">
              <div className="settings-inline-row">
                <span className="settings-inline-text">
                  {clients.length} client{clients.length === 1 ? "" : "s"} on file.
                </span>
                <button className="kpi-form-btn" onClick={onManageClients}>
                  Manage clients →
                </button>
              </div>
            </div>
          </div>

          {/* Client credentials ──────────────────────────── */}
          <ClientCredentials
            root={root}
            clientSlug={activeClientSlug}
            clientName={activeClientName}
          />

          {/* Shortcuts ───────────────────────────────────── */}
          <div className="settings-section">
            <div className="settings-section-head">
              <div className="settings-section-eye">SHORTCUTS</div>
              <div className="settings-section-title">Keyboard</div>
            </div>
            <div className="settings-section-body">
              <ul className="settings-shortcut-list">
                <li>
                  <span className="settings-shortcut-keys">
                    <kbd>⌘K</kbd>
                    <span className="settings-shortcut-sep">/</span>
                    <kbd>Ctrl+K</kbd>
                  </span>
                  <span className="settings-shortcut-label">Command palette</span>
                </li>
              </ul>
              <p className="settings-note">Shortcut customization coming later.</p>
            </div>
          </div>

          {/* About ───────────────────────────────────────── */}
          <div className="settings-section">
            <div className="settings-section-head">
              <div className="settings-section-eye">ABOUT</div>
              <div className="settings-section-title">Build info</div>
            </div>
            <div className="settings-section-body">
              <dl className="settings-meta">
                <div className="settings-meta-row">
                  <dt>App version</dt>
                  <dd>
                    <code>{APP_VERSION}</code>
                  </dd>
                </div>
                <div className="settings-meta-row">
                  <dt>Claude Code</dt>
                  <dd>
                    {claude == null ? (
                      <code>checking…</code>
                    ) : claude.found ? (
                      <code>{claude.version ?? "installed"}</code>
                    ) : (
                      <code className="settings-meta-missing">not found</code>
                    )}
                  </dd>
                </div>
                <div className="settings-meta-row">
                  <dt>Data folder</dt>
                  <dd>
                    <button
                      type="button"
                      className="settings-meta-link"
                      onClick={handleOpenDataFolder}
                      title="Open in file explorer"
                    >
                      <code>{root}</code>
                    </button>
                  </dd>
                </div>
                <div className="settings-meta-row">
                  <dt>Backlog</dt>
                  <dd>
                    <button
                      type="button"
                      className="settings-meta-link"
                      onClick={handleOpenBacklog}
                    >
                      <code>BACKLOG.md →</code>
                    </button>
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
