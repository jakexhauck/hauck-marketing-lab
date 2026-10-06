import { useEffect, useRef, useState } from "react";
import type { AdWorkspace, AdWorkspacePatch } from "../../../../../functions/lib/adWorkspace";
import { useAdWorkspaceQuery, useUpdateAdWorkspace } from "../../../../hooks/useApi";
import { ErrorNote, Spinner } from "../../../../routes/paid-ads/trackerShared";
import AdCopyPanel from "./AdCopyPanel";

// Paid Ads > Copy & Angles (0091): competitors, angles, three primaries, three
// headlines, over ONE workspace row per client.
//
// Since 2026-10-06 (Jake) this is its own Paid Ads page. The Ad Builder's other
// two views split off: Lead Form is its own page (LeadFormsPanel, mounted
// straight from PaidAdsTab) and the Ads list was dropped. The workspace's ads
// block is still in the table, just no longer edited anywhere.
//
// The draft lives here and is handed to AdCopyPanel with a way to give one
// block back, so a save only ever touches the keys it sent.

export default function AdBuilderPanel({ tenantId }: { tenantId: string }) {
  const query = useAdWorkspaceQuery(tenantId);
  const update = useUpdateAdWorkspace(tenantId);

  const server = query.data?.workspace ?? null;

  const [draft, setDraft] = useState<AdWorkspace | null>(null);
  // What the server last confirmed. Every "did this actually change" question
  // is asked against this, never against the draft.
  const saved = useRef<AdWorkspace | null>(null);

  // Switching client must not carry the previous one's text across, and must
  // not leave the old draft on screen while the new one loads.
  useEffect(() => {
    setDraft(null);
    saved.current = null;
  }, [tenantId]);

  // Adopt the server's answer once, when it arrives for a client we have no
  // draft for. Deliberately NOT re-adopted on every response: that would
  // overwrite whatever is being typed.
  useEffect(() => {
    if (!server) return;
    if (draft && draft.tenantId === server.tenantId) return;
    setDraft(server);
    saved.current = server;
  }, [server, draft]);

  const save = (patch: AdWorkspacePatch, opts?: { fold?: boolean }) => {
    update.mutate(patch, {
      onSuccess: ({ workspace }) => {
        // saved.current always moves: it is the record of what the table holds,
        // and the "did this change" test is asked against it whether or not the
        // draft was folded.
        saved.current = workspace;
        // fold:false leaves the draft exactly as typed. Used by lists that can
        // hold a blank row the server would drop. See SaveBlock.
        if (opts?.fold === false) return;
        // Fold the server's cleaned version back in: a pasted "facebook.com/x"
        // comes back as "https://facebook.com/x" and the box should show what
        // was actually kept. ONLY the keys that were sent are touched, so a
        // block still being typed is left alone.
        setDraft((d) => {
          if (!d) return workspace;
          const next: Record<string, unknown> = { ...d };
          const fresh = workspace as unknown as Record<string, unknown>;
          for (const key of Object.keys(patch)) {
            // Indexed write across a union of block types. The key came off the
            // patch, so it names the same field on both objects.
            next[key] = fresh[key];
          }
          return next as unknown as AdWorkspace;
        });
      },
    });
  };

  const saveError = update.isError
    ? ((update.error as Error | null)?.message ?? "Could not save that.")
    : null;

  return (
    <div className="flex flex-col gap-4">
      {query.isError ? (
        <ErrorNote message={(query.error as Error | null)?.message} />
      ) : !draft || !saved.current ? (
        <Spinner />
      ) : (
        <>
          <AdCopyPanel
            draft={draft}
            saved={saved.current}
            setDraft={(fn) => setDraft((d) => (d ? fn(d) : d))}
            save={save}
          />

          {/* A save that failed has to be visible: everything else about these
              pages is silent, so silence must only ever mean success. */}
          {saveError && (
            <p className="text-[12.5px] text-danger">
              {saveError} Your text is still on screen, try leaving the box again.
            </p>
          )}
        </>
      )}
    </div>
  );
}
