import { useEffect, useRef, useState } from "react";
import type { AdWorkspace, AdWorkspacePatch } from "../../../../../functions/lib/adWorkspace";
import { useAdWorkspaceQuery, useUpdateAdWorkspace } from "../../../../hooks/useApi";
import { ErrorNote, Segmented, Spinner } from "../../../../routes/paid-ads/trackerShared";
import AdCopyPanel from "./AdCopyPanel";
import AdsListPanel from "./AdsListPanel";
import LeadFormsPanel from "./LeadFormsPanel";

// Paid Ads > Ad Builder, in the Fulfillment cockpit (0091).
//
// Three pages over ONE workspace per client:
//
//   Copy & Angles   competitors, angles, three primaries, three headlines
//   Ads             the flat ad list, each a free-text type and a creative
//   Lead Form       Meta Instant Form drafts, its own table and its own list
//
// This replaced the batch (0088/0089): rounds, the static/video split, the hook,
// the script and Master all went. There is no round to pick before anything can
// be written, because there is only ever the current set.
//
// THE DRAFT LIVES HERE, not in the pages. Copy & Angles and Ads write different
// blocks of the same row, and a draft owned per page would mean switching tabs
// mid-edit either loses the block or saves it twice. The pages are handed the
// draft and a way to give one block back.
//
// Lead Form is the exception and owns itself: a different table, a list rather
// than a single row, and nothing shared with the other two.

type View = "copy" | "ads" | "form";

const VIEWS: { id: View; label: string }[] = [
  { id: "copy", label: "Copy & Angles" },
  { id: "ads", label: "Ads" },
  { id: "form", label: "Lead Form" },
];


export default function AdBuilderPanel({ tenantId }: { tenantId: string }) {
  const [view, setView] = useState<View>("copy");

  // Not gated on the view: it is one small request per client and both of the
  // other pages need it the instant they are opened.
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
    setView("copy");
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
        // block being typed on the other page is left alone.
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
      <Segmented options={VIEWS} value={view} onChange={setView} label="Ad builder page" />

      {view === "form" ? (
        <LeadFormsPanel tenantId={tenantId} />
      ) : query.isError ? (
        <ErrorNote message={(query.error as Error | null)?.message} />
      ) : !draft || !saved.current ? (
        <Spinner />
      ) : (
        <>
          {view === "copy" ? (
            <AdCopyPanel
              draft={draft}
              saved={saved.current}
              setDraft={(fn) => setDraft((d) => (d ? fn(d) : d))}
              save={save}
            />
          ) : (
            <AdsListPanel
              tenantId={tenantId}
              draft={draft}
              saved={saved.current}
              setDraft={(fn) => setDraft((d) => (d ? fn(d) : d))}
              save={save}
            />
          )}

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
