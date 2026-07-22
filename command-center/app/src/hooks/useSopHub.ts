// Data for the Operations pillar's SOPs tab. The tree comes live from Google
// Drive; a Doc's rendered body is fetched only when it is opened and then kept
// for the session, so reopening an SOP is instant.
//
// Plain api() + useState, matching the rest of the admin console; the admin side
// does not use react-query. Triage ticks are optimistic with rollback, reusing
// the existing /api/admin/sop-flags endpoint unchanged.

import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { flagKey } from "../lib/sopTriage";
import type { SopCategory, SopDocResponse, SopHubStatus, SopTreeResponse } from "../lib/sopHub";

export interface UseSopHub {
  categories: SopCategory[];
  status: SopHubStatus;
  loading: boolean;
  error: string | null;
  considered: Set<string>;
  toggleFlag: (catKey: string, slug: string) => Promise<void>;
  // Rendered Docs by Drive file id, populated on open.
  docs: Record<string, SopDocResponse>;
  docLoading: string | null;
  docError: string | null;
  openDoc: (fileId: string) => Promise<void>;
}

export function useSopHub(): UseSopHub {
  const [categories, setCategories] = useState<SopCategory[]>([]);
  const [status, setStatus] = useState<SopHubStatus>("ok");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [considered, setConsidered] = useState<Set<string>>(new Set());
  const [docs, setDocs] = useState<Record<string, SopDocResponse>>({});
  const [docLoading, setDocLoading] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const tree = await api<SopTreeResponse>("/api/admin/sops");
        if (cancelled) return;
        setCategories(tree.categories ?? []);
        setStatus(tree.status ?? "ok");
        if (tree.error) setError(tree.error);
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          setError(err instanceof Error ? err.message : "Could not load SOPs");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
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

  const openDoc = useCallback(
    async (fileId: string) => {
      setDocError(null);
      if (docs[fileId]) return;
      setDocLoading(fileId);
      try {
        const doc = await api<SopDocResponse>(`/api/admin/sops/doc/${fileId}`);
        setDocs((prev) => ({ ...prev, [fileId]: doc }));
      } catch (err) {
        setDocError(err instanceof Error ? err.message : "Could not open that SOP");
      } finally {
        setDocLoading(null);
      }
    },
    [docs],
  );

  return { categories, status, loading, error, considered, toggleFlag, docs, docLoading, docError, openDoc };
}
