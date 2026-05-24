/**
 * CampaignTreeView — editable visualization of the Learning Phase campaign
 * skeleton built by the Ads Sequence.
 *
 * Every cell (campaign budget, ad-set name/targeting/budget, ad format/angle/
 * hook) is an inline input. Edits write through onSkeletonChange and persist
 * on sequenceState.campaignSkeleton. The wizard merges relevant fields into
 * the matching form's prefill (see AdsSequenceWizard chain effect).
 *
 * Read-only status pills at the top (Offer / Copy / Creatives / Structure)
 * reflect which sequence forms have a saved output.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { api } from "../lib/tauri";
import { parseDriveFolders, type DriveFolder } from "../lib/driveIndex";
import {
  defaultCampaignSkeleton,
  isStepDone,
  type AdFormat,
  type CampaignSkeleton,
  type CampaignSkeletonAd,
  type CampaignSkeletonAdSet,
  type SequenceState,
} from "../lib/mediaBuyingSequence";
import type { DocFolderTarget } from "../lib/types";

/** A snippet of copy the user picked from a FormOutput doc that's now waiting
 *  to be dropped into an ad slot. While this is set, the tree enters "pick
 *  mode" — every ad card glows as a target and clicking one inserts the text.
 *  `source` is informational only (used for the banner label). */
export type PendingSnippet = {
  text: string;
  source: "ad_copy";
  /** Optional short tag the picker wrote (e.g. "PAS · urgency"). When set,
   *  the slot click also overwrites the destination ad's angleLabel. */
  angleLabel?: string;
};

/** A static creative (PNG/JPG) the user sent from AdCreativeStudio that's
 *  waiting to be attached to an ad slot. While this is set, the tree enters
 *  pick mode the same way `pendingSnippet` does, but a slot click writes the
 *  creative path/filename/preview onto the ad instead of the hook text. */
export type PendingCreativePick = {
  savedPath: string;
  filename: string;
  /** Inline preview source — remote URL for Replicate, data URI for imports. */
  previewUrl?: string;
};

type Props = {
  clientName: string;
  sequenceState: SequenceState;
  onSkeletonChange: (next: CampaignSkeleton) => void;
  onClose: () => void;
  /** When provided, the "Snapshot to Drive" button is enabled and pushes to
   *  the resolved folder. Without these, the snapshot button is hidden — keeps
   *  CampaignTreeView usable in contexts that don't have a client. */
  root?: string;
  clientSlug?: string;
  /** When set, the tree opens in pick mode: ad cards glow and clicking one
   *  inserts this text into that ad's hook. Cleared by `onCancelPick`. */
  pendingSnippet?: PendingSnippet | null;
  /** Called when the user clicks an ad card in pick mode. Fires AFTER the
   *  skeleton mutation; the wizard uses this to clear pendingSnippet and
   *  flash a toast. */
  onPickSlot?: (adSetIdx: number, adIdx: number) => void;
  /** Called when the user dismisses pick mode without inserting. */
  onCancelPick?: () => void;
  /** When set, the tree opens in pick mode for a static creative; clicking
   *  an ad slot attaches the image to that ad's `creativePath`. Parallels
   *  `pendingSnippet`. */
  pendingCreativePick?: PendingCreativePick | null;
  onPickCreativeSlot?: (adSetIdx: number, adIdx: number) => void;
  onCancelCreativePick?: () => void;
};

const AD_FORMATS: AdFormat[] = ["Image", "Video", "Carousel"];

