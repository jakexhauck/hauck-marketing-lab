import { useMemo, useState, type CSSProperties } from "react";
import { Check, Copy, Plus, Trash2, Upload, X } from "lucide-react";
import { cn } from "../../../../lib/cn";
import ConversionAssetPreview, {
  STUDIO_ACCENT,
  STUDIO_ACCENT_FG,
} from "./ConversionAssetPreview";
import { BlockInput, LineInput, SectionLabel } from "../paidads/adBuilderShared";
import {
  uploadAssetPhoto,
  useConversionAssetsQuery,
  useCreateConversionAsset,
  useDeleteConversionAsset,
  useUpdateConversionAsset,
} from "../../../../hooks/useApi";
import {
  ASSET_KINDS,
  ASSET_KIND_JOB,
  ASSET_KIND_LABELS,
  ASSET_KIND_PATHS,
  ASSET_KIND_SENT,
  COLOR_SOURCES,
  COLOR_SOURCE_LABELS,
  DEFAULT_COUPON_OFFER,
  DESIGN_SOURCES,
  DESIGN_SOURCE_LABELS,
  JOB_CAP,
  LIMITS,
  REVIEW_CAP,
  TRUST_FIELDS,
  asksForBooking,
  carryForward,
  emptyConversionAsset,
  jobIsWhole,
  needsColors,
  stepIsComplete,
  stepsFor,
  type AssetKind,
  type ConversionAsset,
  type ConversionAssetPatch,
  type Job,
  type Review,
  type WizardStepId,
} from "../../../../../functions/lib/conversionAssets";
import { buildPrompt, missingFields } from "../../../../lib/conversionAssetPrompt";

// Fulfillment > GHL > Conversion Assets.
//
// The conversion-asset skill, as a screen. Every client gets the SAME THREE
// pages, so this is not a wizard that invents a page, it is a checklist that
// fills three known ones:
//
//   recent-work        new lead, text 1    books
//   owner-story        new lead, text 2    books, and hands over the gift
//   unique-mechanism   estimate reminder   asks for NOTHING
//
// WHAT THIS SCREEN NO LONGER DOES: write the SMS. The follow-up messages are
// universal now, written once and living in GHL, so every control that captured
// one is gone. The message is not a per-client decision. The page it points at
// is, and that is all this collects.
//
// The kind is chosen by clicking a slot card, never by a step inside the
// wizard: a screen that asks again is a screen that can disagree with the card
// that was clicked.

