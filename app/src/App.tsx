import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { AppPane } from "./components/AppPane";
import { ClientsPage } from "./components/ClientsPage";
import { FolderPicker } from "./components/FolderPicker";
import { SettingsPage } from "./components/SettingsPage";
import { UpdaterPrompt } from "./components/UpdaterPrompt";
import "./components/MainDashboard/main-dashboard.css";
import {
  decodePaneStateFromHash,
  encodePaneStateToUrl,
  popoutWindowLabel,
} from "./lib/popout";
import { api } from "./lib/tauri";
import type { ClientEntry, ClientStatus, FolderSummary } from "./lib/types";

const DEFAULT_CLIENT: ClientEntry = {
  slug: "willis-windows",
  name: "Willis Windows",
  status: "pre-launch",
};

const MIN_PANE_WIDTH = 480;
const DEFAULT_SPLIT_FRACTION = 0.5;

type PaneEntry = {
  id: string;
  clientSlug: string;
};

const ONBOARDING_DISMISS_KEY = "hml-onboarding-dismissed-v1";

export default function App() {
  const detached = useMemo(() => decodePaneStateFromHash(), []);
  const isDetachedWindow = detached.kind === "detached";

  const [bootError, setBootError] = useState<string | null>(null);
  const [root, setRoot] = useState<string | null>(null);
  const [summary, setSummary] = useState<FolderSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [bootDone, setBootDone] = useState(false);
  const [_clientStatusGlobal, setClientStatusGlobal] = useState<ClientStatus>("pre-launch");

  const [clients, setClients] = useState<ClientEntry[]>([DEFAULT_CLIENT]);
  const [activeClientSlug, setActiveClientSlug] = useState<string>(DEFAULT_CLIENT.slug);
  const [clientsPageOpen, setClientsPageOpen] = useState(false);
  const [clientsPageStartInAdd, setClientsPageStartInAdd] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [defaultAgentSlug, setDefaultAgentSlug] = useState<string | null>(null);

  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"idle" | "ok" | "error">("idle");
  const [syncTooltip, setSyncTooltip] = useState<string>("Sync with GitHub");
  const syncTimerRef = useRef<number | null>(null);

  const [onboardingDismissed, setOnboardingDismissed] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(ONBOARDING_DISMISS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const dismissOnboarding = useCallback((slug: string) => {
    setOnboardingDismissed((prev) => {
      const next = { ...prev, [slug]: true };
      try {
        localStorage.setItem(ONBOARDING_DISMISS_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);
  const restoreOnboarding = useCallback((slug: string) => {
    setOnboardingDismissed((prev) => {
      if (!prev[slug]) return prev;
      const next = { ...prev };
      delete next[slug];
      try {
        localStorage.setItem(ONBOARDING_DISMISS_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // ── Pane array. Single pane by default; split appends a second.
  const [panes, setPanes] = useState<PaneEntry[]>(() => {
    if (isDetachedWindow) {
      return [{ id: "detached", clientSlug: detached.slug ?? DEFAULT_CLIENT.slug }];
    }
    return [{ id: "primary", clientSlug: DEFAULT_CLIENT.slug }];
  });
  const [splitFraction, setSplitFraction] = useState<number>(DEFAULT_SPLIT_FRACTION);
  const dragRef = useRef<{ startX: number; startFrac: number } | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);

  const loadFolder = useCallback(
    async (path: string, clientSlugOverride?: string) => {
      setRefreshing(true);
      try {
        const next = await api.parseFolder(path);
        setSummary(next);
        let latestClients: ClientEntry[] = [];
        try {
          latestClients = await api.listClients(path);
          if (latestClients.length === 0) latestClients = [DEFAULT_CLIENT];
          setClients(latestClients);
        } catch {
          latestClients = [DEFAULT_CLIENT];
          setClients(latestClients);
        }
        const resolvedSlug =
          clientSlugOverride ??
          (latestClients.some((c) => c.slug === activeClientSlug)
            ? activeClientSlug
            : latestClients[0]?.slug ?? DEFAULT_CLIENT.slug);
        try {
          const status = await api.readClientStatus(path, resolvedSlug);
          setClientStatusGlobal(status);
        } catch {
          setClientStatusGlobal("pre-launch");
        }
        setBootError(null);
        return next;
      } catch (e) {
        setBootError(String(e));
        return null;
      } finally {
        setRefreshing(false);
      }
    },
    [activeClientSlug],
  );

  const loadFolderForActive = useCallback(async () => {
    if (!root) return;
    await loadFolder(root);
  }, [root, loadFolder]);

  const onSync = useCallback(async () => {
    if (syncing) return;
    if (!root) {
      setSyncStatus("error");
      setSyncTooltip(
        "No media-buying folder configured on this machine. Open Settings (⚙) and pick the folder first.",
      );
      if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
      syncTimerRef.current = window.setTimeout(() => setSyncStatus("idle"), 5000);
      return;
    }
    setSyncing(true);
    setSyncStatus("idle");
    setSyncTooltip("Syncing with GitHub…");
    try {
      const result = await api.gitSync(root);
      setSyncStatus("ok");
      const stamp = new Date().toLocaleTimeString();
      setSyncTooltip(`${result.summary}\nLast sync: ${stamp}\n\n${result.detail}`);
      await loadFolder(root);
    } catch (e) {
      setSyncStatus("error");
      setSyncTooltip(`Sync failed:\n${String(e)}`);
      console.error("git sync failed", e);
    } finally {
      setSyncing(false);
      if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
      syncTimerRef.current = window.setTimeout(() => setSyncStatus("idle"), 4000);
    }
  }, [root, syncing, loadFolder]);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await api.loadConfig();
        if (cfg.default_agent_slug) {
          setDefaultAgentSlug(cfg.default_agent_slug);
        }
        if (cfg.media_buying_path) {
          setRoot(cfg.media_buying_path);
          const persistedSlug = cfg.active_client_slug ?? undefined;
          if (persistedSlug) {
            setActiveClientSlug(persistedSlug);
            setPanes((prev) =>
              prev.map((p, idx) =>
                idx === 0 ? { ...p, clientSlug: detached.slug ?? persistedSlug } : p,
              ),
            );
          }
          await loadFolder(cfg.media_buying_path, persistedSlug ?? undefined);
        }
      } catch (e) {
        setBootError(String(e));
      } finally {
        setBootDone(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // refresh on window focus
  useEffect(() => {
    if (!root) return;
    let unlisten: (() => void) | null = null;
    (async () => {
      const win = getCurrentWindow();
      unlisten = await win.onFocusChanged(({ payload: focused }) => {
        if (focused) {
          loadFolder(root);
        }
      });
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, [root, loadFolder]);

  // refresh folder summary when chats are written or vault changes
  useEffect(() => {
    if (!root) return;
    let unlisten: (() => void) | null = null;
    (async () => {
      unlisten = await api.onDataChanged((evt) => {
        if (
          evt.kind === "chat" ||
          evt.kind === "client" ||
          evt.kind === "vault"
        ) {
          loadFolder(root);
        }
      });
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, [root, loadFolder]);

  // Phase 4: file-watcher sync. Install once root is known and listen for
  // cross-pane vault changes so data hooks refetch.
  useEffect(() => {
    if (!root) return;
    let unlisten: (() => void) | null = null;
    (async () => {
      try {
        await api.watchRoot(root);
      } catch (e) {
        console.warn("watch_root failed", e);
      }
      try {
        unlisten = await api.onVaultChanged((evt) => {
          // Coarse refresh of the global folder summary + clients on any
          // vault hit. Pane-level components also subscribe directly for
          // narrower refetches (e.g. client status).
          if (
            evt.kind === "client" ||
            evt.kind === "about" ||
            evt.kind === "ops" ||
            evt.kind === "clients"
          ) {
            loadFolder(root);
          }
        });
      } catch (e) {
        console.warn("onVaultChanged subscribe failed", e);
      }
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, [root, loadFolder]);

  // Detached-window: listen for a "return to main" event sent by ourselves.
  // The main window listens for `pane://return` and re-attaches the pane.
  useEffect(() => {
    if (isDetachedWindow) return;
    let unlisten: (() => void) | null = null;
    (async () => {
      const win = getCurrentWindow();
      unlisten = await win.listen<{ slug: string }>("pane://return", (evt) => {
        const slug = evt.payload?.slug ?? activeClientSlug;
        setPanes((prev) => {
          if (prev.length >= 2) return prev;
          return [...prev, { id: `pane-${Date.now()}`, clientSlug: slug }];
        });
      });
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, [isDetachedWindow, activeClientSlug]);

  const onFolderPicked = async (path: string) => {
    setRoot(path);
    await api.saveConfig({
      media_buying_path: path,
      active_client_slug: activeClientSlug,
      default_agent_slug: defaultAgentSlug ?? null,
    });
    await loadFolder(path);
  };

  const onClientsChanged = (next: ClientEntry[]) => {
    setClients(next.length === 0 ? [DEFAULT_CLIENT] : next);
    if (!next.some((c) => c.slug === activeClientSlug) && next[0]) {
      setActiveClientSlug(next[0].slug);
      setPanes((prev) =>
        prev.map((p, idx) => (idx === 0 ? { ...p, clientSlug: next[0].slug } : p)),
      );
    }
  };

  // ── Pane-level callbacks ────────────────────────────────
  const onActiveClientChanged = useCallback(
    async (paneIdx: number, slug: string, persist: boolean) => {
      setPanes((prev) =>
        prev.map((p, idx) => (idx === paneIdx ? { ...p, clientSlug: slug } : p)),
      );
      if (persist) {
        setActiveClientSlug(slug);
        if (root) {
          try {
            await api.saveConfig({
              media_buying_path: root,
              active_client_slug: slug,
              default_agent_slug: defaultAgentSlug ?? null,
            });
          } catch (e) {
            console.error("persist active client failed", e);
          }
          await loadFolder(root, slug);
        }
      }
    },
    [root, defaultAgentSlug, loadFolder],
  );

  const onOpenAddClient = useCallback(() => {
    setClientsPageStartInAdd(true);
    setClientsPageOpen(true);
  }, []);

  const onOpenManageClients = useCallback(() => {
    setClientsPageStartInAdd(false);
    setClientsPageOpen(true);
  }, []);

  const onOpenSettings = useCallback(() => {
    setClientsPageOpen(false);
    setSettingsOpen(true);
  }, []);

  // ── Split / pop-out / drag-to-tear-off ────────────────────
  const onSplit = useCallback(() => {
    setPanes((prev) => {
      if (prev.length >= 2) return prev;
      // Option C: inherit active client, blank dashboard view (default).
      return [...prev, { id: `pane-${Date.now()}`, clientSlug: prev[0]?.clientSlug ?? activeClientSlug }];
    });
    setSplitFraction(DEFAULT_SPLIT_FRACTION);
  }, [activeClientSlug]);

  const onClosePane = useCallback((idx: number) => {
    setPanes((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  }, []);

  const onPopOut = useCallback(
    async (idx: number) => {
      const pane = panes[idx];
      if (!pane) return;
      try {
        const label = popoutWindowLabel();
        const url = encodePaneStateToUrl({ kind: "detached", slug: pane.clientSlug });
        new WebviewWindow(label, {
          url,
          title: "Hauck Marketing Lab — Detached",
          width: 1200,
          height: 900,
        });
        // Remove popped pane from main window if not the primary.
        if (idx !== 0) {
          setPanes((prev) => prev.filter((_, i) => i !== idx));
        }
      } catch (err) {
        console.error("pop out failed", err);
      }
    },
    [panes],
  );

  const onReturnFromDetached = useCallback(async () => {
    try {
      const slug = panes[0]?.clientSlug ?? activeClientSlug;
      // Find the main window and emit pane://return with the slug.
      // Tauri doesn't directly emit to a named window from JS pre-2; use
      // the global emitter via the current window's app handle.
      const win = getCurrentWindow();
      await win.emitTo("main", "pane://return", { slug });
      await win.close();
    } catch (err) {
      console.error("return to main failed", err);
    }
  }, [panes, activeClientSlug]);

  // ── Drag divider ─────────────────────────────────────────
  const onDividerMouseDown = (e: React.MouseEvent) => {
    if (panes.length < 2) return;
    e.preventDefault();
    const shell = shellRef.current;
    if (!shell) return;
    dragRef.current = { startX: e.clientX, startFrac: splitFraction };
    const shellRect = shell.getBoundingClientRect();
    const totalW = shellRect.width;

    const onMove = (mv: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = mv.clientX - dragRef.current.startX;
      let next = dragRef.current.startFrac + dx / totalW;
      const minFrac = MIN_PANE_WIDTH / totalW;
      const maxFrac = 1 - minFrac;
      if (next < minFrac) next = minFrac;
      if (next > maxFrac) next = maxFrac;
      setSplitFraction(next);
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // ── Renders ──────────────────────────────────────────────
  if (!bootDone) {
    return (
      <div className="picker-shell">
        <div style={{ fontFamily: "var(--mono)", color: "var(--text-faint)", letterSpacing: "0.16em" }}>
          BOOTING…
        </div>
      </div>
    );
  }

  if (!root || !summary) {
    return (
      <FolderPicker
        initialError={bootError}
        onPicked={onFolderPicked}
      />
    );
  }

  if (summary.agents.length === 0) {
    return (
      <FolderPicker
        initialError={`No agents found in ${summary.root}/agents. Check that the folder contains agents/*.md files.`}
        onPicked={onFolderPicked}
      />
    );
  }

  // Full-screen global overlays — render instead of panes.
  if (clientsPageOpen) {
    return (
      <>
        <ClientsPage
          root={root}
          clients={clients}
          activeSlug={activeClientSlug}
          onClose={() => setClientsPageOpen(false)}
          onClientsChanged={onClientsChanged}
          onSelectClient={(slug) => {
            setActiveClientSlug(slug);
            setPanes((prev) =>
              prev.map((p, idx) => (idx === 0 ? { ...p, clientSlug: slug } : p)),
            );
            setClientsPageOpen(false);
          }}
          startInAddMode={clientsPageStartInAdd}
        />
        <UpdaterPrompt />
      </>
    );
  }
  if (settingsOpen) {
    const mainClient = clients.find((c) => c.slug === activeClientSlug) ?? clients[0] ?? DEFAULT_CLIENT;
    return (
      <>
        <SettingsPage
          root={root}
          agents={summary.agents}
          clients={clients}
          defaultAgentSlug={defaultAgentSlug}
          activeClientSlug={mainClient.slug}
          activeClientName={mainClient.name}
          onClose={() => setSettingsOpen(false)}
          onFolderChanged={async (path) => {
            setRoot(path);
            await loadFolder(path);
          }}
          onDefaultAgentChanged={(slug) => setDefaultAgentSlug(slug)}
          onManageClients={() => {
            setSettingsOpen(false);
            setClientsPageStartInAdd(false);
            setClientsPageOpen(true);
          }}
        />
        <UpdaterPrompt />
      </>
    );
  }

  const canSplit = !isDetachedWindow && panes.length < 2;
  const isSplit = panes.length >= 2;

  return (
    <>
      <div
        ref={shellRef}
        className={`hml-pane-shell${isSplit ? " hml-pane-shell--split" : ""}`}
        style={
          isSplit
            ? {
                gridTemplateColumns: `${splitFraction * 100}% 6px ${(1 - splitFraction) * 100}%`,
              }
            : undefined
        }
      >
        {panes.map((pane, idx) => {
          const primary = idx === 0;
          return (
            <>
              {idx > 0 && (
                <div
                  key={`divider-${idx}`}
                  className="hml-pane-divider"
                  onMouseDown={onDividerMouseDown}
                  title="Drag to resize"
                  role="separator"
                />
              )}
              <AppPane
                key={pane.id}
                paneId={pane.id}
                isPrimary={primary}
                isDetached={isDetachedWindow}
                root={root}
                summary={summary}
                clients={clients}
                defaultAgentSlug={defaultAgentSlug}
                syncing={syncing}
                syncStatus={syncStatus}
                syncTooltip={syncTooltip}
                refreshing={refreshing}
                initialClientSlug={pane.clientSlug}
                onboardingDismissed={onboardingDismissed}
                dismissOnboarding={dismissOnboarding}
                restoreOnboarding={restoreOnboarding}
                onActiveClientChanged={(slug, persist) =>
                  onActiveClientChanged(idx, slug, persist)
                }
                loadFolder={loadFolderForActive}
                onSync={onSync}
                onOpenSettings={onOpenSettings}
                onOpenAddClient={onOpenAddClient}
                onOpenManageClients={onOpenManageClients}
                canSplit={primary && canSplit}
                onSplit={primary && canSplit ? onSplit : undefined}
                onClosePane={!primary && !isDetachedWindow ? () => onClosePane(idx) : undefined}
                onPopOut={!isDetachedWindow && !primary ? () => onPopOut(idx) : undefined}
                onReturnToMain={isDetachedWindow && primary ? onReturnFromDetached : undefined}
              />
            </>
          );
        })}
      </div>
      <UpdaterPrompt />
    </>
  );
}