export function CampaignTreeView({
  clientName,
  sequenceState,
  onSkeletonChange,
  onClose,
  root,
  clientSlug,
  pendingSnippet,
  onPickSlot,
  onCancelPick,
  pendingCreativePick,
  onPickCreativeSlot,
  onCancelCreativePick,
}: Props) {
  const pickMode = Boolean(pendingSnippet) || Boolean(pendingCreativePick);
  const skeleton = sequenceState.campaignSkeleton ?? defaultCampaignSkeleton();

  const briefLocked = isStepDone(sequenceState, "creative-brief");
  const copyReady = isStepDone(sequenceState, "ad-copy");
  const creativesReady = isStepDone(sequenceState, "ad-creative");
  const structureReady = isStepDone(sequenceState, "structure");

  // Snapshot-to-Drive state. Hidden entirely when caller didn't pass root/slug.
  const snapshotEnabled = Boolean(root && clientSlug);
  const canvasRef = useRef<HTMLElement | null>(null);
  const flowRef = useRef<HTMLDivElement | null>(null);
  const [driveFolders, setDriveFolders] = useState<DriveFolder[]>([]);
  const [folderTarget, setFolderTarget] = useState<DocFolderTarget | null>(null);
  const [snapping, setSnapping] = useState(false);
  const [snapDriveUrl, setSnapDriveUrl] = useState<string | null>(null);
  const [snapError, setSnapError] = useState<string | null>(null);
  /** Ad-set indexes that are currently collapsed (ads hidden). Default: all
   *  expanded so the tree opens informative. Click the ad-set header to
   *  toggle. In pick mode (snippet/creative waiting for a slot), all sets
   *  force-expand so Jake can see every target. */
  const [collapsedAdsets, setCollapsedAdsets] = useState<Set<number>>(
    () => new Set(),
  );
  const toggleAdsetCollapsed = (idx: number) => {
    setCollapsedAdsets((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  useEffect(() => {
    if (!snapshotEnabled || !root || !clientSlug) return;
    let cancelled = false;
    void (async () => {
      try {
        const [clients, idx] = await Promise.all([
          api.listClients(root),
          api.readDriveIndex(root, clientSlug),
        ]);
        if (cancelled) return;
        const folders = idx ? parseDriveFolders(idx.body) : [];
        setDriveFolders(folders);
        const client = clients.find((c) => c.slug === clientSlug);
        const preset = client?.sequence_folder_defaults?.structure ?? null;
        if (preset && folders.some((f) => f.id === preset.id)) {
          setFolderTarget(preset);
        } else if (folders.length > 0) {
          setFolderTarget({ id: folders[0].id, name: folders[0].name });
        }
      } catch (e) {
        console.warn("CampaignTreeView: load drive folders failed", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [snapshotEnabled, root, clientSlug]);

  const onPickFolder = useCallback(
    (folderId: string) => {
      if (!folderId) {
        setFolderTarget(null);
        return;
      }
      const f = driveFolders.find((x) => x.id === folderId);
      if (f) setFolderTarget({ id: f.id, name: f.name });
    },
    [driveFolders],
  );

  /** Rasterise the visible campaign tree to PNG (via html-to-image), encode
   *  it base64, and upload to the selected Drive folder. */
  const snapshotToDrive = useCallback(async () => {
    if (!folderTarget) {
      setSnapError("Pick a Drive folder above the snapshot button first.");
      return;
    }
    const flow = flowRef.current;
    const canvas = canvasRef.current;
    if (!flow || !canvas) {
      setSnapError("Snapshot target not mounted. Try reopening the tree.");
      return;
    }
    setSnapError(null);
    setSnapDriveUrl(null);
    setSnapping(true);
    try {
      // Snapshot the tree itself, not the scrollable canvas — that crops out
      // the gridded gray space around the content. We render at a fixed 16:9
      // landscape size and let CSS scale the flow to fit, so the tree always
      // fills the photo regardless of how tall the natural layout grew.
      const OUT_W = 1920;
      const OUT_H = 1080;
      const PAD = 64;
      const flowW = flow.scrollWidth;
      const flowH = flow.scrollHeight;
      const scale = Math.min(
        (OUT_W - PAD * 2) / flowW,
        (OUT_H - PAD * 2) / flowH,
      );

      const bg = getComputedStyle(canvas).backgroundColor || "#0d0f12";
      const dataUrl = await toPng(flow, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: bg,
        width: OUT_W,
        height: OUT_H,
        canvasWidth: OUT_W,
        canvasHeight: OUT_H,
        style: {
          transform: `translate(${(OUT_W - flowW * scale) / 2}px, ${
            (OUT_H - flowH * scale) / 2
          }px) scale(${scale})`,
          transformOrigin: "top left",
          width: `${flowW}px`,
          maxWidth: "none",
          margin: "0",
        },
      });
      const commaIdx = dataUrl.indexOf(",");
      if (commaIdx < 0) throw new Error("toPng returned an unexpected payload");
      const base64 = dataUrl.slice(commaIdx + 1);
      const safeClient = clientName.replace(/[^A-Za-z0-9._-]+/g, "-");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const filename = `${safeClient}-campaign-tree-${stamp}.png`;
      const result = await api.uploadBytesToDrive({
        folderId: folderTarget.id,
        filename,
        base64Bytes: base64,
        mimeType: "image/png",
      });
      setSnapDriveUrl(result.webViewLink);
    } catch (e) {
      setSnapError(e instanceof Error ? e.message : String(e));
    } finally {
      setSnapping(false);
    }
  }, [folderTarget, clientName]);

  const adReadyState = (
    adSetIdx: number,
    adIdx: number,
  ): "ready" | "pending" | "empty" => {
    const ad = skeleton.adSets[adSetIdx]?.ads[adIdx];
    if (!ad) return "empty";
    if (ad.hook.trim().length === 0) return "empty";
    if (creativesReady) return "ready";
    if (copyReady) return "pending";
    return "empty";
  };

  // ── mutation helpers ───────────────────────────────────────────────
  const updateCampaign = (patch: Partial<CampaignSkeleton>) => {
    onSkeletonChange({ ...skeleton, ...patch });
  };
  const updateAdSet = (idx: number, patch: Partial<CampaignSkeletonAdSet>) => {
    const adSets = skeleton.adSets.map((a, i) => (i === idx ? { ...a, ...patch } : a));
    onSkeletonChange({ ...skeleton, adSets });
  };
  const updateAd = (
    setIdx: number,
    adIdx: number,
    patch: Partial<CampaignSkeletonAd>,
  ) => {
    const adSets = skeleton.adSets.map((s, si) =>
      si !== setIdx
        ? s
        : {
            ...s,
            ads: s.ads.map((a, ai) => (ai === adIdx ? { ...a, ...patch } : a)),
          },
    );
    onSkeletonChange({ ...skeleton, adSets });
  };

  const snippetLabel: Record<PendingSnippet["source"], string> = {
    ad_copy: "ad variation",
  };

  return (
    <div className={"ct-root" + (pickMode ? " is-pick-mode" : "")}>
      {pickMode && pendingSnippet && (
        <div className="ct-pick-banner" role="dialog" aria-live="polite">
          <div className="ct-pick-banner-meta">
            <span className="ct-pick-banner-eyebrow">
              Drop {snippetLabel[pendingSnippet.source]} into a slot
            </span>
            <span className="ct-pick-banner-text">"{pendingSnippet.text}"</span>
          </div>
          <button
            type="button"
            className="ct-pick-banner-cancel"
            onClick={() => onCancelPick?.()}
          >
            Cancel
          </button>
        </div>
      )}
      {pickMode && pendingCreativePick && (
        <div className="ct-pick-banner" role="dialog" aria-live="polite">
          <div className="ct-pick-banner-creative">
            {pendingCreativePick.previewUrl && (
              <img
                className="ct-pick-banner-thumb"
                src={pendingCreativePick.previewUrl}
                alt={pendingCreativePick.filename}
              />
            )}
            <div className="ct-pick-banner-meta">
              <span className="ct-pick-banner-eyebrow">
                Attach creative to a slot
              </span>
              <span className="ct-pick-banner-text">{pendingCreativePick.filename}</span>
            </div>
          </div>
          <button
            type="button"
            className="ct-pick-banner-cancel"
            onClick={() => onCancelCreativePick?.()}
          >
            Cancel
          </button>
        </div>
      )}
      <header className="ct-topbar">
        <div className="ct-brand">
          <div className="ct-glyph" />
          <div>
            <h1 className="ct-h1">Campaign Skeleton</h1>
            <div className="ct-sub">{clientName} · Learning Phase visualization</div>
          </div>
        </div>
        <div className="ct-stats">
          <StatusPill k="Brief" ok={briefLocked} okLabel="Locked" waitLabel="Pending" />
          <StatusPill k="Copy" ok={copyReady} okLabel="Ready" waitLabel="Pending" />
          <StatusPill
            k="Creatives"
            ok={creativesReady}
            okLabel="Ready"
            waitLabel="Pending"
          />
          <StatusPill
            k="Structure"
            ok={structureReady}
            okLabel="Locked"
            waitLabel="Pending"
          />
        </div>
        {snapshotEnabled && (
          <div className="ct-snap">
            <select
              className="ct-snap-select"
              value={folderTarget?.id ?? ""}
              onChange={(e) => onPickFolder(e.target.value)}
              title="Drive folder for the snapshot PNG."
            >
              <option value="">Snapshot folder…</option>
              {driveFolders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            {snapDriveUrl ? (
              <a
                href={snapDriveUrl}
                target="_blank"
                rel="noreferrer"
                className="ct-snap-pill is-ok"
                title="Open the snapshot in Drive"
              >
                ✓ In Drive
              </a>
            ) : (
              <button
                type="button"
                className="ct-snap-btn"
                onClick={() => void snapshotToDrive()}
                disabled={snapping || !folderTarget}
                title={
                  folderTarget
                    ? "Rasterise the tree to PNG and upload to the selected folder."
                    : "Pick a Drive folder first."
                }
              >
                {snapping ? "Snapping…" : "Snapshot to Drive"}
              </button>
            )}
          </div>
        )}
        <button type="button" className="ct-back" onClick={onClose}>
          ← Back to sequence
        </button>
      </header>

      <main className="ct-canvas" ref={canvasRef}>
        <div className="ct-flow" ref={flowRef}>
          {/* CAMPAIGN */}
          <div className="ct-campaign-node">
            <div className="ct-campaign-label">Campaign · Leads · ABO</div>
            <div className="ct-campaign-name">
              {clientName} · Learning Phase
            </div>
            <div className="ct-campaign-meta">
              <span>
                Objective <b>Leads</b>
              </span>
              <span>
                Budget <b>ABO (ad-set level)</b>
              </span>
              <span>
                Daily{" "}
                <EditableNumber
                  value={skeleton.dailyBudget}
                  onChange={(n) => updateCampaign({ dailyBudget: n })}
                  prefix="$"
                  min={5}
                  step={5}
                />
              </span>
            </div>
          </div>

          <div className="ct-vline" />
          <div className="ct-branch">
            <div className="ct-branch-stub ct-stub-right" />
          </div>

          {/* AD SETS */}
          <div className="ct-adset-row">
            {skeleton.adSets.map((adSet, setIdx) => {
              // Pick mode force-expands every set so Jake can see all drop
              // targets at once. Otherwise honour the user's toggle.
              const collapsed = pickMode
                ? false
                : collapsedAdsets.has(setIdx);
              const filledAds = adSet.ads.filter(
                (a) => a.hook.trim().length > 0,
              ).length;
              return (
                <div
                  key={setIdx}
                  className={
                    "ct-adset-col" + (collapsed ? " is-collapsed" : "")
                  }
                >
                  <AdSetNode
                    adSet={adSet}
                    collapsed={collapsed}
                    filledCount={filledAds}
                    totalCount={adSet.ads.length}
                    onToggle={() => toggleAdsetCollapsed(setIdx)}
                    onChange={(patch) => updateAdSet(setIdx, patch)}
                  />
                  {!collapsed && (
                    <>
                      <div className="ct-vline-down" />
                      <div className="ct-ad-branch">
                        <div className="ct-ad-stub ct-ad-s1" />
                        <div className="ct-ad-stub ct-ad-s2" />
                        <div className="ct-ad-stub ct-ad-s3" />
                      </div>
                      <div className="ct-ads-row">
                        {adSet.ads.map((ad, adIdx) => (
                          <AdCard
                            key={adIdx}
                            num={`Ad ${adIdx + 1}`}
                            ad={ad}
                            state={adReadyState(setIdx, adIdx)}
                            mirrored={setIdx > 0}
                            onChange={(patch) => updateAd(setIdx, adIdx, patch)}
                            pickMode={pickMode}
                            resizeKey={
                              clientSlug
                                ? `tree-card-size:${clientSlug}:${setIdx}:${adIdx}`
                                : undefined
                            }
                            onPick={() => {
                              if (pendingCreativePick) {
                                const primaryFilled = Boolean(
                                  ad.creativePath || ad.creativePreviewUrl,
                                );
                                if (ad.format === "Carousel" && primaryFilled) {
                                  // Append to the carousel stack instead of
                                  // overwriting frame 0.
                                  const next = [...(ad.extraFrames ?? []), {
                                    creativePath: pendingCreativePick.savedPath,
                                    creativeFilename: pendingCreativePick.filename,
                                    creativePreviewUrl: pendingCreativePick.previewUrl,
                                  }];
                                  updateAd(setIdx, adIdx, { extraFrames: next });
                                } else {
                                  updateAd(setIdx, adIdx, {
                                    creativePath: pendingCreativePick.savedPath,
                                    creativeFilename: pendingCreativePick.filename,
                                    creativePreviewUrl: pendingCreativePick.previewUrl,
                                  });
                                }
                                onPickCreativeSlot?.(setIdx, adIdx);
                                return;
                              }
                              if (!pendingSnippet) return;
                              const patch: Partial<CampaignSkeletonAd> = {
                                hook: pendingSnippet.text,
                              };
                              if (pendingSnippet.angleLabel) {
                                patch.angleLabel = pendingSnippet.angleLabel;
                              }
                              updateAd(setIdx, adIdx, patch);
                              onPickSlot?.(setIdx, adIdx);
                            }}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </main>

      <footer className="ct-footer">
        <span>
          Skeleton · <b>1 campaign</b> · <b>{skeleton.adSets.length} ad sets</b> ·{" "}
          <b>
            {skeleton.adSets.reduce((n, s) => n + s.ads.length, 0)} ad slots
          </b>
        </span>
        <span>
          Test thesis · <b className="ct-thesis">audience, not creative</b>
        </span>
        <span className="ct-footer-right">Edits sync to matching forms</span>
      </footer>

      {snapError && <div className="ct-snap-err">{snapError}</div>}

      <style>{CT_CSS}</style>
    </div>
  );
}

// ── subcomponents ─────────────────────────────────────────────────────

function StatusPill({
  k,
  ok,
  okLabel,
  waitLabel,
}: {
  k: string;
  ok: boolean;
  okLabel: string;
  waitLabel: string;
}) {
  return (
    <div className="ct-stat">
      <div className="ct-stat-k">{k}</div>
      <div className={"ct-stat-v" + (ok ? " ok" : " wait")}>
        {ok ? okLabel : waitLabel}
      </div>
    </div>
  );
}

function AdSetNode({
  adSet,
  onChange,
  collapsed,
  filledCount,
  totalCount,
  onToggle,
}: {
  adSet: CampaignSkeletonAdSet;
  onChange: (patch: Partial<CampaignSkeletonAdSet>) => void;
  collapsed: boolean;
  filledCount: number;
  totalCount: number;
  onToggle: () => void;
}) {
  return (
    <div className={"ct-adset-node" + (collapsed ? " is-collapsed" : "")}>
      <button
        type="button"
        className="ct-adset-toggle"
        onClick={onToggle}
        aria-expanded={!collapsed}
        title={collapsed ? "Expand ad set" : "Collapse ad set"}
      >
        <span className="ct-adset-chevron" aria-hidden="true">
          {collapsed ? "▸" : "▾"}
        </span>
      </button>
      <div className="ct-adset-body">
        <EditableText
          className="ct-adset-type"
          value={adSet.name}
          onChange={(v) => onChange({ name: v })}
          placeholder="Ad set label"
        />
        <EditableText
          className="ct-adset-spec"
          value={adSet.targeting}
          onChange={(v) => onChange({ targeting: v })}
          placeholder="Targeting spec"
        />
        <div className="ct-adset-params">
          <span className="ct-pill">
            <EditableNumber
              value={adSet.dailyBudget}
              onChange={(n) => onChange({ dailyBudget: n })}
              prefix="$"
              suffix="/day"
              min={1}
              step={1}
            />
          </span>
          <span className="ct-pill ct-adset-count-pill">
            {filledCount}/{totalCount} ads filled
          </span>
        </div>
      </div>
    </div>
  );
}

function AdCard({
  num,
  ad,
  state,
  mirrored,
  onChange,
  pickMode,
  onPick,
  resizeKey,
}: {
  num: string;
  ad: CampaignSkeletonAd;
  state: "ready" | "pending" | "empty";
  mirrored?: boolean;
  onChange: (patch: Partial<CampaignSkeletonAd>) => void;
  pickMode?: boolean;
  onPick?: () => void;
  /** When set, the user-dragged card size persists to localStorage under
   *  this key so the layout survives navigating out of and back into the
   *  campaign tree. */
  resizeKey?: string;
}) {
  const isEmpty = state === "empty";
  /** User-controlled card size. Null until the user first drags the resize
   *  handle in the bottom-right corner. After that, both dimensions are
   *  fixed pixel values that override the default flex layout. */
  const readPersistedSize = (): { w: number; h: number } | null => {
    if (!resizeKey || typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(resizeKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed === "object" &&
        typeof parsed.w === "number" &&
        typeof parsed.h === "number" &&
        parsed.w >= 100 &&
        parsed.h >= 100
      ) {
        return { w: parsed.w, h: parsed.h };
      }
    } catch {
      // Corrupted entry — ignore.
    }
    return null;
  };
  const [size, setSize] = useState<{ w: number; h: number } | null>(() =>
    readPersistedSize(),
  );
  // Re-read when the key changes (e.g. different client / different ad slot).
  useEffect(() => {
    setSize(readPersistedSize());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizeKey]);
  const nodeRef = useRef<HTMLDivElement | null>(null);

  const onResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const node = nodeRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = rect.width;
    const startH = rect.height;
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    let latest = { w: startW, h: startH };
    const onMove = (ev: PointerEvent) => {
      const w = Math.max(260, startW + (ev.clientX - startX));
      const h = Math.max(180, startH + (ev.clientY - startY));
      latest = { w, h };
      setSize(latest);
    };
    const onUp = (ev: PointerEvent) => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      try {
        handle.releasePointerCapture(ev.pointerId);
      } catch {
        // pointer may already have been released
      }
      if (resizeKey && typeof window !== "undefined") {
        try {
          window.localStorage.setItem(resizeKey, JSON.stringify(latest));
        } catch (err) {
          console.warn("AdCard: failed to persist resize", err);
        }
      }
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  };

  const sizeStyle = size
    ? ({
        width: `${size.w}px`,
        height: `${size.h}px`,
        flex: "0 0 auto",
      } as React.CSSProperties)
    : undefined;

  return (
    <div
      ref={nodeRef}
      style={sizeStyle}
      className={
        "ct-ad-node" +
        (isEmpty ? " is-empty" : "") +
        (pickMode ? " is-target" + (isEmpty ? " is-target-empty" : "") : "") +
        (size ? " is-resized" : "")
      }
    >
      {!pickMode && (
        <div
          className="ct-ad-resize-handle"
          onPointerDown={onResizeStart}
          title="Drag to resize this ad card"
          role="separator"
          aria-label="Resize ad card"
        />
      )}
      {pickMode && (
        <button
          type="button"
          className="ct-ad-pick-overlay"
          onClick={onPick}
          aria-label={`Insert into ${num}`}
          title={
            isEmpty
              ? `Insert into ${num} (empty slot)`
              : `Replace hook in ${num}`
          }
        >
          <span className="ct-ad-pick-overlay-glyph">↘</span>
          <span className="ct-ad-pick-overlay-label">
            {isEmpty ? "Drop here" : "Replace"}
          </span>
        </button>
      )}
      <div className="ct-ad-head">
        <select
          className="ct-ad-format-select"
          value={ad.format}
          onChange={(e) => onChange({ format: e.target.value as AdFormat })}
        >
          {AD_FORMATS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <span className="ct-ad-num">{num}</span>
      </div>
      <div className="ct-ad-body">
        {ad.format === "Carousel" ? (
          <CarouselThumb
            ad={ad}
            isEmpty={isEmpty}
            pickMode={!!pickMode}
            onChange={onChange}
          />
        ) : (
          <div className={"ct-ad-thumb" + (isEmpty ? " is-empty" : "")}>
            {ad.creativePreviewUrl ? (
              <img src={ad.creativePreviewUrl} alt={ad.creativeFilename ?? ""} />
            ) : isEmpty ? (
              <span className="ct-ad-thumb-plus">+</span>
            ) : (
              <img
                src={`https://picsum.photos/seed/skeleton-${ad.angleLabel}-${ad.format}/200/200`}
                alt=""
              />
            )}
          </div>
        )}
        <div className="ct-ad-info">
          <EditableText
            className="ct-ad-angle"
            value={ad.angleLabel}
            onChange={(v) => onChange({ angleLabel: v })}
            placeholder="Angle label"
          />
          <EditableText
            className={"ct-ad-hook" + (isEmpty ? " muted" : "")}
            multiline
            fillHeight
            value={ad.hook}
            onChange={(v) => onChange({ hook: v })}
            placeholder="Add a hook — feeds the hooks + ad-copy forms"
          />
        </div>
      </div>
      <div className="ct-ad-foot">
        <span>{mirrored ? "Mirrored" : "V1"}</span>
        <span className={"ct-ad-status ct-" + state}>
          <span className="ct-ad-dot" />
          {state === "ready" ? "Ready" : state === "pending" ? "Pending" : "Empty"}
        </span>
      </div>
    </div>
  );
}

/** Multi-frame thumbnail for Carousel ads. Frame 0 is the primary creative
 *  fields (creativePath/Filename/PreviewUrl); frames 1..N live in
 *  extraFrames. Renders a single visible frame plus pointer-drag swipe, dot
 *  indicators, and a "+ frame" affordance so the user can keep stacking
 *  creatives into one slot. */
function CarouselThumb({
  ad,
  isEmpty,
  pickMode,
  onChange,
}: {
  ad: CampaignSkeletonAd;
  isEmpty: boolean;
  pickMode: boolean;
  onChange: (patch: Partial<CampaignSkeletonAd>) => void;
}) {
  /** Flattened view of all frames (primary + extras), filtered to ones that
   *  actually have a creative. Used for navigation + dot count. */
  const frames = (() => {
    const list: Array<{
      creativePath?: string;
      creativeFilename?: string;
      creativePreviewUrl?: string;
    }> = [];
    if (ad.creativePath || ad.creativePreviewUrl) {
      list.push({
        creativePath: ad.creativePath,
        creativeFilename: ad.creativeFilename,
        creativePreviewUrl: ad.creativePreviewUrl,
      });
    }
    for (const f of ad.extraFrames ?? []) {
      if (f.creativePath || f.creativePreviewUrl) list.push(f);
    }
    return list;
  })();
  const frameCount = frames.length;

  const [active, setActive] = useState(0);
  // Clamp the active frame when frames disappear (e.g. user deletes one or
  // flips format off and back).
  useEffect(() => {
    if (active > Math.max(0, frameCount - 1)) {
      setActive(Math.max(0, frameCount - 1));
    }
  }, [frameCount, active]);

  /** Drag-to-swipe state. dx is the in-flight horizontal delta in px; on
   *  release we snap to prev/next if |dx| crosses the threshold. */
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragStartX = useRef<number | null>(null);
  const [dx, setDx] = useState(0);
  const SWIPE_THRESHOLD = 40;

  const goTo = (idx: number) => {
    if (frameCount === 0) return;
    const clamped = Math.max(0, Math.min(frameCount - 1, idx));
    setActive(clamped);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pickMode) return; // let the parent pick overlay handle the click
    if (frameCount < 2) return;
    dragStartX.current = e.clientX;
    setDx(0);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartX.current === null) return;
    setDx(e.clientX - dragStartX.current);
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartX.current === null) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // pointer may already have been released
    }
    const delta = dx;
    dragStartX.current = null;
    setDx(0);
    if (delta <= -SWIPE_THRESHOLD) goTo(active + 1);
    else if (delta >= SWIPE_THRESHOLD) goTo(active - 1);
  };

  /** Append an empty frame and jump to it. The actual creative still gets
   *  attached via the existing pendingCreativePick flow (which writes to the
   *  primary fields); see the carousel-aware merge in AdCard's onPick handler. */
  const addFrame = () => {
    const next = [...(ad.extraFrames ?? []), {}];
    onChange({ extraFrames: next });
    setActive(frameCount); // length BEFORE the push is the new index of the empty slot
  };

  const removeActiveFrame = () => {
    if (frameCount === 0) return;
    if (active === 0) {
      // Drop the primary. Promote the first extra into its place, if any.
      const extras = [...(ad.extraFrames ?? [])];
      const promoted = extras.shift();
      onChange({
        creativePath: promoted?.creativePath,
        creativeFilename: promoted?.creativeFilename,
        creativePreviewUrl: promoted?.creativePreviewUrl,
        extraFrames: extras,
      });
    } else {
      const extras = [...(ad.extraFrames ?? [])];
      extras.splice(active - 1, 1);
      onChange({ extraFrames: extras });
      setActive(Math.max(0, active - 1));
    }
  };

  if (isEmpty && frameCount === 0) {
    return (
      <div className="ct-ad-thumb ct-ad-thumb-carousel is-empty">
        <span className="ct-ad-thumb-plus">+</span>
      </div>
    );
  }

  const current = frames[Math.min(active, Math.max(0, frameCount - 1))];

  return (
    <div className="ct-ad-thumb ct-ad-thumb-carousel">
      <div
        ref={trackRef}
        className="ct-carousel-track"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{
          transform: dx !== 0 ? `translateX(${dx}px)` : undefined,
          transition: dx === 0 ? "transform 160ms ease" : "none",
        }}
      >
        {current?.creativePreviewUrl ? (
          <img
            src={current.creativePreviewUrl}
            alt={current.creativeFilename ?? ""}
            draggable={false}
          />
        ) : (
          <span className="ct-ad-thumb-plus">+</span>
        )}
      </div>
      {frameCount > 1 && (
        <>
          <button
            type="button"
            className="ct-carousel-chev ct-carousel-chev-l"
            onClick={(e) => {
              e.stopPropagation();
              goTo(active - 1);
            }}
            disabled={active === 0}
            aria-label="Previous frame"
          >
            ‹
          </button>
          <button
            type="button"
            className="ct-carousel-chev ct-carousel-chev-r"
            onClick={(e) => {
              e.stopPropagation();
              goTo(active + 1);
            }}
            disabled={active >= frameCount - 1}
            aria-label="Next frame"
          >
            ›
          </button>
        </>
      )}
      <div className="ct-carousel-dots">
        {frames.map((_, i) => (
          <button
            key={i}
            type="button"
            className={"ct-carousel-dot" + (i === active ? " is-active" : "")}
            onClick={(e) => {
              e.stopPropagation();
              goTo(i);
            }}
            aria-label={`Go to frame ${i + 1}`}
          />
        ))}
        {!pickMode && (
          <>
            <button
              type="button"
              className="ct-carousel-dot ct-carousel-dot-add"
              onClick={(e) => {
                e.stopPropagation();
                addFrame();
              }}
              title="Add a frame to this carousel"
              aria-label="Add carousel frame"
            >
              +
            </button>
            {current && (current.creativePath || current.creativePreviewUrl) && (
              <button
                type="button"
                className="ct-carousel-dot ct-carousel-dot-del"
                onClick={(e) => {
                  e.stopPropagation();
                  removeActiveFrame();
                }}
                title="Remove this frame"
                aria-label="Remove current frame"
              >
                ×
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── inline-edit primitives ────────────────────────────────────────────

function EditableText({
  value,
  onChange,
  className,
  placeholder,
  multiline,
  fillHeight,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  multiline?: boolean;
  /** When true, skip the JS auto-grow and let CSS govern the textarea
   *  height. Use this inside a flex column parent that gives the textarea
   *  `flex: 1` — the textarea then grows with the parent (e.g. when the
   *  user drags the resize handle on an ad card). */
  fillHeight?: boolean;
}) {
  const cls = "ct-edit ct-edit-text" + (className ? " " + className : "");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-grow multiline textareas to fit content, BUT cap the height so a
  // long pasted ad-copy variation doesn't stretch the card into a tall
  // column. Past the cap the textarea scrolls internally. Skipped when
  // `fillHeight` is set — there CSS controls the height.
  useEffect(() => {
    if (!multiline || fillHeight) return;
    const el = textareaRef.current;
    if (!el) return;
    const MAX_PX = 96;
    el.style.height = "auto";
    const desired = Math.min(el.scrollHeight, MAX_PX);
    el.style.height = `${desired}px`;
    el.style.overflowY = el.scrollHeight > MAX_PX ? "auto" : "hidden";
  }, [value, multiline, fillHeight]);

  if (multiline) {
    return (
      <textarea
        ref={textareaRef}
        className={cls}
        value={value}
        placeholder={placeholder}
        rows={2}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <input
      className={cls}
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function EditableNumber({
  value,
  onChange,
  prefix,
  suffix,
  min,
  step,
}: {
  value: number;
  onChange: (n: number) => void;
  prefix?: string;
  suffix?: string;
  min?: number;
  step?: number;
}) {
  return (
    <span className="ct-edit-num-wrap">
      {prefix && <span className="ct-edit-num-fix">{prefix}</span>}
      <input
        className="ct-edit ct-edit-num"
        type="number"
        value={value}
        min={min}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
      />
      {suffix && <span className="ct-edit-num-fix">{suffix}</span>}
    </span>
  );
}

const CT_CSS = `
.ct-root {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: var(--hml-bg-base);
  color: var(--hml-text-primary);
  display: grid;
  grid-template-rows: auto 1fr auto;
  font-family: var(--hml-font-sans);
  font-size: 14px;
  line-height: 1.55;
}

/* Top bar */
.ct-topbar {
  padding: 14px 24px;
  background: var(--hml-bg-elev-1);
  border-bottom: 1px solid var(--hml-border-subtle);
  display: flex;
  flex-wrap: wrap;
  gap: 12px 18px;
  align-items: center;
  /* Brand fills left, stats/snap float right, back pill is ALWAYS the
   * right-most element thanks to margin-left:auto. Wraps cleanly when
   * the viewport can't fit all four on one row. */
}
.ct-brand { display: flex; gap: 12px; align-items: center; flex: 1 1 240px; min-width: 0; }
.ct-glyph {
  width: 32px; height: 32px;
  border-radius: 8px;
  background: linear-gradient(135deg, #5ea3ff, #b07bff, #54d68f);
  box-shadow: 0 0 24px rgba(94, 163, 255, 0.35);
}
.ct-h1 { font-size: 17px; font-weight: 700; letter-spacing: -0.01em; margin: 0; }
.ct-sub { font-size: 12px; color: var(--hml-text-tertiary); margin-top: 2px; }

.ct-stats {
  display: flex; gap: 22px;
  flex: 0 0 auto;
  flex-wrap: wrap;
}
.ct-stat { text-align: right; }
.ct-stat-k { font-size: 11px; color: var(--hml-text-tertiary); margin-bottom: 3px; }
.ct-stat-v { font-size: 14px; font-weight: 600; color: var(--hml-text-primary); }
.ct-stat-v.ok { color: #54d68f; }
.ct-stat-v.wait { color: #f7b14d; }

.ct-back {
  font-family: var(--hml-font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 8px 14px;
  background: var(--hml-bg-elev-2);
  border: 1px solid var(--hml-border);
  color: var(--hml-text-secondary);
  border-radius: 6px;
  cursor: pointer;
  transition: border-color 120ms ease, color 120ms ease;
  flex: 0 0 auto;
  /* Always pinned to the far right of the topbar, even when stats/snap
   * are absent. Without this the back pill could end up tucked behind
   * the snap dropdown on narrower viewports. */
  margin-left: auto;
}
.ct-back:hover {
  border-color: var(--hml-border-strong);
  color: var(--hml-text-primary);
}

.ct-snap {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}
.ct-snap-select {
  font-family: var(--hml-font-sans);
  font-size: 12px;
  padding: 6px 9px;
  border-radius: 6px;
  border: 1px solid var(--hml-border);
  background: var(--hml-bg-elev-1);
  color: var(--hml-text-primary);
  min-width: 150px;
}
.ct-snap-btn {
  font-family: var(--hml-font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 7px 12px;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid var(--hml-accent-border);
  background: var(--hml-accent-dim);
  color: var(--hml-accent-bright);
  transition: border-color 120ms ease, filter 120ms ease;
}
.ct-snap-btn:hover { filter: brightness(1.1); }
.ct-snap-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.ct-snap-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--hml-font-mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  padding: 6px 11px;
  border-radius: 999px;
  text-decoration: none;
  border: 1px solid var(--hml-green-border);
  background: var(--hml-green-bg);
  color: var(--hml-green);
}
.ct-snap-pill:hover { filter: brightness(1.15); }
.ct-snap-err {
  position: fixed;
  bottom: 20px;
  right: 20px;
  padding: 10px 14px;
  border-radius: 8px;
  background: var(--hml-red-bg, var(--hml-bg-elev-3));
  border: 1px solid var(--hml-red-border, var(--hml-border-strong));
  color: var(--hml-red, var(--hml-text-primary));
  font-size: 12.5px;
  max-width: 360px;
  z-index: 1100;
}

/* Canvas */
.ct-canvas {
  overflow: auto;
  padding: 24px 24px 48px;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  background:
    radial-gradient(circle at 50% 0%, rgba(94, 163, 255, 0.06), transparent 50%),
    radial-gradient(circle at 25% 60%, rgba(176, 123, 255, 0.05), transparent 40%),
    radial-gradient(circle at 75% 60%, rgba(84, 214, 143, 0.05), transparent 40%),
    var(--hml-bg-base);
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
  background-size: 32px 32px;
}
.ct-flow {
  display: flex; flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 1640px;
}

/* Campaign node — intentionally compact. The ad cards are the stars; this
 * is just a label that anchors the tree at the top. */
.ct-campaign-node {
  background: var(--hml-bg-elev-1);
  border: 1px solid rgba(94, 163, 255, 0.7);
  border-radius: 10px;
  padding: 10px 20px;
  box-shadow: 0 0 18px rgba(94, 163, 255, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.04);
  min-width: 0;
  max-width: 720px;
  text-align: center;
}
.ct-campaign-label { font-size: 10.5px; color: #5ea3ff; font-weight: 600; margin-bottom: 4px; letter-spacing: 0.06em; text-transform: uppercase; }
.ct-campaign-name { font-size: 15px; font-weight: 600; letter-spacing: -0.005em; margin-bottom: 6px; }
.ct-campaign-meta {
  display: flex; gap: 16px; justify-content: center; align-items: center;
  font-size: 12px;
  color: var(--hml-text-secondary);
  flex-wrap: wrap;
}
.ct-campaign-meta b { color: var(--hml-text-primary); font-weight: 600; }

/* Connectors */
.ct-vline { width: 2px; height: 22px; background: linear-gradient(180deg, #5ea3ff, #b07bff); margin: 0 auto; }
.ct-vline-down { width: 1.5px; height: 18px; background: linear-gradient(180deg, #b07bff, #54d68f); margin: 0 auto; }
/* The horizontal split branch (campaign → 2 side-by-side ad sets) is no
 * longer needed now that ad-sets are stacked vertically. Keep the rule
 * available but render it as a thin vertical connector that visually
 * extends the .ct-vline into the first ad set. */
.ct-branch { width: 2px; height: 0; position: relative; margin: 0 auto; }
.ct-branch::before, .ct-branch::after, .ct-stub-right { display: none; }

.ct-ad-branch { width: 100%; height: 22px; position: relative; }
.ct-ad-branch::before {
  content: '';
  position: absolute;
  top: 0; left: calc(50% / 3); right: calc(50% / 3);
  height: 1.5px;
  background: #54d68f;
}
.ct-ad-stub { position: absolute; top: 0; width: 1.5px; height: 100%; background: #54d68f; }
.ct-ad-s1 { left: calc(50% / 3); }
.ct-ad-s2 { left: 50%; transform: translateX(-50%); }
.ct-ad-s3 { right: calc(50% / 3); }

/* Ad set row — stacked vertically so each ad-set's 3 cards have the full
 * flow width and end up wider than they are tall. */
.ct-adset-row {
  display: grid;
  grid-template-columns: 1fr;
  gap: 36px;
  width: 100%;
  align-items: start;
}
.ct-adset-col { display: flex; flex-direction: column; align-items: center; min-width: 0; width: 100%; }

.ct-adset-node {
  background: var(--hml-bg-elev-1);
  border: 1px solid rgba(176, 123, 255, 0.7);
  border-radius: 10px;
  padding: 8px 14px 8px 38px;
  box-shadow: 0 0 16px rgba(176, 123, 255, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.04);
  width: 100%;
  max-width: 560px;
  text-align: center;
  position: relative;
  transition: box-shadow 140ms ease, border-color 140ms ease;
}
.ct-adset-node.is-collapsed {
  box-shadow: 0 0 8px rgba(176, 123, 255, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.04);
  opacity: 0.92;
}
.ct-adset-toggle {
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(176, 123, 255, 0.12);
  border: 1px solid rgba(176, 123, 255, 0.45);
  border-radius: 6px;
  color: #b07bff;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  transition: background 120ms ease, border-color 120ms ease;
}
.ct-adset-toggle:hover {
  background: rgba(176, 123, 255, 0.24);
  border-color: rgba(176, 123, 255, 0.85);
}
.ct-adset-chevron {
  font-size: 11px;
  line-height: 1;
  font-weight: 700;
}
.ct-adset-body { display: flex; flex-direction: column; }
.ct-adset-count-pill {
  font-family: var(--hml-font-mono);
  font-size: 10.5px;
  letter-spacing: 0.06em;
  color: var(--hml-text-tertiary);
}
.ct-adset-type {
  font-size: 10.5px;
  color: #b07bff;
  font-weight: 600;
  margin-bottom: 3px;
  text-align: center;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.ct-adset-spec {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.005em;
  margin-bottom: 6px;
  text-align: center;
}
.ct-adset-params {
  display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;
  font-size: 11.5px;
  color: var(--hml-text-secondary);
}
.ct-pill {
  background: var(--hml-bg-elev-2);
  padding: 4px 12px;
  border-radius: 12px;
  border: 1px solid var(--hml-border);
  display: inline-flex;
  align-items: center;
}

/* Ads row — the focal point. Flex (not grid) so the user-resizable cards
 * can grow / shrink independently and the others reflow. */
.ct-ads-row {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  width: 100%;
  align-items: stretch;
}

.ct-ad-node {
  background: var(--hml-bg-elev-1);
  border: 1.5px solid #54d68f;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 0 22px rgba(84, 214, 143, 0.28), 0 8px 24px -12px rgba(0, 0, 0, 0.5);
  display: flex; flex-direction: column;
  font-size: 14px;
  flex: 1 1 280px;
  min-width: 260px;
  min-height: 180px;
  max-width: 100%;
  position: relative;
}
.ct-ad-node.is-resized {
  /* When the user has dragged the resize handle, inline width/height are
   * applied and the card opts out of flex distribution. */
  flex: 0 0 auto;
  max-width: none;
}
/* Custom resize handle pinned to the bottom-right corner. Native CSS
 * resize is unreliable on flex children, so we draw + drive this manually
 * via pointer events. */
.ct-ad-resize-handle {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 18px;
  height: 18px;
  cursor: nwse-resize;
  z-index: 4;
  background-image: linear-gradient(
    135deg,
    transparent 0,
    transparent 5px,
    rgba(84, 214, 143, 0.55) 5px,
    rgba(84, 214, 143, 0.55) 7px,
    transparent 7px,
    transparent 10px,
    rgba(84, 214, 143, 0.55) 10px,
    rgba(84, 214, 143, 0.55) 12px,
    transparent 12px,
    transparent 15px,
    rgba(84, 214, 143, 0.55) 15px,
    rgba(84, 214, 143, 0.55) 17px,
    transparent 17px
  );
  touch-action: none;
  user-select: none;
}
.ct-ad-resize-handle:hover {
  background-color: rgba(84, 214, 143, 0.08);
}
.ct-ad-node.is-empty {
  border-color: var(--hml-text-tertiary);
  border-style: dashed;
  box-shadow: none;
  background: var(--hml-bg-elev-1);
  opacity: 0.92;
}

.ct-ad-head {
  background: rgba(84, 214, 143, 0.1);
  padding: 12px 18px;
  display: flex; justify-content: space-between; align-items: center;
  gap: 8px;
  border-bottom: 1px solid var(--hml-border-subtle);
}
.ct-ad-node.is-empty .ct-ad-head { background: rgba(120, 120, 140, 0.08); }
.ct-ad-format-select {
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  color: #54d68f;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 2px 6px;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
}
.ct-ad-format-select:hover {
  border-color: rgba(84, 214, 143, 0.35);
  background: rgba(84, 214, 143, 0.06);
}
.ct-ad-format-select:focus {
  outline: none;
  border-color: #54d68f;
  background: rgba(84, 214, 143, 0.08);
}
.ct-ad-format-select option {
  background: var(--hml-bg-elev-2);
  color: var(--hml-text-primary);
}
.ct-ad-node.is-empty .ct-ad-format-select { color: var(--hml-text-tertiary); }
.ct-ad-num { font-size: 13px; color: var(--hml-text-secondary); font-weight: 600; }

.ct-ad-body {
  padding: 12px 16px;
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: 14px;
  align-items: stretch;
  flex: 1 1 auto;
  min-height: 0;
}
.ct-ad-thumb {
  width: 96px; height: 96px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--hml-bg-elev-2);
  border: 1px solid var(--hml-border);
  position: relative;
}
.ct-ad-thumb img { width: 100%; height: 100%; object-fit: cover; }
.ct-ad-thumb.is-empty {
  display: flex; align-items: center; justify-content: center;
  border-style: dashed;
  color: var(--hml-text-tertiary);
  font-size: 34px;
}
.ct-ad-thumb-plus { font-size: 34px; line-height: 1; }

/* ── Carousel thumb ────────────────────────────────────────────────────
   Same 96px footprint as the static thumb, but lets the user swipe / dot-
   nav through multiple frames stored on a single ad. Chevrons hide unless
   there's more than one frame; the dot strip always exposes a "+" so the
   user can add another frame, and "×" to drop the active one. */
.ct-ad-thumb-carousel {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: stretch;
  padding: 0;
}
.ct-ad-thumb-carousel .ct-carousel-track {
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: pan-y;
  cursor: grab;
  user-select: none;
}
.ct-ad-thumb-carousel .ct-carousel-track:active { cursor: grabbing; }
.ct-ad-thumb-carousel .ct-carousel-track img {
  pointer-events: none;
}
.ct-carousel-chev {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid var(--hml-border);
  background: rgba(15, 17, 21, 0.75);
  color: var(--hml-text-primary);
  font-size: 16px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 2;
}
.ct-carousel-chev:disabled { opacity: 0.35; cursor: default; }
.ct-carousel-chev-l { left: 4px; }
.ct-carousel-chev-r { right: 4px; }
.ct-carousel-dots {
  position: absolute;
  left: 0; right: 0; bottom: 4px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 4px;
  z-index: 2;
}
.ct-carousel-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.45);
  background: rgba(255, 255, 255, 0.15);
  padding: 0;
  cursor: pointer;
}
.ct-carousel-dot.is-active {
  background: var(--hml-text-primary);
  border-color: var(--hml-text-primary);
}
.ct-carousel-dot-add,
.ct-carousel-dot-del {
  width: 14px; height: 14px;
  border-radius: 50%;
  background: rgba(15, 17, 21, 0.85);
  color: var(--hml-text-primary);
  font-size: 11px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ct-ad-info { display: flex; flex-direction: column; gap: 10px; min-width: 0; min-height: 0; height: 100%; }
.ct-ad-angle {
  font-size: 11.5px;
  background: rgba(94, 163, 255, 0.12);
  color: #5ea3ff;
  padding: 4px 10px;
  border-radius: 4px;
  font-weight: 600;
  align-self: flex-start;
  max-width: 100%;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.ct-ad-hook { font-size: 15px; font-weight: 500; color: var(--hml-text-primary); line-height: 1.5; }
.ct-ad-hook.muted { color: var(--hml-text-tertiary); }
/* Hook textarea fills whatever vertical space the ad card gives it. As Jake
 * drags the card's resize handle, the textarea grows / shrinks with the
 * card. Long copy scrolls inside the textarea when the card is small. */
textarea.ct-edit-text.ct-ad-hook {
  flex: 1 1 auto;
  min-height: 60px;
  height: 100%;
  line-height: 1.5;
  font-size: 13.5px;
  resize: none;
  overflow-y: auto;
}

.ct-ad-foot {
  border-top: 1px solid var(--hml-border-subtle);
  padding: 11px 18px;
  display: flex; justify-content: space-between;
  font-size: 12.5px;
  color: var(--hml-text-tertiary);
}
.ct-ad-status { display: inline-flex; gap: 6px; align-items: center; font-weight: 600; }
.ct-ad-status.ct-ready { color: #54d68f; }
.ct-ad-status.ct-pending { color: #f7b14d; }
.ct-ad-status.ct-empty { color: var(--hml-text-tertiary); }
.ct-ad-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 6px currentColor;
}

/* Inline edit */
.ct-edit {
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  font-family: inherit;
  color: inherit;
  transition: background 120ms ease, border-color 120ms ease;
}
.ct-edit:hover {
  background: rgba(255, 255, 255, 0.03);
  border-color: rgba(255, 255, 255, 0.08);
}
.ct-edit:focus {
  outline: none;
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.18);
}
.ct-edit-text {
  width: 100%;
  display: block;
  padding: 3px 6px;
  font-size: inherit;
  font-weight: inherit;
  text-align: inherit;
  resize: none;
  font-family: inherit;
  line-height: inherit;
  letter-spacing: inherit;
  color: inherit;
}
.ct-edit-text::placeholder { color: var(--hml-text-tertiary); font-style: italic; }
textarea.ct-edit-text {
  min-height: 56px;
  resize: vertical;
  line-height: 1.45;
  overflow: hidden;
  font-family: inherit;
}
textarea.ct-edit-text:focus { overflow: auto; }

.ct-edit-num-wrap {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: var(--hml-text-primary);
  font-weight: 600;
}
.ct-edit-num {
  width: 4.5ch;
  text-align: center;
  font-weight: 600;
  font-size: inherit;
  padding: 2px 4px;
  appearance: textfield;
  -moz-appearance: textfield;
}
.ct-edit-num::-webkit-outer-spin-button,
.ct-edit-num::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.ct-edit-num-fix { color: var(--hml-text-secondary); font-weight: 600; }

/* ── Pick mode ───────────────────────────────────────────────────────────
 * Entered when the parent passes pendingSnippet. A banner pins to the top,
 * every ad card glows green, and an overlay button takes precedence over the
 * card's inline inputs so a click anywhere on the card inserts the snippet.
 */
.ct-pick-banner {
  background: linear-gradient(90deg, rgba(84, 214, 143, 0.18), rgba(94, 163, 255, 0.16));
  border-bottom: 1px solid rgba(84, 214, 143, 0.45);
  padding: 12px 24px;
  display: flex;
  align-items: center;
  gap: 18px;
}
.ct-pick-banner-creative {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}
.ct-pick-banner-thumb {
  width: 44px;
  height: 44px;
  border-radius: 6px;
  object-fit: cover;
  border: 1px solid var(--hml-border-subtle);
  flex-shrink: 0;
}
.ct-pick-banner-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}
.ct-pick-banner-eyebrow {
  font-family: var(--hml-font-mono);
  font-size: 10.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #54d68f;
  font-weight: 600;
}
.ct-pick-banner-text {
  font-size: 13.5px;
  color: var(--hml-text-primary);
  font-weight: 500;
  line-height: 1.45;
  /* Show up to 3 lines of the ad snippet so Jake can actually read what
   * he's about to drop into a slot. Falls back to single-line ellipsis on
   * older webviews via the overflow:hidden. */
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}
.ct-pick-banner-cancel {
  font-family: var(--hml-font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 7px 14px;
  background: var(--hml-bg-elev-2);
  border: 1px solid var(--hml-border);
  color: var(--hml-text-secondary);
  border-radius: 6px;
  cursor: pointer;
  flex-shrink: 0;
}
.ct-pick-banner-cancel:hover {
  border-color: var(--hml-border-strong);
  color: var(--hml-text-primary);
}

/* Restructure the root grid when the banner is present so the canvas keeps
 * filling the remaining space. */
.ct-root.is-pick-mode {
  grid-template-rows: auto auto 1fr auto;
}

/* Every ad card becomes a target. Empty slots glow brighter so the eye lands
 * there first. */
.ct-ad-node.is-target {
  position: relative;
  border-color: #54d68f;
  box-shadow:
    0 0 0 1px rgba(84, 214, 143, 0.45),
    0 0 28px rgba(84, 214, 143, 0.35);
  animation: ct-pulse-soft 1.8s ease-in-out infinite;
}
.ct-ad-node.is-target-empty {
  border-style: solid;
  background: rgba(84, 214, 143, 0.05);
  box-shadow:
    0 0 0 1.5px #54d68f,
    0 0 36px rgba(84, 214, 143, 0.55);
  animation: ct-pulse-strong 1.5s ease-in-out infinite;
}

@keyframes ct-pulse-soft {
  0%, 100% { box-shadow: 0 0 0 1px rgba(84, 214, 143, 0.45), 0 0 22px rgba(84, 214, 143, 0.3); }
  50% { box-shadow: 0 0 0 1px rgba(84, 214, 143, 0.6), 0 0 36px rgba(84, 214, 143, 0.55); }
}
@keyframes ct-pulse-strong {
  0%, 100% { box-shadow: 0 0 0 1.5px #54d68f, 0 0 28px rgba(84, 214, 143, 0.45); }
  50% { box-shadow: 0 0 0 2px #54d68f, 0 0 44px rgba(84, 214, 143, 0.75); }
}

/* The overlay sits on top of the inline inputs so the whole card is one
 * click target during pick mode. */
.ct-ad-pick-overlay {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: none;
  background: rgba(13, 15, 18, 0.55);
  color: #54d68f;
  cursor: pointer;
  font-family: var(--hml-font-mono);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0;
  transition: opacity 140ms ease, background 140ms ease;
}
.ct-ad-node.is-target:hover .ct-ad-pick-overlay,
.ct-ad-pick-overlay:focus-visible {
  opacity: 1;
}
.ct-ad-pick-overlay:hover {
  background: rgba(13, 15, 18, 0.7);
}
.ct-ad-pick-overlay-glyph {
  font-size: 26px;
  line-height: 1;
}
.ct-ad-pick-overlay-label {
  font-size: 11px;
  font-weight: 600;
}

/* Footer */
.ct-footer {
  padding: 12px 24px;
  background: var(--hml-bg-elev-1);
  border-top: 1px solid var(--hml-border-subtle);
  display: flex;
  gap: 24px;
  align-items: center;
  font-size: 12px;
  color: var(--hml-text-tertiary);
}
.ct-footer b { color: var(--hml-text-primary); font-weight: 600; }
.ct-thesis { color: #5ea3ff !important; }
.ct-footer-right { margin-left: auto; }
`;
