import { useMemo, useState } from "react";
import { Archive, ArchiveRestore, Plus, Trophy } from "lucide-react";
import type { ColdCallAsset } from "../../../lib/api";
import {
  useColdCallAssetsQuery,
  useCreateColdCallAsset,
  useUpdateColdCallAsset,
} from "../../../hooks/useColdCallAssets";
import { MIN_DIALS_FOR_RATE, leadingScript } from "../../../../functions/lib/coldCallAssets";
import AssetEditor from "./AssetEditor";

// Cold Call > Settings: the dialing scripts, and how each one is doing.
//
// Four variations of one pitch running against each other. Every number on this
// page is derived from recorded dials (0052 + 0058), so there is deliberately
// nothing on it anybody can type a count into. That is the whole reason the test
// is worth running: the script somebody likes and the script that books meetings
// are allowed to be different, and only one of them can be measured.
//
// The one judgement call worth stating: Jake picks the script rather than the
// app rotating it, so the four will never get equal numbers. A variation under
// MIN_DIALS_FOR_RATE dials therefore shows how far off it is instead of a
// percentage. One booking in four calls is 25% in exactly the way that means
// nothing, and rendering it beside a real rate would let a hunch borrow the
// typography of a result.

export default function ScriptsPanel() {
  const [showArchived, setShowArchived] = useState(false);
  const query = useColdCallAssetsQuery(showArchived);
  const create = useCreateColdCallAsset();
  const update = useUpdateColdCallAsset();

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scripts = useMemo(
    () => (query.data?.assets ?? []).filter((a) => a.kind === "script"),
    [query.data],
  );
  const live = scripts.filter((s) => !s.archivedAt);
  const archived = scripts.filter((s) => s.archivedAt);

  // Only worth naming a winner once at least two variations have enough dials to
  // be compared; see leadingScript.
  const leader = useMemo(() => {
    const stats: Record<string, NonNullable<ColdCallAsset["stats"]>> = {};
    for (const s of live) if (s.stats) stats[s.id] = s.stats;
    return leadingScript(stats);
  }, [live]);

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const res = await create.mutateAsync({ kind: "script", name });
      setNewName("");
      setAdding(false);
      setError(null);
      // Straight into the editor: nobody adds a variation in order to look at
      // its name in a list.
      setOpenId(res.asset.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that");
    }
  };

  const setArchived = async (asset: ColdCallAsset, archived: boolean) => {
    try {
      await update.mutateAsync({ id: asset.id, archived });
      if (openId === asset.id) setOpenId(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change that");
    }
  };

  return (
    <section className="rounded-[var(--radius-lg)] border border-border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold">Dialing scripts</h3>
          <p className="mt-1 max-w-[62ch] text-[13px] text-muted">
            Variations of the same pitch. The caller picks one in the script panel
            and every outcome they press is recorded against it, so these numbers
            are dials that happened rather than anybody&apos;s impression.
          </p>
        </div>
        <button type="button" className="pk-link" onClick={() => setAdding((v) => !v)}>
          <Plus size={14} aria-hidden />
          Add a variation
        </button>
      </div>

      {adding && (
        <form
          className="mt-4 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <input
            className="pk-input !w-auto"
            placeholder="Name it, e.g. Question opener"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            aria-label="Variation name"
            autoFocus
          />
          <button type="submit" className="pk-btn-save" disabled={!newName.trim() || create.isPending}>
            {create.isPending ? "Adding..." : "Add"}
          </button>
          <button type="button" className="pk-btn-cancel" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </form>
      )}

      {error && <p className="mt-3 text-[12.5px] text-danger">{error}</p>}

      {query.isLoading ? (
        <p className="mt-4 text-[13px] text-muted">Loading the scripts...</p>
      ) : query.isError ? (
        <p className="mt-4 text-[13px] text-danger">Could not load the scripts.</p>
      ) : live.length === 0 && archived.length === 0 ? (
        <p className="mt-4 text-[13px] text-muted">
          No scripts yet. Add one and the caller will have something to read.
        </p>
      ) : (
        <>
          <ul className="mt-4 flex flex-col gap-2">
            {live.map((script) => (
              <li key={script.id}>
                <ScriptRow
                  script={script}
                  leading={leader?.id === script.id}
                  open={openId === script.id}
                  onToggle={() => setOpenId(openId === script.id ? null : script.id)}
                  onArchive={() => void setArchived(script, true)}
                />
                {openId === script.id && (
                  <AssetEditor
                    asset={script}
                    subtitle="What the caller reads on the phone. Saves as you type."
                    onDone={() => setOpenId(null)}
                  />
                )}
              </li>
            ))}
          </ul>

          {(archived.length > 0 || showArchived) && (
            <button
              type="button"
              className="pk-link mt-4"
              onClick={() => setShowArchived((v) => !v)}
            >
              {showArchived ? "Hide retired scripts" : "Show retired scripts"}
            </button>
          )}

          {showArchived && archived.length > 0 && (
            <ul className="mt-2 flex flex-col gap-2">
              {archived.map((script) => (
                <li key={script.id} className="opacity-60">
                  <ScriptRow
                    script={script}
                    leading={false}
                    open={false}
                    onToggle={() => void setArchived(script, false)}
                    onRestore={() => void setArchived(script, false)}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function ScriptRow({
  script,
  leading,
  open,
  onToggle,
  onArchive,
  onRestore,
}: {
  script: ColdCallAsset;
  leading: boolean;
  open: boolean;
  onToggle: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
}) {
  const stats = script.stats ?? { dials: 0, pickups: 0, booked: 0, bookingRate: null };

  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--radius)] border px-4 py-3 ${
        open ? "border-brand" : "border-divider"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span className="truncate text-[14px] font-semibold">{script.name}</span>
        {leading && (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{
              background: "color-mix(in srgb, var(--positive) 14%, transparent)",
              color: "var(--positive)",
            }}
            title="Books the most meetings per dial of the variations with enough dials to compare"
          >
            <Trophy size={11} aria-hidden />
            Leading
          </span>
        )}
      </button>

      {/* Counts first, rate second, and only when it has been earned. */}
      <div className="flex items-center gap-4 text-[12.5px] tabular-nums text-muted">
        <Stat value={stats.dials} label="dials" />
        <Stat value={stats.pickups} label="pickups" />
        <Stat value={stats.booked} label="booked" />
      </div>

      <div className="min-w-[124px] text-right">
        {stats.bookingRate === null ? (
          <span className="text-[12px] text-faint">
            {stats.dials === 0
              ? "Not dialed yet"
              : `${MIN_DIALS_FOR_RATE - stats.dials} more dials to judge`}
          </span>
        ) : (
          <>
            <span className="text-[16px] font-semibold tabular-nums">
              {Math.round(stats.bookingRate * 100)}%
            </span>
            <span className="ml-1.5 text-[11.5px] text-muted">booked</span>
          </>
        )}
      </div>

      {onArchive && (
        <button
          type="button"
          className="pk-link"
          onClick={onArchive}
          title="Retire it. Its recorded dials are kept."
        >
          <Archive size={13} aria-hidden />
          Retire
        </button>
      )}
      {onRestore && (
        <button type="button" className="pk-link" onClick={onRestore}>
          <ArchiveRestore size={13} aria-hidden />
          Restore
        </button>
      )}
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <span>
      <span className="font-semibold text-text">{value}</span> {label}
    </span>
  );
}
