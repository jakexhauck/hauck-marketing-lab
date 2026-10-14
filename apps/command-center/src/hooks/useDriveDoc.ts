import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { docSections, type SopDocResponse } from "../lib/sopHub";
import type { ColdCallAsset } from "../lib/api";

// Rendering a cold-call document that may live in Google Drive.
//
// Since 0077 a script, an SOP and the objections document are POINTERS: the words
// are written in Google Docs and this app only records which document plays which
// part. A row that has not been pointed anywhere yet still carries its own markup,
// which is what let that change ship without blanking the panel a caller reads
// mid-call.
//
// So there are two sources for one thing, and exactly one place that decides
// between them: `assetHtml` below. Nothing else in the cold-call UI should ever
// read `asset.html` directly, or the fallback rule ends up written five times and
// four of them will drift.
//
// The markup either way has been through a sanitizer server-side (the stored
// column via setterScript.ts on write, the Drive export via sopHtml.ts on render),
// which is what makes it safe to hand to dangerouslySetInnerHTML.

// One rendered Drive document, keyed by file id.
interface DocState {
  html: string;
  loading: boolean;
  error: string | null;
}

const EMPTY: DocState = { html: "", loading: false, error: null };

/**
 * Fetch and cache rendered Drive documents by file id.
 *
 * Pass every file id the surface might show, so switching between four script
 * variations does not re-fetch the one already read. Ids are fetched once per
 * mount; a Doc edited in Drive mid-call is not worth a poll on this surface,
 * because the caller is on the phone and a document changing under them while
 * they read it is worse than a slightly stale one. Reopening the page refetches.
 */
export function useDriveDocs(fileIds: readonly (string | null)[]): Record<string, DocState> {
  const [docs, setDocs] = useState<Record<string, DocState>>({});
  // Mirrors `docs` so the effect can check what is already held without taking
  // `docs` as a dependency, which would make it re-run on its own writes.
  const held = useRef<Record<string, DocState>>({});

  // A stable key for the id set, so the effect fires when the SET changes rather
  // than on every render that rebuilds the array literal.
  const wanted = [...new Set(fileIds.filter((id): id is string => Boolean(id)))].sort();
  const key = wanted.join(",");

  useEffect(() => {
    let cancelled = false;
    const missing = wanted.filter((id) => !held.current[id]);
    if (missing.length === 0) return;

    // Mark them all in flight in one write, so four variations opening at once
    // is one render rather than four.
    const pending: Record<string, DocState> = {};
    for (const id of missing) pending[id] = { ...EMPTY, loading: true };
    held.current = { ...held.current, ...pending };
    setDocs(held.current);

    void Promise.all(
      missing.map(async (id) => {
        try {
          const doc = await api<SopDocResponse>(`/api/admin/sops/doc/${id}`);
          // A Doc's tabs come back as separate sections. Joined for these
          // surfaces: a script is read start to finish, and a contents rail
          // inside a 440px floating panel would cost more than it gives.
          const html = docSections(doc)
            .map((s) => s.html)
            .join("\n");
          return [id, { html, loading: false, error: null }] as const;
        } catch (err) {
          return [
            id,
            {
              html: "",
              loading: false,
              error: err instanceof Error ? err.message : "Could not open that document",
            },
          ] as const;
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      const next = { ...held.current };
      for (const [id, state] of results) next[id] = state;
      held.current = next;
      setDocs(next);
    });

    return () => {
      cancelled = true;
    };
    // `key` is the id set reduced to a primitive; `wanted` is derived from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return docs;
}

/** What one document renders as, given the Drive cache. The only place the Drive-or-stored rule lives. */
export function assetHtml(
  asset: Pick<ColdCallAsset, "html" | "driveFileId"> | null | undefined,
  docs: Record<string, DocState>,
): DocState {
  if (!asset) return EMPTY;
  if (!asset.driveFileId) return { html: asset.html, loading: false, error: null };
  return docs[asset.driveFileId] ?? { ...EMPTY, loading: true };
}
