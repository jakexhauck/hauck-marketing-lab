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
};

const AD_FORMATS: AdFormat[] = ["Image", "Video", "Carousel"];

export function CampaignTreeView({
  clientName,
  sequenceState,
  onSkeletonChange,
  onClose,
  root,
  clientSlug,
}: Props) {
  const skeleton = sequenceState.campaignSkeleton ?? defaultCampaignSkeleton();

  const briefLocked = isStepDone(sequenceState, "creative-brief");
  const copyReady = isStepDone(sequenceState, "ad-copy");
  const creativesReady = isStepDone(sequenceState, "ad-creative");
  const structureReady = isStepDone(sequenceState, "structure");

  // Snapshot-to-Drive state. Hidden entirely when caller didn't pass root/slug.
  const snapshotEnabled = Boolean(root && clientSlug);
  const canvasRef = useRef<HTMLElement | null>(null);
  const [driveFolders, setDriveFolders] = useState<DriveFolder[]>([]);
  const [folderTarget, setFolderTarget] = useState<DocFolderTarget | null>(null);
  const [snapping, setSnapping] = useState(false);
  const [snapDriveUrl, setSnapDriveUrl] = useState<string | null>(null);
  const [snapError, setSnapError] = useState<string | null>(null);

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
    const node = canvasRef.current;
    if (!node) {
      setSnapError("Snapshot target not mounted. Try reopening the tree.");
      return;
    }
    setSnapError(null);
    setSnapDriveUrl(null);
    setSnapping(true);
    try {
      // html-to-image returns a data:image/png;base64,<...> URL. We strip
      // the prefix and pass the raw base64 bytes to the Rust binary uploader.
      const dataUrl = await toPng(node as HTMLElement, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: getComputedStyle(node).backgroundColor || "#0d0f12",
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

  return (
    <div className="ct-root">
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
        <div className="ct-flow">
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
            {skeleton.adSets.map((adSet, setIdx) => (
              <div key={setIdx} className="ct-adset-col">
                <AdSetNode
                  adSet={adSet}
                  onChange={(patch) => updateAdSet(setIdx, patch)}
                />
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
                    />
                  ))}
                </div>
              </div>
            ))}
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
}: {
  adSet: CampaignSkeletonAdSet;
  onChange: (patch: Partial<CampaignSkeletonAdSet>) => void;
}) {
  return (
    <div className="ct-adset-node">
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
}: {
  num: string;
  ad: CampaignSkeletonAd;
  state: "ready" | "pending" | "empty";
  mirrored?: boolean;
  onChange: (patch: Partial<CampaignSkeletonAd>) => void;
}) {
  const isEmpty = state === "empty";
  return (
    <div className={"ct-ad-node" + (isEmpty ? " is-empty" : "")}>
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
        <div className={"ct-ad-thumb" + (isEmpty ? " is-empty" : "")}>
          {isEmpty ? (
            <span className="ct-ad-thumb-plus">+</span>
          ) : (
            <img
              src={`https://picsum.photos/seed/skeleton-${ad.angleLabel}-${ad.format}/200/200`}
              alt=""
            />
          )}
        </div>
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

// ── inline-edit primitives ────────────────────────────────────────────

function EditableText({
  value,
  onChange,
  className,
  placeholder,
  multiline,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  multiline?: boolean;
}) {
  const cls = "ct-edit ct-edit-text" + (className ? " " + className : "");
  if (multiline) {
    return (
      <textarea
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
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 24px;
  align-items: center;
}
.ct-brand { display: flex; gap: 12px; align-items: center; }
.ct-glyph {
  width: 32px; height: 32px;
  border-radius: 8px;
  background: linear-gradient(135deg, #5ea3ff, #b07bff, #54d68f);
  box-shadow: 0 0 24px rgba(94, 163, 255, 0.35);
}
.ct-h1 { font-size: 17px; font-weight: 700; letter-spacing: -0.01em; margin: 0; }
.ct-sub { font-size: 12px; color: var(--hml-text-tertiary); margin-top: 2px; }

.ct-stats {
  justify-self: end;
  display: flex; gap: 28px;
  margin-right: 12px;
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
}
.ct-back:hover {
  border-color: var(--hml-border-strong);
  color: var(--hml-text-primary);
}

.ct-snap {
  display: flex;
  align-items: center;
  gap: 8px;
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
  padding: 40px 24px 60px;
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
  max-width: 1400px;
}

/* Campaign node */
.ct-campaign-node {
  background: var(--hml-bg-elev-1);
  border: 1.5px solid #5ea3ff;
  border-radius: 12px;
  padding: 22px 32px;
  box-shadow: 0 0 40px rgba(94, 163, 255, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.04);
  min-width: 560px;
  text-align: center;
}
.ct-campaign-label { font-size: 12px; color: #5ea3ff; font-weight: 600; margin-bottom: 8px; }
.ct-campaign-name { font-size: 22px; font-weight: 700; letter-spacing: -0.01em; margin-bottom: 12px; }
.ct-campaign-meta {
  display: flex; gap: 22px; justify-content: center; align-items: center;
  font-size: 13px;
  color: var(--hml-text-secondary);
}
.ct-campaign-meta b { color: var(--hml-text-primary); font-weight: 600; }

/* Connectors */
.ct-vline { width: 2px; height: 32px; background: linear-gradient(180deg, #5ea3ff, #b07bff); margin: 0 auto; }
.ct-vline-down { width: 1.5px; height: 24px; background: linear-gradient(180deg, #b07bff, #54d68f); margin: 0 auto; }
.ct-branch { width: 100%; height: 24px; position: relative; }
.ct-branch::before {
  content: '';
  position: absolute;
  top: 0; left: 25%; right: 25%;
  height: 1.5px;
  background: #b07bff;
  box-shadow: 0 0 8px rgba(176, 123, 255, 0.35);
}
.ct-branch::after {
  content: '';
  position: absolute;
  top: 0; left: 25%;
  width: 1.5px; height: 100%;
  background: #b07bff;
}
.ct-stub-right {
  position: absolute;
  top: 0; right: 25%;
  width: 1.5px; height: 100%;
  background: #b07bff;
}

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

/* Ad set row */
.ct-adset-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
  width: 100%;
  align-items: start;
}
.ct-adset-col { display: flex; flex-direction: column; align-items: center; min-width: 0; }

.ct-adset-node {
  background: var(--hml-bg-elev-1);
  border: 1.5px solid #b07bff;
  border-radius: 10px;
  padding: 18px 20px;
  box-shadow: 0 0 32px rgba(176, 123, 255, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.04);
  width: 100%;
  max-width: 440px;
  text-align: center;
}
.ct-adset-type {
  font-size: 13px;
  color: #b07bff;
  font-weight: 600;
  margin-bottom: 6px;
  text-align: center;
}
.ct-adset-spec {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.005em;
  margin-bottom: 10px;
  text-align: center;
}
.ct-adset-params {
  display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;
  font-size: 12px;
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

/* Ads row */
.ct-ads-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 10px;
  width: 100%;
}

.ct-ad-node {
  background: var(--hml-bg-elev-1);
  border: 1.5px solid #54d68f;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 0 18px rgba(84, 214, 143, 0.3);
  display: flex; flex-direction: column;
  min-width: 0;
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
  padding: 8px 12px;
  display: flex; justify-content: space-between; align-items: center;
  gap: 8px;
  border-bottom: 1px solid var(--hml-border-subtle);
}
.ct-ad-node.is-empty .ct-ad-head { background: rgba(120, 120, 140, 0.08); }
.ct-ad-format-select {
  font-family: inherit;
  font-size: 12px;
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
.ct-ad-num { font-size: 12px; color: var(--hml-text-secondary); font-weight: 600; }

.ct-ad-body {
  padding: 12px;
  display: grid;
  grid-template-columns: 56px 1fr;
  gap: 10px;
  align-items: start;
}
.ct-ad-thumb {
  width: 56px; height: 56px;
  border-radius: 6px;
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
  font-size: 22px;
}
.ct-ad-thumb-plus { font-size: 22px; line-height: 1; }

.ct-ad-info { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.ct-ad-angle {
  font-size: 11px;
  background: rgba(94, 163, 255, 0.12);
  color: #5ea3ff;
  padding: 3px 8px;
  border-radius: 4px;
  font-weight: 600;
  align-self: flex-start;
  max-width: 100%;
}
.ct-ad-hook { font-size: 13.5px; font-weight: 500; color: var(--hml-text-primary); line-height: 1.35; }
.ct-ad-hook.muted { color: var(--hml-text-tertiary); }

.ct-ad-foot {
  border-top: 1px solid var(--hml-border-subtle);
  padding: 9px 12px;
  display: flex; justify-content: space-between;
  font-size: 12px;
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
textarea.ct-edit-text { min-height: 38px; }

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
