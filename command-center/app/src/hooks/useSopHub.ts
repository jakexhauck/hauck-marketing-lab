// Data for the Operations pillar's SOPs tab. The tree comes live from Google
// Drive; a Doc's rendered body is fetched when it is opened.
//
// Plain api() + useState, matching the rest of the admin console; the admin side
// does not use react-query. Triage ticks are optimistic with rollback, reusing
// the existing /api/admin/sop-flags endpoint unchanged.
//
// "Live" means two things here, and both had gaps:
//
//  1. The TREE. A page load has always read Drive fresh, so a new Doc appeared
//     on navigation. A tab left open never noticed. Now the tree refetches when
//     the tab becomes visible again and on a quiet 60s poll while it is visible,
//     so a Doc added in Drive shows up without a reload.
//
//  2. The BODY. This used to keep a Doc for the session and return early if it
//     was already held, so editing that Doc in Drive and reopening it showed the
//     old text. The server cache is keyed on Drive's modifiedTime and was always
//     right; the client memo was the thing that lied. The cache is now keyed on
//     modifiedTime too, so a changed Doc refetches and an unchanged one stays
//     instant.
//
// A background refresh is silent by design: no spinner, no flicker, and no state
// write at all when nothing in Drive moved.

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { flagKey } from "../lib/sopTriage";
import type { SopCategory, SopDocResponse, SopHubStatus, SopTreeResponse } from "../lib/sopHub";

// How often an open, visible tab re-reads the folder tree. Each poll re-walks
// the Drive folder, which is a handful of Drive calls: fine for an admin-only
// surface with a tab or two open, and well inside Google's per-project quota.
const POLL_MS = 60_000;
// visibilitychange and focus both fire when returning to the tab. This keeps
// that from becoming two requests.
const MIN_REFETCH_MS = 5_000;

// A rendered Doc plus the Drive modifiedTime it was rendered from, which is what
// makes the client cache safe to trust.
interface CachedDoc extends SopDocResponse {
  modifiedTime: string | null;
}

export interface UseSopHub {
  categories: SopCategory[];
  status: SopHubStatus;
  loading: boolean;
  error: string | null;
  // The linked Google account, or null when none is. Drives the "connected as"
  // line, so consenting as the wrong account is visible.
  connectedEmail: string | null;
  considered: Set<string>;
  toggleFlag: (catKey: string, slug: string) => Promise<void>;
  // Rendered Docs by Drive file id, populated on open.
  docs: Record<string, CachedDoc>;
  docLoading: string | null;
  docError: string | null;
  // modifiedTime comes from the tree entry: pass it so a Doc edited in Drive
  // re-renders instead of being served from the previous open.
  openDoc: (fileId: string, modifiedTime: string | null) => Promise<void>;
}

export function useSopHub(): UseSopHub {
  const [categories, setCategories] = useState<SopCategory[]>([]);
  const [status, setStatus] = useState<SopHubStatus>("ok");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);
  const [considered, setConsidered] = useState<Set<string>>(new Set());
  const [docs, setDocs] = useState<Record<string, CachedDoc>>({});
  const [docLoading, setDocLoading] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);

  // Mirrors `docs` so openDoc can read the cache without taking it as a
  // dependency. That keeps openDoc's identity stable, which matters because the
  // reader calls it from an effect: a changing identity there would refire the
  // effect on every fetch.
  const docsRef = useRef<Record<string, CachedDoc>>({});
  // In-flight renders keyed by file + modifiedTime, so two rapid opens of the
  // same Doc share one request rather than racing.
  const inFlight = useRef<Map<string, Promise<void>>>(new Map());

  useEffect(() => {
    let cancelled = false;
    // Compared against the last tree we stored: an unchanged folder must not
    // cause a re-render every minute.
    let lastTreeJson = "";
    let lastFetchAt = 0;

    const load = async (silent: boolean) => {
      if (cancelled) return;
      lastFetchAt = Date.now();
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const tree = await api<SopTreeResponse>("/api/admin/sops");
        if (cancelled) return;
        const nextCategories = tree.categories ?? [];
        const json = JSON.stringify(nextCategories);
        if (json !== lastTreeJson) {
          lastTreeJson = json;
          setCategories(nextCategories);
        }
        setStatus(tree.status ?? "ok");
        setConnectedEmail(tree.connectedEmail ?? null);
        setError(tree.error ?? null);
      } catch (err) {
        // A failed background poll must not wipe SOPs already on screen; only a
        // foreground load is allowed to turn the tab into an error state.
        if (cancelled || silent) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "Could not load SOPs");
      } finally {
        if (!cancelled && !silent) setLoading(false);
      }
    };

    void load(false);

    const refreshIfDue = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastFetchAt < MIN_REFETCH_MS) return;
      void load(true);
    };

    const onVisible = () => refreshIfDue();
    const poll = window.setInterval(() => {
      // Polling a hidden tab burns Drive calls nobody is looking at.
      if (document.visibilityState === "visible") void load(true);
    }, POLL_MS);

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  // Ticks load alongside the tree but must never block it: a flags failure means
  // empty checkboxes, not a broken hub.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { flags } = await api<{ flags: { catKey: string; slug: string }[] }>("/api/admin/sop-flags");
        if (!cancelled) setConsidered(new Set((flags ?? []).map((f) => flagKey(f.catKey, f.slug))));
      } catch {
        // Intentionally silent.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleFlag = useCallback(
    async (catKey: string, slug: string) => {
      const key = flagKey(catKey, slug);
      const next = !considered.has(key);
      setConsidered((prev) => {
        const copy = new Set(prev);
        if (next) copy.add(key);
        else copy.delete(key);
        return copy;
      });
      try {
        await api("/api/admin/sop-flags", {
          method: "POST",
          body: JSON.stringify({ catKey, slug, considered: next }),
        });
      } catch {
        // Roll back to what the server still believes.
        setConsidered((prev) => {
          const copy = new Set(prev);
          if (next) copy.delete(key);
          else copy.add(key);
          return copy;
        });
      }
    },
    [considered],
  );

  const openDoc = useCallback(async (fileId: string, modifiedTime: string | null) => {
    const held = docsRef.current[fileId];
    // Same Doc, same Drive revision: nothing to do.
    if (held && held.modifiedTime === modifiedTime) {
      setDocError(null);
      return;
    }

    const key = `${fileId}@${modifiedTime ?? ""}`;
    const pending = inFlight.current.get(key);
    if (pending) return pending;

    // Re-rendering a Doc already on screen is a silent swap: the reader is being
    // read, and replacing it with "Opening the Doc" for a revision the reader
    // did not ask for is worse than a late update.
    const isRefresh = Boolean(held);

    const run = (async () => {
      setDocError(null);
      if (!isRefresh) setDocLoading(fileId);
      try {
        const doc = await api<SopDocResponse>(`/api/admin/sops/doc/${fileId}`);
        const cached: CachedDoc = { ...doc, modifiedTime };
        docsRef.current = { ...docsRef.current, [fileId]: cached };
        setDocs(docsRef.current);
      } catch (err) {
        // A failed refresh leaves the version already on screen alone rather
        // than blanking an SOP somebody is halfway through.
        if (!isRefresh) setDocError(err instanceof Error ? err.message : "Could not open that SOP");
      } finally {
        inFlight.current.delete(key);
        if (!isRefresh) setDocLoading(null);
      }
    })();

    inFlight.current.set(key, run);
    return run;
  }, []);

  return {
    categories,
    status,
    loading,
    error,
    connectedEmail,
    considered,
    toggleFlag,
    docs,
    docLoading,
    docError,
    openDoc,
  };
}
