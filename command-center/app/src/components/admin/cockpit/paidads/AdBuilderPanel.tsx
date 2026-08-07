import { useState } from "react";
import { Plus } from "lucide-react";
import type { AdBatchKind } from "../../../../../functions/lib/adBatches";
import { useAdBatchesQuery, useCreateAdBatch } from "../../../../hooks/useApi";
import { ErrorNote, Segmented, Spinner } from "../../../../routes/paid-ads/trackerShared";
import AdBatchCard from "./AdBatchCard";
import AdBatchMaster from "./AdBatchMaster";

// Paid Ads > Ad Builder, in the Fulfillment cockpit (0088).
//
// Where an ad is WRITTEN. Everything else under Paid Ads reports on ads that
// already exist: Meta's numbers, GHL's leads, the finished files in Drive. This
// is the step before all of that, and until now it lived in a notes app.
//
// Three views behind one tab rather than three tabs of their own. Static and
// Video are the same job done twice with different fields, and Master is those
// two lists read back; putting all three in the cockpit's top row would have
// stood them beside the four CLIENT pages as though they were the same kind of
// thing, which they are not. Nothing here is client-reachable.
//
// The view is component state, not a URL param. A sub-tab already rides in
// ?sub=, and a second one under it would make a link into this panel a link
// nobody can read.

type View = AdBatchKind | "master";

const VIEWS: { id: View; label: string }[] = [
  { id: "static", label: "Static" },
  { id: "video", label: "Video" },
  { id: "master", label: "Master" },
];

const BLURB: Record<View, string> = {
  static: "Competitors, angles and the three that launch. One round per batch.",
  video: "Same, plus the hook and the script that gets read out.",
  master: "Everything written for this client, static and video. Read only.",
};

export default function AdBuilderPanel({ tenantId }: { tenantId: string }) {
  const [view, setView] = useState<View>("static");

  // Master asks for both kinds, so it is a different query key and a different
  // request. Cheap, and it keeps "what is on this page" honest rather than
  // filtering a list the page did not ask for.
  const kind = view === "master" ? undefined : view;
  const query = useAdBatchesQuery(tenantId, kind);
  const create = useCreateAdBatch(tenantId);

  // The batch just created, so it opens on arrival instead of appearing as one
  // more collapsed row the operator then has to find and click.
  const [openId, setOpenId] = useState<string | null>(null);

  const batches = query.data?.batches ?? [];

  const startBatch = () => {
    if (view === "master") return;
    create.mutate({ kind: view }, { onSuccess: ({ batch }) => setOpenId(batch.id) });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Segmented options={VIEWS} value={view} onChange={setView} label="Ad builder view" />
          <p className="text-[12px] text-faint">{BLURB[view]}</p>
        </div>

        {view !== "master" && (
          <button
            type="button"
            onClick={startBatch}
            disabled={create.isPending}
            className="flex shrink-0 items-center gap-1.5 rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-1.5 text-[12.5px] font-semibold text-text transition-colors hover:border-brand disabled:opacity-50"
          >
            <Plus size={14} />
            New {view} batch
          </button>
        )}
      </div>

      {create.isError && (
        <p className="text-[12.5px] text-danger">
          {(create.error as Error | null)?.message ?? "Could not start a batch."}
        </p>
      )}

      {query.isError ? (
        <ErrorNote message={(query.error as Error | null)?.message} />
      ) : query.isLoading && !query.data ? (
        <Spinner />
      ) : batches.length === 0 ? (
        <Empty view={view} />
      ) : view === "master" ? (
        <AdBatchMaster batches={batches} />
      ) : (
        <div className="flex flex-col gap-2">
          {batches.map((batch) => (
            <AdBatchCard
              // Keyed by id so a card's draft belongs to one row and cannot be
              // inherited by whatever takes its place in the list.
              key={batch.id}
              tenantId={tenantId}
              batch={batch}
              open={openId === batch.id}
              onToggle={() => setOpenId(openId === batch.id ? null : batch.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Empty({ view }: { view: View }) {
  const line =
    view === "master"
      ? "Nothing has been written for this client yet. Start on Static or Video."
      : `No ${view} batches yet. Press New to write one.`;
  return (
    <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-[13px] text-faint">
      {line}
    </div>
  );
}