export default function ConversionAssetPanel({
  tenantId,
  clientName,
  clientSlug,
}: {
  tenantId: string;
  clientName: string;
  clientSlug: string;
}) {
  const query = useConversionAssetsQuery(tenantId);
  const create = useCreateConversionAsset(tenantId);
  const update = useUpdateConversionAsset(tenantId);
  const remove = useDeleteConversionAsset(tenantId);

  const assets = useMemo(() => query.data?.pages ?? [], [query.data]);

  // The wizard's working copy. Null means the slots are showing. A saved row and
  // an unsaved one are the same shape, so nothing below branches on which it is
  // holding: only `id` being empty says the row has never been written.
  const [draft, setDraft] = useState<ConversionAsset | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const steps = stepsFor(draft?.kind ?? "");
  const step = steps[Math.min(stepIdx, steps.length - 1)];
  const busy = create.isPending || update.isPending;

  const patch = (fields: Partial<ConversionAsset>) => {
    setDraft((prev) => (prev ? { ...prev, ...fields } : prev));
  };

  // Everything the row carries, sent whole. One operator drives one wizard, so
  // there is no second writer to race, and sending the full set means a step
  // that quietly changed something upstream cannot be left behind.
  const asPatch = (asset: ConversionAsset): ConversionAssetPatch => ({
    kind: asset.kind,
    slug: asset.slug,
    designSource: asset.designSource,
    designRef: asset.designRef,
    colorSource: asset.colorSource,
    colors: asset.colors,
    designKitUrl: asset.designKitUrl,
    logoUrl: asset.logoUrl,
    ownerName: asset.ownerName,
    ownerPhotoUrl: asset.ownerPhotoUrl,
    storyNotes: asset.storyNotes,
    jobs: asset.jobs,
    reviews: asset.reviews,
    trust: asset.trust,
    appointmentType: asset.appointmentType,
    calendarEmbed: asset.calendarEmbed,
    status: asset.status,
  });

  // Write the draft. Creates on first save, updates after. The server's cleaned
  // answer is folded back over the draft, which is what makes a pasted
  // "williswindows.com" come back as a real URL in front of the person who
  // typed it.
  const persist = async (asset: ConversionAsset): Promise<ConversionAsset | null> => {
    setError(null);
    try {
      const res = asset.id
        ? await update.mutateAsync({ id: asset.id, patch: asPatch(asset) })
        : await create.mutateAsync(asPatch(asset));
      setDraft(res.page);
      return res.page;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this asset.");
      return null;
    }
  };

  const goNext = async () => {
    if (!draft) return;
    const saved = await persist(draft);
    if (!saved) return;
    setStepIdx((i) => Math.min(i + 1, steps.length - 1));
  };

  // Start a slot. The look, the logo and the booking are settled once per
  // client, so a second asset opens with the first one's answers already in it
  // rather than asking Jake to type the same calendar embed three times.
  const startNew = (kind: AssetKind) => {
    const sibling = assets.find((a) => a.kind && a.designSource);
    setDraft({
      ...emptyConversionAsset(tenantId, kind),
      ...(sibling ? carryForward(sibling) : {}),
    });
    setStepIdx(0);
    setError(null);
  };

  if (query.isLoading) return <div className="pk-empty">Loading conversion assets...</div>;
  if (query.isError) return <div className="pk-empty">Could not load conversion assets.</div>;

  if (!draft) {
    return (
      <AssetSlots
        assets={assets}
        clientName={clientName}
        onStart={startNew}
        onOpen={(asset) => {
          setDraft(asset);
          setStepIdx(0);
          setError(null);
        }}
        onDelete={(id) => remove.mutate({ id })}
        deleting={remove.isPending}
      />
    );
  }

  const complete = stepIsComplete(step.id, draft);
  const last = stepIdx >= steps.length - 1;

  return (
    // The Studio scope. Overriding --brand here repaints every accent inside
    // the wizard in one place, rather than threading a colour through twenty
    // components. --brand-fg goes dark because this cyan is a LIGHT fill:
    // white on it is 2.2:1 and unreadable, which is the whole reason that
    // token exists.
    // WIZARD_HEIGHT is the whole "fill the page" behaviour. The admin page is a
    // normally flowing document, so without a height this frame is a short card
    // floating in a tall page and the preview gets a few hundred pixels to draw
    // a whole landing page in. Pinned to the viewport instead, minus the chrome
    // above it, with a floor so a short laptop window does not crush it.
    //
    // Only from xl up: below that the two panes stack, and a stacked pair inside
    // a fixed height is two scrollbars fighting over one screen.
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-surface",
        "xl:flex xl:h-[calc(100vh-13rem)] xl:min-h-[34rem] xl:flex-col",
      )}
      style={{ "--brand": STUDIO_ACCENT, "--brand-fg": STUDIO_ACCENT_FG } as CSSProperties}
    >
      {/* Form left, the page drawing itself right, one frame with a divider
          down the middle. Under 1280px the preview drops below the form, where
          holding both side by side would leave the form too narrow to fill in. */}
      <div className="flex min-h-0 flex-1 flex-col xl:flex-row xl:items-stretch">
        <div className="flex min-w-0 flex-col border-border xl:w-[46%] xl:shrink-0 xl:border-r">
          <PaneHeader
            steps={steps}
            activeIdx={stepIdx}
            draft={draft}
            onJump={(i) => setStepIdx(i)}
            onClose={() => setDraft(null)}
          />

          {/* min-w-0 is load-bearing: without it a long path or a wide upload
              row stops this flex child shrinking and shoves the preview off.
              min-h-0 is the vertical twin: a flex child defaults to its content
              height, so without it the form does not scroll, it just grows and
              pushes the footer off the bottom of the frame. */}
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-5">
            <StepBody
              step={step.id}
              draft={draft}
              patch={patch}
              clientName={clientName}
              clientSlug={clientSlug}
            />
          </div>

          {error && <p className="px-5 pb-2 text-[12.5px] text-danger">{error}</p>}

          <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3.5">
            <button
              type="button"
              onClick={() => (stepIdx === 0 ? setDraft(null) : setStepIdx((i) => i - 1))}
              className="rounded-[var(--radius)] border border-border bg-bg px-4 py-2 text-[13px] font-semibold text-text transition-colors hover:border-brand"
            >
              {stepIdx === 0 ? "Cancel" : "Back"}
            </button>

            {last ? (
              <button
                type="button"
                onClick={() => void persist(draft).then((s) => s && setDraft(null))}
                disabled={busy}
                className="rounded-[var(--radius)] bg-brand px-4 py-2 text-[13px] font-semibold text-brand-fg transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {busy ? "Saving..." : "Save and close"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void goNext()}
                disabled={!complete || busy}
                className="rounded-[var(--radius)] bg-brand px-4 py-2 text-[13px] font-semibold text-brand-fg transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Saving..." : "Next"}
              </button>
            )}
          </div>
        </div>

        <ConversionAssetPreview draft={draft} clientName={clientName} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

