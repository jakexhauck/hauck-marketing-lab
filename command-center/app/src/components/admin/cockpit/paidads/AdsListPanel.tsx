import { useState } from "react";
import { ExternalLink, Film, Image as ImageIcon, Link2, Plus, X } from "lucide-react";
import { LIMITS, type AdItem, type AdWorkspace } from "../../../../../functions/lib/adWorkspace";
import type { CreativeFile } from "../../../../lib/api";
import { useAdminCreativesFolderQuery } from "../../../../hooks/useApi";
import { LineInput, SectionLabel } from "./adBuilderShared";
import type { SaveBlock } from "./adBuilderShared";

// Page 2 of 3: Ads (0091).
//
// The flat list of ads for this client. Add one at the bottom, say what type it
// is, link the creative it is made from. That is the whole page.
//
// TYPE IS FREE TEXT and carries what used to be the static/video split: "video"
// is a type here, sitting beside "before and after" and "testimonial". There is
// no dropdown, on purpose, so a format invented on a Tuesday does not wait on a
// deploy. The cost is known: spellings drift and nothing can count them yet.
//
// NO COPY LIVES HERE. The three primaries and three headlines are on Copy &
// Angles and are shared across every ad, because one set of text rotated over
// several creatives is how a round is actually run.
//
// The creative list is the SAME query the Creatives tab uses, keyed by tenant,
// so this page costs no extra Drive call and the two can never disagree about
// what is in the folder.

export default function AdsListPanel({
  tenantId,
  draft,
  saved,
  setDraft,
  save,
}: {
  tenantId: string;
  draft: AdWorkspace;
  saved: AdWorkspace;
  setDraft: (fn: (d: AdWorkspace) => AdWorkspace) => void;
  save: SaveBlock;
}) {
  const folder = useAdminCreativesFolderQuery(tenantId);
  // Which row has its picker open. One at a time: two open grids of the same
  // folder is noise, and the picker is tall.
  const [pickingAt, setPickingAt] = useState<number | null>(null);

  const ads = draft.ads;
  const files = folder.data?.files ?? [];
  const byId = new Map(files.map((f) => [f.id, f]));

  // The server drops an ad with no type AND no creative, so a row added with
  // Add and not yet filled in would be deleted the moment the box was left.
  // Compare what would be SENT, and do not fold the answer back over the row
  // being typed into.
  const commit = (next: AdItem[]) => {
    const value = next.filter((a) => a.type.trim() || a.creativeId);
    if (JSON.stringify(value) === JSON.stringify(saved.ads)) return;
    save({ ads: value }, { fold: false });
  };

  const setAds = (next: AdItem[]) => setDraft((d) => ({ ...d, ads: next }));

  // Typing saves on blur. Linking, unlinking and removing save at once: they
  // are clicks with a visible result, and waiting for a blur that may never
  // come is how a picked image is lost.
  const setType = (i: number, type: string) =>
    setAds(ads.map((a, j) => (j === i ? { ...a, type } : a)));

  const addAd = () => setAds([...ads, { type: "", creativeId: "", creativeName: "" }]);

  const removeAd = (i: number) => {
    const next = ads.filter((_, j) => j !== i);
    setPickingAt(null);
    setAds(next);
    commit(next);
  };

  const link = (i: number, file: CreativeFile) => {
    const next = ads.map((a, j) =>
      j === i ? { ...a, creativeId: file.id, creativeName: file.name } : a,
    );
    setPickingAt(null);
    setAds(next);
    commit(next);
  };

  const unlink = (i: number) => {
    const next = ads.map((a, j) =>
      j === i ? { ...a, creativeId: "", creativeName: "" } : a,
    );
    setAds(next);
    commit(next);
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <SectionLabel hint={ads.length === 0 ? "none yet" : `${ads.length} in the list`}>
          Ads
        </SectionLabel>
        {folder.data?.url && (
          <a
            href={folder.data.url}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-1 text-[12px] font-medium text-brand hover:underline"
          >
            Open folder in Drive
            <ExternalLink size={12} />
          </a>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {ads.map((ad, i) => {
          // Drive is the truth about the file. The stored name is the fallback
          // for a creative that has since been renamed, moved or binned.
          const live = ad.creativeId ? byId.get(ad.creativeId) : undefined;
          const missing =
            Boolean(ad.creativeId) && !live && folder.isSuccess && !folder.data?.error;

          return (
            <div
              key={i}
              className="rounded-[var(--radius)] border border-border bg-surface-2 p-2.5"
            >
              <div className="flex items-start gap-2">
                <span className="mt-2 w-4 shrink-0 font-data text-[12px] font-semibold text-faint tnum">
                  {i + 1}
                </span>

                <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                  <LineInput
                    value={ad.type}
                    onChange={(v) => setType(i, v)}
                    onBlur={() => commit(ads)}
                    placeholder="video, before and after, testimonial"
                    maxLength={LIMITS.adType}
                    ariaLabel={`Ad ${i + 1} type`}
                  />

                  <CreativeSlot
                    ad={ad}
                    live={live}
                    missing={missing}
                    index={i}
                    onOpen={() => setPickingAt(pickingAt === i ? null : i)}
                    onClear={() => unlink(i)}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => removeAd(i)}
                  aria-label={`Remove ad ${i + 1}`}
                  className="mt-2 shrink-0 text-faint transition-colors hover:text-danger"
                >
                  <X size={15} />
                </button>
              </div>

              {pickingAt === i && (
                <CreativePicker
                  files={files}
                  connected={folder.data?.connected ?? false}
                  hasFolder={Boolean(folder.data?.folderId)}
                  error={folder.data?.error ?? null}
                  loading={folder.isLoading}
                  selectedId={ad.creativeId}
                  onPick={(f) => link(i, f)}
                />
              )}
            </div>
          );
        })}

        {ads.length < LIMITS.ads && (
          <button
            type="button"
            onClick={addAd}
            className="flex items-center gap-1.5 self-start rounded-[var(--radius)] border border-dashed border-border px-2.5 py-1.5 text-[12.5px] font-medium text-muted transition-colors hover:border-brand hover:text-brand"
          >
            <Plus size={14} />
            Add ad
          </button>
        )}
      </div>
    </div>
  );
}

// The right-hand half of an ad row: either the linked creative or the button
// that opens the picker.
function CreativeSlot({
  ad,
  live,
  missing,
  index,
  onOpen,
  onClear,
}: {
  ad: AdItem;
  live: CreativeFile | undefined;
  missing: boolean;
  index: number;
  onOpen: () => void;
  onClear: () => void;
}) {
  if (!ad.creativeId) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="flex items-center gap-1.5 rounded-[var(--radius)] border border-dashed border-border px-3 py-2 text-[12.5px] font-medium text-muted transition-colors hover:border-brand hover:text-brand"
      >
        <Link2 size={14} />
        Link creative
      </button>
    );
  }

  const name = live?.name ?? ad.creativeName ?? "";

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-[var(--radius)] border border-border bg-surface px-2 py-1.5">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Change the creative on ad ${index + 1}`}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <Thumb file={live} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-medium text-text">
            {name || "Linked creative"}
          </span>
          {missing && (
            <span className="block text-[11px] text-warning">Not in the folder any more</span>
          )}
        </span>
      </button>

      {live?.webViewLink && (
        <a
          href={live.webViewLink}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={`Open the creative on ad ${index + 1} in Drive`}
          className="shrink-0 text-faint transition-colors hover:text-brand"
        >
          <ExternalLink size={14} />
        </a>
      )}
      <button
        type="button"
        onClick={onClear}
        aria-label={`Unlink the creative on ad ${index + 1}`}
        className="shrink-0 text-faint transition-colors hover:text-danger"
      >
        <X size={14} />
      </button>
    </div>
  );
}

