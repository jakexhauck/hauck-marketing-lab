import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { ColdCallAsset } from "../../../lib/api";
import {
  useColdCallAssetsQuery,
  useCreateColdCallAsset,
  useDeleteColdCallAsset,
} from "../../../hooks/useColdCallAssets";
import { groupByCategory } from "../../../../functions/lib/coldCallAssets";
import AssetEditor from "./AssetEditor";

// Cold Call > Management: the owner writing what a caller reads.
//
// Two pages use this one panel, because they are the same job with a different
// audience and moment:
//   kind="asset" the mid-call shelf, opened in the floating panel.
//   kind="sop"   how the job is done, read on its own page before and between
//                calls (0061).
// A second near-identical file would have been two places to fix every bug in
// adding, renaming, deleting and grouping a document.
//
// The headings are typed rather than chosen from a list this app ships, which is
// the point: adding "Voicemail" should be Jake's afternoon, not a migration and
// a deploy.
//
// The category field offers what already exists as suggestions but accepts
// anything, so the common case is one click and a new heading is still one
// sentence away. Matching is case and space insensitive server-side, so
// "Objection handling" typed twice slightly differently stays one section rather
// than quietly becoming two that look identical.

// The wording per kind. Kept beside the component rather than passed in from
// every call site, so the two pages cannot drift into describing the same
// mechanism two different ways.
const DEFAULT_COPY: Record<"asset" | "sop", AssetsPanelCopy> = {
  asset: {
    heading: "Objection handling and everything else",
    blurb:
      "Anything a caller needs to reach for mid-call. It opens in the same floating panel as the script, so nobody leaves the call to find it. Name the sections whatever you want.",
    addLabel: "Add a document",
    namePlaceholder: 'Name it, e.g. "We already have an agency"',
    categoryPlaceholder: "Section, e.g. Objection handling",
    emptyText: "Nothing here yet. Objection handling is the usual first one.",
    editorSubtitle: "Read from the floating panel mid-call. Saves as you type.",
  },
  sop: {
    heading: "Standard operating procedures",
    blurb:
      "How the job is done, for the team to read before and between calls rather than during one. Everyone with a cold calling login gets their own SOPs page and sees these the moment you save.",
    addLabel: "Add an SOP",
    namePlaceholder: 'Name it, e.g. "Logging a call outcome"',
    categoryPlaceholder: "Section, e.g. Daily routine",
    emptyText:
      "No SOPs yet. The first one is usually how to work the day's list start to finish.",
    editorSubtitle:
      "Visible on the team's SOPs page as soon as it saves. Saves as you type.",
  },
};

export interface AssetsPanelCopy {
  heading: string;
  blurb: string;
  addLabel: string;
  namePlaceholder: string;
  categoryPlaceholder: string;
  emptyText: string;
  editorSubtitle: string;
}

export default function AssetsPanel({
  kind = "asset",
  copy,
}: {
  kind?: "asset" | "sop";
  copy?: Partial<AssetsPanelCopy>;
}) {
  const text: AssetsPanelCopy = { ...DEFAULT_COPY[kind], ...copy };
  const query = useColdCallAssetsQuery();
  const create = useCreateColdCallAsset();
  const remove = useDeleteColdCallAsset();

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const assets = useMemo(
    () => (query.data?.assets ?? []).filter((a) => a.kind === kind && !a.archivedAt),
    [query.data, kind],
  );

  const groups = useMemo(() => groupByCategory(assets), [assets]);
  const knownCategories = useMemo(
    () => [...new Set(groups.map((g) => g.category))].filter((c) => c !== "Uncategorised"),
    [groups],
  );

  const add = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const res = await create.mutateAsync({
        kind,
        name: trimmed,
        category: category.trim(),
      });
      setName("");
      setAdding(false);
      setError(null);
      setOpenId(res.asset.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that");
    }
  };

  const doDelete = async (asset: ColdCallAsset) => {
    try {
      await remove.mutateAsync(asset.id);
      if (openId === asset.id) setOpenId(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove that");
    }
  };

  return (
    <section className="rounded-[var(--radius-lg)] border border-border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold">{text.heading}</h3>
          <p className="mt-1 max-w-[62ch] text-[13px] text-muted">{text.blurb}</p>
        </div>
        <button type="button" className="pk-link" onClick={() => setAdding((v) => !v)}>
          <Plus size={14} aria-hidden />
          {text.addLabel}
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
            placeholder={text.namePlaceholder}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Document name"
            autoFocus
          />
          <input
            className="pk-input !w-auto"
            // Per kind, so the SOP form never suggests a mid-call heading.
            list={`cold-call-${kind}-categories`}
            placeholder={text.categoryPlaceholder}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Section"
          />
          <datalist id={`cold-call-${kind}-categories`}>
            {knownCategories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <button type="submit" className="pk-btn-save" disabled={!name.trim() || create.isPending}>
            {create.isPending ? "Adding..." : "Add"}
          </button>
          <button type="button" className="pk-btn-cancel" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </form>
      )}

      {error && <p className="mt-3 text-[12.5px] text-danger">{error}</p>}

      {query.isLoading ? (
        <p className="mt-4 text-[13px] text-muted">Loading...</p>
      ) : query.isError ? (
        <p className="mt-4 text-[13px] text-danger">Could not load these.</p>
      ) : groups.length === 0 ? (
        <p className="mt-4 text-[13px] text-muted">{text.emptyText}</p>
      ) : (
        groups.map((group) => (
          <div key={group.category} className="mt-5">
            <h4 className="text-[11.5px] font-semibold uppercase tracking-wider text-muted">
              {group.category}
            </h4>
            <ul className="mt-2 flex flex-col gap-2">
              {group.items.map((asset) => (
                <li key={asset.id}>
                  <div
                    className={`flex flex-wrap items-center gap-3 rounded-[var(--radius)] border px-4 py-3 ${
                      openId === asset.id ? "border-brand" : "border-divider"
                    }`}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left text-[14px] font-semibold"
                      onClick={() => setOpenId(openId === asset.id ? null : asset.id)}
                    >
                      {asset.name}
                    </button>
                    <button
                      type="button"
                      className="pk-link"
                      onClick={() => void doDelete(asset)}
                      disabled={remove.isPending}
                      aria-label={`Delete ${asset.name}`}
                    >
                      <Trash2 size={13} aria-hidden />
                      Delete
                    </button>
                  </div>
                  {openId === asset.id && (
                    <AssetEditor
                      asset={asset}
                      subtitle={text.editorSubtitle}
                      onDone={() => setOpenId(null)}
                    />
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