// The three slots, in send order. This is the screen the panel opens on,
// because "which of these three does this client still not have" is the only
// question worth asking first.
function AssetSlots({
  assets,
  clientName,
  onStart,
  onOpen,
  onDelete,
  deleting,
}: {
  assets: ConversionAsset[];
  clientName: string;
  onStart: (kind: AssetKind) => void;
  onOpen: (asset: ConversionAsset) => void;
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  // Rows written before the three slots existed. They describe pages nobody can
  // place now, so they get a delete button and nothing else: opening one would
  // start a wizard that can never be completed.
  const orphans = assets.filter((a) => !a.kind);

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-[14px] font-semibold text-text">{clientName}</h3>

      <ul className="grid gap-2.5 lg:grid-cols-3">
        {ASSET_KINDS.map((kind) => {
          const existing = assets.find((a) => a.kind === kind);
          return (
            <li key={kind}>
              <button
                type="button"
                onClick={() => (existing ? onOpen(existing) : onStart(kind))}
                className="flex h-full w-full flex-col gap-2 rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:border-brand"
              >
                <span className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-text">
                    {ASSET_KIND_LABELS[kind]}
                  </span>
                  <StatusPill asset={existing} />
                </span>

                <span className="text-[12px] text-faint">{ASSET_KIND_SENT[kind]}</span>
                <span className="text-[12.5px] leading-relaxed text-muted">
                  {ASSET_KIND_JOB[kind]}
                </span>

                <span className="mt-auto flex items-center gap-2 pt-1">
                  <span className="font-data text-[11.5px] text-faint">
                    /{ASSET_KIND_PATHS[kind]}
                  </span>
                  {/* The one fact about this page that is not obvious from its
                      name, said on the card rather than discovered four steps
                      in when the Booking step is missing. */}
                  {!asksForBooking(kind) && (
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">
                      no booking
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {orphans.length > 0 && (
        <div>
          <SectionLabel>Older pages</SectionLabel>
          <ul className="flex flex-col gap-2">
            {orphans.map((asset) => (
              <li
                key={asset.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3"
              >
                <span className="min-w-0 flex-1 truncate text-[13px] text-muted">
                  {asset.slug ? `/${asset.slug}` : "Untitled"}
                </span>
                <button
                  type="button"
                  onClick={() => onDelete(asset.id)}
                  disabled={deleting}
                  aria-label={`Delete ${asset.slug || "this page"}`}
                  className="shrink-0 rounded-[var(--radius)] border border-border p-1.5 text-faint transition-colors hover:border-danger hover:text-danger disabled:opacity-60"
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StatusPill({ asset }: { asset: ConversionAsset | undefined }) {
  const label = !asset ? "not started" : asset.hasSource ? "built" : asset.status;
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide",
        asset?.hasSource
          ? "border-brand/40 text-brand"
          : asset
            ? "border-border text-muted"
            : "border-border text-faint",
      )}
    >
      {label}
    </span>
  );
}

// The rail across the top of the form pane. Dots rather than labels: the step
// name is already the heading beside them, and five words in a row read as a
// menu you are meant to choose from rather than as progress.
//
// Only steps already satisfied can be jumped to. Forward is earned.
function PaneHeader({
  steps,
  activeIdx,
  draft,
  onJump,
  onClose,
}: {
  steps: { id: WizardStepId; label: string }[];
  activeIdx: number;
  draft: ConversionAsset;
  onJump: (i: number) => void;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border px-5 py-3.5">
      <h4 className="min-w-0 truncate text-[13.5px] font-semibold text-text">
        {draft.kind ? ASSET_KIND_LABELS[draft.kind] : "Asset"}
        <span className="font-normal text-faint"> {steps[activeIdx]?.label}</span>
      </h4>

      <ol className="ml-auto flex shrink-0 items-center gap-1">
        {steps.map((s, i) => {
          const done = stepIsComplete(s.id, draft);
          const active = i === activeIdx;
          const reachable = i <= activeIdx || done;
          return (
            <li key={s.id} className="flex">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => onJump(i)}
                aria-label={`Step ${i + 1}: ${s.label}`}
                aria-current={active ? "step" : undefined}
                // A 4px dot is not a touch target, so the button keeps a real
                // one and only the bar inside it is small.
                className="group grid h-6 w-4 place-items-center disabled:cursor-default"
              >
                <span
                  className={cn(
                    "block h-[3px] w-2.5 rounded-full transition-colors",
                    active
                      ? "bg-brand"
                      : done
                        ? "bg-brand/40"
                        : "bg-border group-hover:bg-faint group-disabled:group-hover:bg-border",
                  )}
                />
              </button>
            </li>
          );
        })}
      </ol>

      <span className="shrink-0 font-data text-[11px] text-faint tnum">
        step {activeIdx + 1} / {steps.length}
      </span>

      <button
        type="button"
        onClick={onClose}
        aria-label="Close the wizard"
        className="shrink-0 rounded-[var(--radius)] border border-border p-1.5 text-faint transition-colors hover:border-brand hover:text-text"
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------

function StepBody({
  step,
  draft,
  patch,
  clientName,
  clientSlug,
}: {
  step: WizardStepId;
  draft: ConversionAsset;
  patch: (fields: Partial<ConversionAsset>) => void;
  clientName: string;
  clientSlug: string;
}) {
  switch (step) {
    case "design":
      return <DesignStep draft={draft} patch={patch} tenantId={draft.tenantId} />;
    case "content":
      return <ContentStep draft={draft} patch={patch} tenantId={draft.tenantId} />;
    case "booking":
      return <BookingStep draft={draft} patch={patch} />;
    case "link":
      return <LinkStep draft={draft} clientSlug={clientSlug} />;
    case "review":
      return <ReviewStep draft={draft} clientName={clientName} clientSlug={clientSlug} />;
    default:
      return null;
  }
}

function DesignStep({
  draft,
  patch,
  tenantId,
}: {
  draft: ConversionAsset;
  patch: (fields: Partial<ConversionAsset>) => void;
  tenantId: string;
}) {
  const askColors = needsColors(draft.designSource, draft.colorSource);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <SectionLabel>Where the look comes from</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {DESIGN_SOURCES.map((source) => (
            <button
              key={source}
              type="button"
              onClick={() => patch({ designSource: source })}
              className={cn(
                "rounded-[var(--radius)] border px-4 py-2.5 text-[13px] font-semibold transition-colors",
                draft.designSource === source
                  ? "border-brand bg-brand text-brand-fg"
                  : "border-border bg-surface text-text hover:border-brand",
              )}
            >
              {DESIGN_SOURCE_LABELS[source]}
            </button>
          ))}
        </div>
      </div>

      {draft.designSource === "website" && (
        <>
          <div>
            <SectionLabel>Their website</SectionLabel>
            <LineInput
              value={draft.designRef}
              onChange={(v) => patch({ designRef: v })}
              onBlur={() => {}}
              maxLength={LIMITS.designRef}
              ariaLabel="The website to pull the look from"
              placeholder="williswindows.com"
            />
          </div>

          {/* Lifting a site's palette and being handed exact hexes are
              different instructions, so the wizard asks which one this is. */}
          <div>
            <SectionLabel>Colours</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {COLOR_SOURCES.map((source) => (
                <button
                  key={source}
                  type="button"
                  onClick={() => patch({ colorSource: source })}
                  className={cn(
                    "rounded-[var(--radius)] border px-4 py-2.5 text-[13px] font-semibold transition-colors",
                    draft.colorSource === source
                      ? "border-brand bg-brand text-brand-fg"
                      : "border-border bg-surface text-text hover:border-brand",
                  )}
                >
                  {COLOR_SOURCE_LABELS[source]}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* A kit carries its own palette and typography, so the upload IS the
          answer and nothing else is asked. */}
      {draft.designSource === "kit" && (
        <FileField
          label="Design kit"
          hint="image, PDF or zip"
          tenantId={tenantId}
          slot="kit"
          accept="image/*,application/pdf,application/zip,.zip"
          url={draft.designKitUrl}
          onChange={(url) => patch({ designKitUrl: url })}
        />
      )}

      {askColors && <ColorPicker draft={draft} patch={patch} />}

      <FileField
        label="Logo"
        tenantId={tenantId}
        slot="logo"
        accept="image/*"
        url={draft.logoUrl}
        onChange={(url) => patch({ logoUrl: url })}
      />
    </div>
  );
}

function ColorPicker({
  draft,
  patch,
}: {
  draft: ConversionAsset;
  patch: (fields: Partial<ConversionAsset>) => void;
}) {
  const [entry, setEntry] = useState("#");

  const addColor = () => {
    const next = entry.trim();
    if (!next || next === "#") return;
    patch({ colors: [...draft.colors, next] });
    setEntry("#");
  };

  return (
    <div>
      <SectionLabel>Colours to use</SectionLabel>
      <div className="flex flex-wrap items-center gap-2">
        {draft.colors.map((color) => (
          <span
            key={color}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface py-1 pl-1.5 pr-2.5"
          >
            <span
              aria-hidden
              className="h-4 w-4 rounded-full border border-border"
              style={{ backgroundColor: color }}
            />
            <span className="font-data text-[12px] text-text">{color}</span>
            <button
              type="button"
              onClick={() => patch({ colors: draft.colors.filter((c) => c !== color) })}
              aria-label={`Remove ${color}`}
              className="text-faint transition-colors hover:text-danger"
            >
              <X size={13} aria-hidden />
            </button>
          </span>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(entry) ? entry : "#000000"}
          onChange={(e) => setEntry(e.target.value)}
          aria-label="Pick a colour"
          className="h-9 w-12 shrink-0 cursor-pointer rounded-[var(--radius)] border border-border bg-surface"
        />
        <input
          type="text"
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addColor();
            }
          }}
          maxLength={7}
          aria-label="Colour hex"
          placeholder="#4dbb83"
          className="w-32 rounded-[var(--radius)] border border-border bg-surface px-3 py-2 font-data text-[13px] text-text placeholder:text-faint focus:border-brand focus:outline-none"
        />
        <button
          type="button"
          onClick={addColor}
          className="inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-[13px] font-semibold text-text transition-colors hover:border-brand"
        >
          <Plus size={14} aria-hidden /> Add
        </button>
      </div>
    </div>
  );
}

// One upload target. Shows a thumbnail once something is there, because the
// single most useful confirmation that the right photo went into the "before"
// slot is seeing the photo in the "before" slot.
function FileField({
  label,
  hint,
  tenantId,
  slot,
  accept,
  url,
  onChange,
}: {
  label: string;
  hint?: string;
  tenantId: string;
  slot: string;
  accept: string;
  url: string;
  onChange: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const take = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await uploadAssetPhoto({ tenantId, slot, file }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  const isImage = /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(url);

  return (
    <div>
      <SectionLabel hint={hint}>{label}</SectionLabel>
      <div className="flex flex-wrap items-center gap-3">
        {url && isImage && (
          <img
            src={url}
            alt={label}
            className="h-14 w-14 shrink-0 rounded-[var(--radius)] border border-border object-cover"
          />
        )}
        {url && !isImage && (
          <span className="rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-muted">
            File attached
          </span>
        )}
        <label
          className={cn(
            "inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-[13px] font-semibold text-text transition-colors hover:border-brand",
            busy && "opacity-60",
          )}
        >
          <Upload size={14} aria-hidden />
          {busy ? "Uploading..." : url ? "Replace" : "Upload"}
          <input
            type="file"
            accept={accept}
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              void take(e.target.files?.[0]);
              // Clear it, so choosing the SAME file again after a failure
              // still fires a change event.
              e.target.value = "";
            }}
          />
        </label>
        {url && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-[12.5px] text-faint transition-colors hover:text-danger"
          >
            Remove
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-[12.5px] text-danger">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------

// The only step that differs by kind. Everything else on this screen is the
// same three questions for every client; this is where the three assets stop
// being the same page.
function ContentStep({
  draft,
  patch,
  tenantId,
}: {
  draft: ConversionAsset;
  patch: (fields: Partial<ConversionAsset>) => void;
  tenantId: string;
}) {
  if (draft.kind === "owner-story") {
    return <OwnerStoryFields draft={draft} patch={patch} tenantId={tenantId} />;
  }

  if (draft.kind === "unique-mechanism") {
    return <MechanismFields draft={draft} patch={patch} />;
  }

  return (
    <div className="flex flex-col gap-5">
      <JobsField draft={draft} patch={patch} tenantId={tenantId} />
      <ReviewsField draft={draft} patch={patch} />
      <TrustField draft={draft} patch={patch} />
    </div>
  );
}

// The page built out of positioning rather than assets.
//
// NOTHING HERE IS REQUIRED, on purpose. The client may have no photos, no
// written-down process and nothing to hand over, and the page still has to be
// buildable: what makes it work is that their process is NAMED and framed as
// unlike anyone else's, not that it is documented. Leave the name blank and the
// builder invents one from the niche.
//
// This is also why there is no fact to check. The page describes how they work,
// in their own frame. It must not claim a certification, a statistic or an
// award, and there is deliberately no field here that invites one.
const MECHANISM_PROMPTS =
  "Anything they actually do differently\nWhat the usual way gets wrong\nAnything they always do that others skip\nWords they use for their own process";

function MechanismFields({
  draft,
  patch,
}: {
  draft: ConversionAsset;
  patch: (fields: Partial<ConversionAsset>) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <SectionLabel hint="leave blank and it gets named for you">
          What the method is called
        </SectionLabel>
        <LineInput
          value={draft.mechanismName}
          onChange={(v) => patch({ mechanismName: v })}
          onBlur={() => {}}
          maxLength={LIMITS.mechanismName}
          ariaLabel="What the method is called"
          placeholder="The Coastal Seal Process"
        />
      </div>

      <div>
        <SectionLabel hint="optional, bullets are fine">Anything to steer it</SectionLabel>
        <BlockInput
          value={draft.mechanismNotes}
          onChange={(v) => patch({ mechanismNotes: v })}
          onBlur={() => {}}
          maxLength={LIMITS.mechanismNotes}
          rows={8}
          ariaLabel="Anything to steer the mechanism"
          placeholder={MECHANISM_PROMPTS}
        />
      </div>
    </div>
  );
}

// The story is NOT written here. Notes go in, the skill writes the page from
// them. A wizard box is a bad place to write prose and a worse place to keep
// it: the same notes rewritten later produce a better page than an old draft
// nobody wants to touch.
const STORY_PROMPTS =
  "Why they started\nHow long they have been doing it\nWhat they refuse to do\nWho is in the family or on the crew\nWhat they are known for locally";

function OwnerStoryFields({
  draft,
  patch,
  tenantId,
}: {
  draft: ConversionAsset;
  patch: (fields: Partial<ConversionAsset>) => void;
  tenantId: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <SectionLabel>Owner name</SectionLabel>
        <LineInput
          value={draft.ownerName}
          onChange={(v) => patch({ ownerName: v })}
          onBlur={() => {}}
          maxLength={LIMITS.ownerName}
          ariaLabel="Owner name"
          placeholder="Dave"
        />
      </div>

      <FileField
        label="Owner photo"
        hint="required"
        tenantId={tenantId}
        slot="owner"
        accept="image/*"
        url={draft.ownerPhotoUrl}
        onChange={(url) => patch({ ownerPhotoUrl: url })}
      />

      <div>
        <SectionLabel hint="bullets are fine">Notes to steer the story</SectionLabel>
        <BlockInput
          value={draft.storyNotes}
          onChange={(v) => patch({ storyNotes: v })}
          onBlur={() => {}}
          maxLength={LIMITS.storyNotes}
          rows={8}
          ariaLabel="Notes to steer the story"
          placeholder={STORY_PROMPTS}
        />
      </div>

      {/* The text that sends them here promises a gift on the website. This is
          that gift, so it is required: a page that does not hand it over is a
          broken promise the lead notices before we do. */}
      <div className="rounded-lg border border-border bg-surface-2 p-3.5">
        <SectionLabel hint="the text promises this">The gift</SectionLabel>
        <LineInput
          value={draft.couponOffer}
          onChange={(v) => patch({ couponOffer: v })}
          onBlur={() => {}}
          maxLength={LIMITS.couponOffer}
          ariaLabel="The offer"
          placeholder={DEFAULT_COUPON_OFFER}
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <SectionLabel>Code</SectionLabel>
            <LineInput
              value={draft.couponCode}
              onChange={(v) => patch({ couponCode: v })}
              onBlur={() => {}}
              maxLength={LIMITS.couponCode}
              ariaLabel="Coupon code"
              placeholder="optional"
            />
          </div>
          <div>
            <SectionLabel>Terms</SectionLabel>
            <LineInput
              value={draft.couponTerms}
              onChange={(v) => patch({ couponTerms: v })}
              onBlur={() => {}}
              maxLength={LIMITS.couponTerms}
              ariaLabel="Coupon terms"
              placeholder="optional"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// A job is a PAIR plus a line, up to five of them, and the count is stated
// rather than discovered by the Add button disappearing.
function JobsField({
  draft,
  patch,
  tenantId,
}: {
  draft: ConversionAsset;
  patch: (fields: Partial<ConversionAsset>) => void;
  tenantId: string;
}) {
  const cap = draft.kind ? JOB_CAP[draft.kind] : 0;
  const jobs = draft.jobs;

  const setJob = (idx: number, fields: Partial<Job>) => {
    patch({ jobs: jobs.map((job, i) => (i === idx ? { ...job, ...fields } : job)) });
  };
  const removeJob = (idx: number) => patch({ jobs: jobs.filter((_, i) => i !== idx) });
  // The page opens with its first row already there. There is nothing to decide
  // about whether a proof page has a job on it, so there is no reason to make
  // somebody click Add before they can do anything.
  const addJob = () => patch({ jobs: [...jobs, { before: "", after: "", caption: "" }] });
  const rows = jobs.length === 0 ? [{ before: "", after: "", caption: "" }] : jobs;

  // Writes through the synthetic first row: until something is typed into it,
  // `jobs` is still empty and there is no index to update.
  const write = (idx: number, fields: Partial<Job>) => {
    if (jobs.length === 0) {
      patch({ jobs: [{ before: "", after: "", caption: "", ...fields }] });
    } else setJob(idx, fields);
  };

  return (
    <div>
      <SectionLabel hint={`${jobs.filter(jobIsWhole).length} of ${cap}`}>The jobs</SectionLabel>

      <div className="flex flex-col gap-3">
        {rows.map((job, i) => (
          <div key={i} className="rounded-lg border border-border bg-surface-2 p-3.5">
            <div className="mb-3 flex items-center gap-2">
              <span className="font-data text-[11.5px] font-semibold text-faint tnum">
                Job {i + 1}
              </span>
              {jobs.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeJob(i)}
                  aria-label={`Remove job ${i + 1}`}
                  className="ml-auto text-faint transition-colors hover:text-danger"
                >
                  <Trash2 size={13} aria-hidden />
                </button>
              )}
            </div>

            {/* Asked for in this order and by name, so a pair cannot be stored
                the wrong way round. */}
            <div className="flex flex-col gap-3">
              <FileField
                label="Before"
                tenantId={tenantId}
                slot="before"
                accept="image/*"
                url={job.before}
                onChange={(url) => write(i, { before: url })}
              />
              <FileField
                label="After"
                tenantId={tenantId}
                slot="after"
                accept="image/*"
                url={job.after}
                onChange={(url) => write(i, { after: url })}
              />
              <div>
                <SectionLabel hint="optional">What the job was</SectionLabel>
                <LineInput
                  value={job.caption}
                  onChange={(v) => write(i, { caption: v })}
                  onBlur={() => {}}
                  maxLength={LIMITS.caption}
                  ariaLabel="What the job was"
                  placeholder="Full window clean, Cape May Court House"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {jobs.length < cap && (
        <button
          type="button"
          onClick={addJob}
          className="mt-3 inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-[13px] font-semibold text-text transition-colors hover:border-brand"
        >
          <Plus size={14} aria-hidden /> Add a job
        </button>
      )}
    </div>
  );
}

function ReviewsField({
  draft,
  patch,
}: {
  draft: ConversionAsset;
  patch: (fields: Partial<ConversionAsset>) => void;
}) {
  const reviews = draft.reviews;

  const setReview = (idx: number, fields: Partial<Review>) => {
    patch({ reviews: reviews.map((r, i) => (i === idx ? { ...r, ...fields } : r)) });
  };

  return (
    <div>
      <SectionLabel hint={`${reviews.length} of ${REVIEW_CAP}`}>Reviews</SectionLabel>

      <div className="flex flex-col gap-3">
        {reviews.map((review, i) => (
          <div key={i} className="rounded-lg border border-border bg-surface-2 p-3.5">
            <BlockInput
              value={review.text}
              onChange={(v) => setReview(i, { text: v })}
              onBlur={() => {}}
              maxLength={LIMITS.reviewText}
              rows={3}
              ariaLabel={`Review ${i + 1}`}
              placeholder="Paste what they wrote"
            />
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={review.name}
                onChange={(e) => setReview(i, { name: e.target.value })}
                maxLength={LIMITS.reviewName}
                aria-label={`Who wrote review ${i + 1}`}
                placeholder="Who wrote it"
                className="min-w-[8rem] flex-1 rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-[13px] text-text placeholder:text-faint focus:border-brand focus:outline-none"
              />
              <Stars
                value={review.stars}
                onChange={(stars) => setReview(i, { stars })}
                label={`Stars for review ${i + 1}`}
              />
              <button
                type="button"
                onClick={() => patch({ reviews: reviews.filter((_, j) => j !== i) })}
                aria-label={`Remove review ${i + 1}`}
                className="text-faint transition-colors hover:text-danger"
              >
                <Trash2 size={13} aria-hidden />
              </button>
            </div>
          </div>
        ))}
      </div>

      {reviews.length < REVIEW_CAP && (
        <button
          type="button"
          onClick={() => patch({ reviews: [...reviews, { text: "", name: "", stars: 5 }] })}
          className="mt-3 inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-[13px] font-semibold text-text transition-colors hover:border-brand"
        >
          <Plus size={14} aria-hidden /> Add a review
        </button>
      )}
    </div>
  );
}

// Clicking the star you are already on clears back to none, so a review pasted
// without a rating does not have to carry one it never had.
function Stars({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (stars: number) => void;
  label: string;
}) {
  return (
    <span className="flex shrink-0 items-center gap-0.5" role="group" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(value === n ? 0 : n)}
          aria-label={`${n} ${n === 1 ? "star" : "stars"}`}
          aria-pressed={value >= n}
          className={cn(
            "text-[15px] leading-none transition-colors",
            value >= n ? "text-brand" : "text-border hover:text-faint",
          )}
        >
          ★
        </button>
      ))}
    </span>
  );
}

// The fixed six. Same questions for every client, so a thin page is visibly
// thin rather than differently shaped. An empty field means "leave it off the
// page", which is why none of them is required.
function TrustField({
  draft,
  patch,
}: {
  draft: ConversionAsset;
  patch: (fields: Partial<ConversionAsset>) => void;
}) {
  const trust = draft.trust;

  return (
    <div>
      <SectionLabel hint="whatever is true">Trust</SectionLabel>

      <div className="flex flex-wrap gap-2">
        {(["licensed", "insured"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => patch({ trust: { ...trust, [key]: !trust[key] } })}
            aria-pressed={trust[key]}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[var(--radius)] border px-3.5 py-2 text-[13px] font-semibold capitalize transition-colors",
              trust[key]
                ? "border-brand bg-brand text-brand-fg"
                : "border-border bg-surface text-text hover:border-brand",
            )}
          >
            {trust[key] && <Check size={13} aria-hidden />}
            {key}
          </button>
        ))}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {TRUST_FIELDS.map((field) => (
          <div key={field.key}>
            <SectionLabel>{field.label}</SectionLabel>
            <LineInput
              value={trust[field.key]}
              onChange={(v) => patch({ trust: { ...trust, [field.key]: v } })}
              onBlur={() => {}}
              maxLength={LIMITS.trustValue}
              ariaLabel={field.label}
              placeholder={field.placeholder}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function BookingStep({
  draft,
  patch,
}: {
  draft: ConversionAsset;
  patch: (fields: Partial<ConversionAsset>) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <SectionLabel>What the appointment is</SectionLabel>
        <LineInput
          value={draft.appointmentType}
          onChange={(v) => patch({ appointmentType: v })}
          onBlur={() => {}}
          maxLength={LIMITS.appointmentType}
          ariaLabel="Appointment type"
          placeholder="Phone estimate"
        />
        <p className="mt-2 text-[12px] text-faint">
          Every line of the page's call to action depends on this. Willis quotes over the phone;
          the next client may send somebody out.
        </p>
      </div>

      <div>
        <SectionLabel>GHL calendar embed</SectionLabel>
        <BlockInput
          value={draft.calendarEmbed}
          onChange={(v) => patch({ calendarEmbed: v })}
          onBlur={() => {}}
          maxLength={LIMITS.calendarEmbed}
          rows={4}
          ariaLabel="GHL calendar embed code"
          placeholder="Paste the embed code from GHL"
        />
        <p className="mt-2 text-[12px] text-faint">
          The calendar sits on the page itself, so the lead reads and books in one place.
        </p>
      </div>
    </div>
  );
}

// The path is fixed by the kind and is not typed. The follow-up messages are
// universal, so one message body carries one path and only the domain in front
// of it changes per client. A per-client slug would mean editing the universal
// message per client, which is the thing being removed.
function LinkStep({ draft, clientSlug }: { draft: ConversionAsset; clientSlug: string }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <SectionLabel>The page path</SectionLabel>
        <p className="font-data text-[15px] font-semibold text-text">/{draft.slug}</p>
      </div>

      <StubBlock slug={draft.slug} clientSlug={clientSlug} />
    </div>
  );
}

// The two lines that go into the GHL page. It is the one thing on this screen
// that gets pasted somewhere else.
function StubBlock({ slug, clientSlug }: { slug: string; clientSlug: string }) {
  const mount = `${clientSlug.replace(/[^a-z0-9]/gi, "").slice(0, 6).toLowerCase()}fu`;
  const stub =
    `<div id="${mount}"></div>\n` +
    `<script src="https://app.hauckmarketing.com/sites/${clientSlug}/fu/${slug}.js"></script>`;
  return (
    <div>
      <SectionLabel>The GHL stub</SectionLabel>
      <pre className="overflow-x-auto rounded-lg border border-border bg-surface-2 p-3 font-data text-[12px] leading-relaxed text-text">
        {stub}
      </pre>
      <CopyButton text={stub} label="Copy stub" />
    </div>
  );
}

function ReviewStep({
  draft,
  clientName,
  clientSlug,
}: {
  draft: ConversionAsset;
  clientName: string;
  clientSlug: string;
}) {
  const missing = missingFields(draft);
  // The screen's whole output. It is a complete prompt rather than a summary
  // of the answers, because it gets pasted into a Claude that has no vault, no
  // skill loaded and no repo open.
  const prompt = buildPrompt(draft, clientName, clientSlug);

  return (
    <div className="flex flex-col gap-4">
      {missing.length > 0 && (
        <div className="rounded-lg border border-danger/40 bg-surface-2 p-3.5">
          <SectionLabel>Still missing</SectionLabel>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {missing.map((m) => (
              <li key={m} className="text-[13px] text-danger">
                {m}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <SectionLabel hint={`${prompt.length.toLocaleString()} characters`}>
          The prompt
        </SectionLabel>
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-surface-2 p-3.5 text-[12.5px] leading-relaxed text-text">
          {prompt}
        </pre>
        <CopyButton text={prompt} label="Copy the prompt" />
      </div>

      <StubBlock slug={draft.slug} clientSlug={clientSlug} />
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
        });
      }}
      className="mt-2 inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-[13px] font-semibold text-text transition-colors hover:border-brand"
    >
      {done ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      {done ? "Copied" : label}
    </button>
  );
}