// Drive's thumbnail, falling back to a type icon. The URL is short-lived and can
// fail for ordinary reasons, and a broken image icon reads as the app being
// wrong.
function Thumb({ file }: { file: CreativeFile | undefined }) {
  const [broken, setBroken] = useState(false);
  const Icon = file?.kind === "video" ? Film : ImageIcon;

  if (file?.thumbnailUrl && !broken) {
    return (
      <img
        src={file.thumbnailUrl}
        alt=""
        onError={() => setBroken(true)}
        className="h-8 w-8 shrink-0 rounded object-cover"
      />
    );
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-surface-2 text-faint">
      <Icon size={14} />
    </span>
  );
}

// The folder, as a grid to choose from. Deliberately the whole folder and not
// filtered by the ad's type: which file belongs to which ad is judgement, and a
// filter that guessed wrong would hide the one you wanted.
function CreativePicker({
  files,
  connected,
  hasFolder,
  error,
  loading,
  selectedId,
  onPick,
}: {
  files: CreativeFile[];
  connected: boolean;
  hasFolder: boolean;
  error: string | null;
  loading: boolean;
  selectedId: string;
  onPick: (file: CreativeFile) => void;
}) {
  const note = (text: string) => <p className="px-1 py-3 text-[12.5px] text-faint">{text}</p>;

  return (
    <div className="mt-2.5 rounded-[var(--radius)] border border-border bg-surface p-2.5">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-faint">
        Pick a creative
      </div>

      {loading
        ? note("Reading the folder...")
        : !hasFolder
          ? note("No Drive folder is set for this client. Set one on the Creatives tab.")
          : !connected
            ? note("The agency Google account is not connected, so the folder cannot be listed.")
            : error
              ? note(error)
              : files.length === 0
                ? note("That folder is empty. Upload the creatives in Drive, then reopen this.")
                : (
                    <div className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5">
                      {files.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => onPick(f)}
                          title={f.name}
                          className={
                            "flex flex-col items-center gap-1 rounded-[var(--radius)] border p-1.5 transition-colors " +
                            (f.id === selectedId
                              ? "border-brand bg-surface-2"
                              : "border-border hover:border-brand")
                          }
                        >
                          <PickerThumb file={f} />
                          <span className="w-full truncate text-[10.5px] text-muted">{f.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
    </div>
  );
}

function PickerThumb({ file }: { file: CreativeFile }) {
  const [broken, setBroken] = useState(false);
  const Icon = file.kind === "video" ? Film : ImageIcon;

  if (file.thumbnailUrl && !broken) {
    return (
      <img
        src={file.thumbnailUrl}
        alt=""
        onError={() => setBroken(true)}
        className="aspect-square w-full rounded object-cover"
      />
    );
  }
  return (
    <span className="flex aspect-square w-full items-center justify-center rounded bg-surface-2 text-faint">
      <Icon size={16} />
    </span>
  );
}
